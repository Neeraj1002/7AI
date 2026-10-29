import { resolveAiVisualsPurpose, resolveImagePricing } from '../ai-visuals/registry';
import { makeLlmRetryGuard } from './llm-retry-guard';
import { llmUsageRows, failureUsageEvents } from './stage-failure';
import { isRunSpendLimitReached } from './run-budget';
import { checkBudget } from './budget-gate';
import { loadResolvedConfig } from './resolved-config';
import { readChapterTimings } from '../long-form/artifacts';
import { insertUsageEvent, sumUsageCostForRun } from '../models/repositories/usage-event.repository';
import { listStagesForRun, patchStageOutput } from '../models/repositories/pipeline-stage.repository';
import { buildPackaging, scriptHashOf, PACKAGING_OUTPUT_VERSION, type PackagingOutput } from '../packaging/build';
import { RENDER_MAX, RENDER_MIN } from '../packaging/constants';
import type { ScriptChapterText } from '../packaging/prompts';
import type { Channel, PipelineRun, PipelineStage } from '../types';

// Sprint 6 Task 1 (R1 to R3): builds the curiosity packages for a long video while Gate 2 opens, and keeps them on
// the Gate 2 stage row's output as `packaging`. Why there: pipeline_stages.stageName has a CHECK constraint
// (migration 20260907122134), so a stage of its own would need a migration; the gate row already survives a restart,
// is reused when Gate 2 is re-opened, and is what publishing reads. A Revise opens a new Gate 2 row, which takes the
// finished packaging over from the previous one (the script has not changed) instead of paying for it again.
//
// Packaging never stops a run: any failure is recorded as a status and Gate 2 opens with YouTube's suggested
// thumbnail as the fallback.

export const PACKAGING_KEY = 'packaging';

export function readPackaging(output: unknown): PackagingOutput | null {
  const p = (output as { packaging?: PackagingOutput } | null | undefined)?.packaging;
  return p && p.version === PACKAGING_OUTPUT_VERSION && typeof p.status === 'string' ? p : null;
}

// What the run's spend limit leaves for pictures, in whole images. Text calls are cheap and are checked by the
// retry guard; images are the cost. The real price of a still comes from the same pricing table the stills use.
export function imagesAllowedBySpend(params: { limitUsd: number | undefined; spentUsd: number; imageUsd: number; textReserveUsd: number }): number {
  if (params.limitUsd === undefined) return RENDER_MAX;
  const room = params.limitUsd - params.spentUsd - params.textReserveUsd;
  if (room <= 0 || isRunSpendLimitReached(params.spentUsd, params.limitUsd)) return 0;
  return Math.max(0, Math.min(RENDER_MAX, Math.floor(room / params.imageUsd)));
}

const TEXT_RESERVE_USD = 0.1;

// R10 rule 2: whether a second round may spend. Pure so it is tested: the channel budget, the run's own limit, and the run's
// retry allowance (the whole run's spend, retries included) must all leave room for the text calls and at least two pictures.
export function roundTwoRoomFor(p: {
  budgetOk: boolean;
  limitUsd?: number;
  allowanceUsd?: number;
  spentUsd: number;
  imageUsd: number;
  textReserveUsd: number;
}): { ok: boolean; imagesAllowed: number; reason: string | null } {
  if (!p.budgetOk) return { ok: false, imagesAllowed: 0, reason: "the channel's spending limit is reached" };
  const caps = [p.limitUsd, p.allowanceUsd].filter((c): c is number => typeof c === 'number');
  const imagesAllowed = caps.length === 0 ? RENDER_MAX : imagesAllowedBySpend({ limitUsd: Math.min(...caps), spentUsd: p.spentUsd, imageUsd: p.imageUsd, textReserveUsd: p.textReserveUsd });
  if (imagesAllowed < RENDER_MIN) {
    const which = p.allowanceUsd !== undefined && (p.limitUsd === undefined || p.allowanceUsd <= p.limitUsd) ? "the run's retry allowance" : "the run's spend limit";
    return { ok: false, imagesAllowed, reason: `${which} leaves no room for another round of pictures` };
  }
  return { ok: true, imagesAllowed, reason: null };
}

type GateRow = Pick<PipelineStage, 'id' | 'output'>;

// completeStage replaces a stage's output wholesale, so Gate 2 re-attaches what it holds when it records its decision.
export async function packagingFieldOf(runId: string, gateStageId: string): Promise<{ packaging?: PackagingOutput }> {
  const row = (await listStagesForRun(runId)).find((s) => s.id === gateStageId);
  const packaging = readPackaging(row?.output);
  return packaging ? { packaging } : {};
}

export async function ensurePackagingForGate2(params: {
  run: PipelineRun;
  channel: Channel;
  gateRow: GateRow;
  scriptText: string;
  chapters?: ScriptChapterText[];
  videoGenOutput: unknown;
}): Promise<PackagingOutput | null> {
  const { run, channel, gateRow } = params;
  const config = await loadResolvedConfig(run, channel);
  // PR A covers the long video. A Short's package is its title, hook and first frame (Task 1 PR C).
  if (config.videoKind !== 'long') return null;

  const look = { stylePrompt: config.visualStylePrompt, titleGuidance: config.titleGuidance };
  const hash = scriptHashOf(params.scriptText, look);

  const own = readPackaging(gateRow.output);
  // 'building' is an interrupted attempt: it is resumed below, never returned as an answer.
  if (own && own.scriptHash === hash && own.status !== 'skipped' && own.status !== 'building') return own;

  // A Revise opens a new Gate 2 row: take the earlier finished work over when the script is the same.
  const earlier = (await listStagesForRun(run.id))
    .filter((s) => s.stageName === 'gate2' && s.id !== gateRow.id)
    .map((s) => readPackaging(s.output))
    .reverse()
    .find((p) => p && p.scriptHash === hash && p.status !== 'skipped' && p.status !== 'building');
  if (earlier) {
    await patchStageOutput(gateRow.id, { [PACKAGING_KEY]: earlier });
    return earlier;
  }

  const save = async (partial: Partial<PackagingOutput>) => {
    const current = readPackaging((await listStagesForRun(run.id)).find((s) => s.id === gateRow.id)?.output) ?? ({} as Partial<PackagingOutput>);
    await patchStageOutput(gateRow.id, { [PACKAGING_KEY]: { version: PACKAGING_OUTPUT_VERSION, scriptHash: hash, status: 'building', ...current, ...partial } });
  };

  try {
    const budget = await checkBudget(run.tenantId, channel.id, channel.platform);
    if (!budget.ok) return await finish(save, 'skipped', 'The channel\'s spending limit is reached, so no thumbnail pictures were made.', hash);
    const imageUsd = resolveImagePricing(resolveAiVisualsPurpose('still-generation').model).perImageUsd * 1.5;
    const spentUsd = await sumUsageCostForRun(run.id);
    const imagesAllowed = imagesAllowedBySpend({ limitUsd: run.creationOptions?.maxCostUsd, spentUsd, imageUsd, textReserveUsd: TEXT_RESERVE_USD });

    const resume = readPackaging((await listStagesForRun(run.id)).find((s) => s.id === gateRow.id)?.output);
    const built = await buildPackaging({
      runId: run.id,
      scriptText: params.scriptText,
      briefText: run.briefText,
      chapters: params.chapters,
      chapterTimings: readChapterTimings(params.videoGenOutput),
      look,
      imagesAllowed,
      retryGuard: makeLlmRetryGuard(run),
      resume: resume && resume.scriptHash === hash ? resume : undefined,
      hooks: {
        onText: async (label, calls, meta) => {
          for (const call of calls) {
            for (const row of llmUsageRows(call)) {
              // The second round's calls are marked, so they show as their own usage rows under the run's retry allowance.
              await insertUsageEvent({
                tenantId: run.tenantId, channelId: run.channelId, pipelineRunId: run.id, stageId: gateRow.id, agent: `packaging-${label}`,
                ...row, ...(meta?.round === 2 && { metadata: { ...(row.metadata ?? {}), packagingRound: 2 } }),
              });
            }
          }
        },
        onImage: async (info) => {
          await insertUsageEvent({
            tenantId: run.tenantId,
            channelId: run.channelId,
            pipelineRunId: run.id,
            stageId: gateRow.id,
            agent: 'packaging-thumbnail',
            provider: 'openai',
            model: info.model,
            costUsd: info.costUsd.toFixed(6),
            metadata: { part: 'thumbnail', packageId: info.packageId, ...(info.round === 2 && { packagingRound: 2 }) },
          });
        },
        checkpoint: async (partial) => {
          await save({ ...partial, scriptHash: hash });
        },
        roundTwoRoom: async () => {
          const budget = await checkBudget(run.tenantId, channel.id, channel.platform);
          return roundTwoRoomFor({
            budgetOk: budget.ok,
            limitUsd: run.creationOptions?.maxCostUsd,
            allowanceUsd: run.creationOptions?.retryAllowanceUsd,
            spentUsd: await sumUsageCostForRun(run.id),
            imageUsd,
            textReserveUsd: TEXT_RESERVE_USD,
          });
        },
      },
    });
    await save(built);
    return built;
  } catch (error) {
    for (const spent of failureUsageEvents(error)) {
      if (Number(spent.costUsd) > 0) {
        await insertUsageEvent({ tenantId: run.tenantId, channelId: run.channelId, pipelineRunId: run.id, stageId: gateRow.id, agent: 'packaging-failed-call', ...spent });
      }
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[packaging] run ${run.id}: packaging failed, Gate 2 opens with YouTube's suggested thumbnail - ${message}`);
    return await finish(save, 'failed', `Packaging failed: ${message.slice(0, 300)}`, hash);
  }
}

async function finish(save: (p: Partial<PackagingOutput>) => Promise<void>, status: PackagingOutput['status'], reason: string, hash: string): Promise<PackagingOutput> {
  const partial: Partial<PackagingOutput> = { version: PACKAGING_OUTPUT_VERSION, scriptHash: hash, status, reason };
  await save(partial);
  return {
    version: PACKAGING_OUTPUT_VERSION, status, reason, scriptHash: hash, brief: null, faceMode: null, typeface: null, titleLimit: 0,
    concepts: [], dropped: [], packages: [], textCostUsd: 0, imageCostUsd: 0,
  };
}
