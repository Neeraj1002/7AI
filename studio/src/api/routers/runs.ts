import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure } from '../trpc';
import type { Context } from '../trpc';
import { findPipelineRunById, listRuns, updatePipelineRun, CANCELLED_BY_USER } from '../../models/repositories/pipeline-run.repository';
import { createRun } from '../../run-pipeline/state-machine';
import {
  listStagesForRun,
  findLatestAttempt,
  findLatestCompletedAttempt,
} from '../../models/repositories/pipeline-stage.repository';
import { isR2Configured, getPresignedDownloadUrl, getObjectText } from '../../storage/r2-client';
import { listReviewLogsForRun } from '../../models/repositories/review-log.repository';
import { findChannelById } from '../../models/repositories/channel.repository';
import { findByChannel } from '../../models/repositories/agent-credential.repository';
import { startPipelineInBackground, continuePipelineInBackground } from '../../run-pipeline/pipeline-runner';
import { requestCancellation, isCancellationRequested, isActivelyDriven } from '../../run-pipeline/cancellation-registry';
import { canResolveGate } from '../../run-pipeline/gate-ownership';
import {
  checkBudget,
  describeBudgetRefusal,
  getRemainingWeeklyUsd,
  NoBudgetConfiguredError,
} from '../../run-pipeline/budget-gate';
import { resolvePendingApproval } from '../../notifications';
import { classifyEndError, type EndReason } from '../../run-pipeline/end-reason';
import { recordPostHocTag } from '../../run-pipeline/post-hoc-tag';
import {
  MAX_MANUAL_RETRIES_PER_STAGE,
  MANUAL_RETRY_CAP_MESSAGE,
  isManualRetryCapReached,
  manualRetriesUsed,
  recordManualRetry,
  retryTargetStage,
} from '../../run-pipeline/manual-retries';
import { TTS_VOICE_KEYS } from '../../media';
import { VISUAL_SOURCES, AUDIO_LAYERS } from '../../agents/video-generation/plan';
import { PrivacyStatusSchema } from '../../agents/publishing';
import { FORMAT_KEYS, findFormat, type VideoKind } from '../../formats/manifest';
import { isValidDuration, durationErrorMessage, resolveRequestedVideoKind } from '../../formats/video-kind';
import { resolveChannelConfig } from '../../channel-profile';
import { findActiveProfileForChannel } from '../../models/repositories/channel-profile-version.repository';
import { loadResolvedConfig } from '../../run-pipeline/resolved-config';
import { buildResolvedOptions } from '../../run-pipeline/resolved-options';
import { sumUsageCostForRun } from '../../models/repositories/usage-event.repository';
import type { ChannelProfileData } from '../../channel-profile';
import { readStillsProgress } from '../../run-pipeline/stills-progress';
import { estimateRunCost } from '../../run-pipeline/cost-estimate';
import { formatChapterSheet, parseChapterSheet } from '../../agents/script-generation/long-form';
import { env } from '../../config/env';
import { PIPELINE_RUN_STATUSES, STAGE_NAMES } from '../../types';
import type { Channel, PipelineRun, PipelineStage, ReviewLog } from '../../types';
import { withQualityRows, withQualitySpec } from '../../agents/video-intelligence/quality-metrics';
import { qualityProfileFor, SHORT_PROFILE, type QualityMetrics, type QualityProfile } from '../../agents/video-generation/quality-spec';
import { deriveLongFormRunFields, LINK_TTL_SECONDS } from '../../long-form/run-fields';

// Sprint 3 Task 11 (R2/B13) — the one place that normalizes gate1/gate2's
// three different raw stage-output field names (`reason`/`privacyStatus`/
// `notes`, confirmed by direct read of state-machine.ts) into one consistent
// shape, rather than the app having to know which outcome carries which raw
// field. `gate` distinguishes gate1 vs gate2 since both can produce the same
// `outcome` values (e.g. 'reject'/'approve'). Deliberately reads from
// `stages` (already fetched by `getRunDetail` below) instead of a second DB
// round-trip.
type LastGateDecision = {
  gate: 1 | 2;
  outcome: 'approve' | 'edit' | 'reject' | 'revise';
  privacyStatus?: string;
  reason?: string;
  notes?: string;
  decidedAt: Date;
};

function completedGateStages(stages: PipelineStage[]) {
  return stages.filter(
    (s): s is PipelineStage & { stageName: 'gate1' | 'gate2' } =>
      (s.stageName === 'gate1' || s.stageName === 'gate2') && s.status === 'completed' && s.output !== null,
  );
}

function normalizeGateStage(stage: PipelineStage & { stageName: 'gate1' | 'gate2' }): LastGateDecision | null {
  const output = stage.output as { outcome?: string; reason?: string; privacyStatus?: string; notes?: string };
  if (!output.outcome) return null;
  return {
    gate: stage.stageName === 'gate1' ? 1 : 2,
    outcome: output.outcome as LastGateDecision['outcome'],
    ...(output.privacyStatus !== undefined && { privacyStatus: output.privacyStatus }),
    ...(output.reason !== undefined && { reason: output.reason }),
    ...(output.notes !== undefined && { notes: output.notes }),
    decidedAt: stage.completedAt ?? stage.updatedAt,
  };
}

function deriveLastGateDecision(stages: PipelineStage[]): LastGateDecision | null {
  // `stages` is ordered oldest-first (listStagesForRun's own orderBy) — the
  // latest completed gate1/gate2 row, whichever gate it belongs to, is
  // whichever one of these matches comes last in that order (gate2 always
  // sorts after the gate1 that necessarily preceded it on the same run).
  const gateStages = completedGateStages(stages);
  const latest = gateStages[gateStages.length - 1];
  return latest ? normalizeGateStage(latest) : null;
}

// Sprint 4 Task 12 (R2): every decided gate attempt, oldest first, same normalising as
// lastGateDecision. A gate the channel turned off still leaves a completed gate row, written with
// a `system` review log of verdict 'auto-approve' on that stage (state-machine.ts), which is how
// `decidedBy: 'auto'` is told apart from a person's decision. Absent when no gate was decided.
export type GateDecisionEntry = LastGateDecision & { decidedBy: 'user' | 'auto' };

export function deriveGateDecisions(
  stages: PipelineStage[],
  reviewLogs: Pick<ReviewLog, 'stageId' | 'agent' | 'verdict'>[],
): GateDecisionEntry[] | undefined {
  const autoStageIds = new Set(
    reviewLogs.filter((l) => l.agent === 'system' && l.verdict === 'auto-approve' && l.stageId).map((l) => l.stageId),
  );
  const entries: GateDecisionEntry[] = [];
  for (const stage of completedGateStages(stages)) {
    const decision = normalizeGateStage(stage);
    if (decision) entries.push({ ...decision, decidedBy: autoStageIds.has(stage.id) ? 'auto' : 'user' });
  }
  return entries.length > 0 ? entries : undefined;
}

// Sprint 3 Task 11 (R2/B13) — string-matching on `lastError`, not a
// structured column: a real, known fragility (a future change to any of
// these exact strings silently breaks this), stated plainly per the task's
// own instruction rather than hidden. The exact strings matched are each
// written by exactly one place: `state-machine.ts`'s gate1/gate2 reject
// paths ("Rejected at Gate 1"/"Rejected at Gate 2: <reason>"),
// `pipeline-runner.ts`'s `failRunIfChannelArchived` ("Channel deleted"), and
// `runs.cancel` (R3/B11 below) — both cancel's own gate-paused and `'running'`
// paths use this identical string, confirmed by direct read/coordinated in
// this same PR.
function deriveEndReason(run: PipelineRun): EndReason | null {
  if (run.status !== 'failed') return null;
  return classifyEndError(run.lastError);
}

// Bugs Task 10 (R1) — true while a cancel request is recorded in this process
// and the run has not ended yet (memory only; false after a restart, which is
// correct: the request was lost and the user can cancel again).
function deriveCancelRequested(run: PipelineRun): boolean {
  return isCancellationRequested(run.id) && run.status !== 'completed' && run.status !== 'failed';
}

// Bugs Task 10 (R1) — newest sign of life for a run. Neither updatedAt column
// is maintained on writes (both are @default(now()) only, never @updatedAt), so
// progress is read from the timestamps that really are written: every stage
// attempt's createdAt/startedAt/completedAt, plus the run's own startedAt.
// A single long stage therefore looks quiet from its start until it finishes;
// that is what CANCEL_STALE_AFTER_MS bounds (see cancellation-registry.ts).
function lastProgressAt(run: PipelineRun, stages: PipelineStage[]): Date {
  const stamps = [run.createdAt, run.startedAt, run.updatedAt];
  for (const s of stages) stamps.push(s.createdAt, s.startedAt, s.completedAt, s.updatedAt);
  return stamps.reduce<Date>((newest, d) => (d && d > newest ? d : newest), run.createdAt);
}

// Bugs Task 3 (R1) — this run's own tenant check, same FORBIDDEN shape as
// `create`'s (Sprint 3 Hardening) and assertGateOwnership's own convention
// below. `list`/`get` were both missed by that hardening pass — this closes
// the second of the two.
function intakeRepeatTopic(
  stages: Pick<PipelineStage, 'stageName' | 'status' | 'attemptNumber' | 'output'>[],
): { runId: string; topic: string; createdAt: string } | null {
  const intake = stages
    .filter((s) => s.stageName === 'intake' && s.status === 'completed' && s.output)
    .sort((a, b) => b.attemptNumber - a.attemptNumber)[0];
  const value = (intake?.output as { repeatTopic?: { runId: string; topic: string; createdAt: string } } | null | undefined)
    ?.repeatTopic;
  return value ?? null;
}

// The latest completed video_review attempt's qualityMetrics, with `rows` filled in from the
// stored metrics for runs measured before per-row flags existed. null when none were measured.
export function deriveQualityMetrics(
  stages: Pick<PipelineStage, 'stageName' | 'status' | 'attemptNumber' | 'input' | 'output'>[],
  profile?: QualityProfile,
  targetSeconds?: number,
): QualityMetrics | null {
  const review = stages
    .filter((s) => s.stageName === 'video_review' && s.status === 'completed')
    .sort((a, b) => b.attemptNumber - a.attemptNumber)[0];
  const metrics = (review?.output as { qualityMetrics?: QualityMetrics } | null | undefined)?.qualityMetrics;
  if (!review || !metrics) return null;
  const source = (review.input as { visualSource?: string } | null | undefined)?.visualSource;
  const withRows = withQualityRows(metrics, source === 'ai-stills' || source === 'stock-footage' ? source : undefined, profile);
  // Sprint 4 Task 12 (R6): the numbers the checks used, and the Length row of a long video.
  return withQualitySpec(withRows, profile ?? SHORT_PROFILE, targetSeconds);
}

// Sprint 4 Task 2: the latest completed script_review attempt's concerns and
// violations plus the run's explicit sources. null before any review exists.
export function deriveScriptReview(
  run: Pick<PipelineRun, 'creationOptions'>,
  stages: Pick<PipelineStage, 'stageName' | 'status' | 'attemptNumber' | 'output'>[],
) {
  const latest = stages
    .filter((s) => s.stageName === 'script_review' && s.status === 'completed' && s.output)
    .sort((a, b) => b.attemptNumber - a.attemptNumber)[0];
  if (!latest) return null;
  const out = latest.output as { factualConcerns?: string[]; styleGuideViolations?: string[] };
  return {
    factualConcerns: out.factualConcerns ?? [],
    styleGuideViolations: out.styleGuideViolations ?? [],
    sources: run.creationOptions?.sources ?? [],
    // Sprint 4 Task 5 (B16): the non-blocking repeat-topic warning, stored on the
    // intake stage output (not only in the Gate 1 message). null when none.
    repeatTopic: intakeRepeatTopic(stages),
  };
}

// Sprint 4 Task 9 (PR A): the long-form fields the app reads from runs.get. They are typed now and
// stay absent until the work that produces them lands (PR B / Task 10): previewUrl and the
// subtitles fields are never faked.
export type LongFormRunFields = {
  // `text` from the script; `startSec` once the video is rendered (Task 10).
  chapters?: { title: string; text?: string; startSec?: number }[];
  // Gate 1 edit sheet for a long script: each chapter as "## Title" then its text. Saving an edit
  // parses the "##" lines back into chapters.
  scriptEditText?: string;
  previewUrl?: string;
  videoUrl?: string;
  subtitlesUrl?: string;
  subtitlesUploaded?: boolean;
  subtitlesMessage?: string;
};

// The chapters of the latest completed script_generation attempt; absent for a Short or
// before a long script exists.
export function deriveChapters(
  stages: Pick<PipelineStage, 'stageName' | 'status' | 'attemptNumber' | 'output'>[],
): { title: string; text: string }[] | undefined {
  const latest = stages
    .filter((s) => s.stageName === 'script_generation' && s.status === 'completed' && s.output)
    .sort((a, b) => b.attemptNumber - a.attemptNumber)[0];
  const chapters = (latest?.output as { chapters?: unknown } | null | undefined)?.chapters;
  if (!Array.isArray(chapters) || chapters.length === 0) return undefined;
  const valid = chapters.filter(
    (c): c is { title: string; text: string } =>
      typeof c === 'object' && c !== null && typeof (c as { title?: unknown }).title === 'string' && typeof (c as { text?: unknown }).text === 'string',
  );
  return valid.length > 0 ? valid.map((c) => ({ title: c.title, text: c.text })) : undefined;
}

function badRequest(message: string): never {
  throw new TRPCError({ code: 'BAD_REQUEST', message });
}

// Sprint 4 Task 9 (R1/R1b/R7): everything runs.create and runs.estimateCost both decide about the
// video type and length, in one place so the two cannot disagree.
async function resolveVideoRequest(
  channel: Channel,
  input: { videoKind?: VideoKind; targetDurationSec?: number; formatKey?: string },
): Promise<{
  videoKind: VideoKind;
  targetSeconds: number;
  secondsPerStill: number | null;
  offeredFormatKeys: string[];
  profile: ChannelProfileData | null;
}> {
  const { videoKind, conflict } = resolveRequestedVideoKind(input);
  if (conflict) {
    badRequest(`That format is a ${findFormat(input.formatKey)?.videoKind} format, but the video type is ${videoKind}`);
  }
  if (input.targetDurationSec !== undefined && !isValidDuration(videoKind, input.targetDurationSec)) {
    badRequest(durationErrorMessage(videoKind));
  }
  const profile = (await findActiveProfileForChannel(channel.id))?.data ?? null;
  const config = resolveChannelConfig({
    profile,
    legacyStyleGuide: channel.styleGuide,
    legacyDefaultVoice: channel.defaultVoice,
    runOverrideTargetSeconds: input.targetDurationSec,
    runOverrideVideoKind: videoKind,
    formatKey: input.formatKey,
  });
  return {
    videoKind,
    targetSeconds: config.targetSeconds,
    secondsPerStill: config.visualSecondsPerStill,
    offeredFormatKeys: config.offeredFormatKeys,
    profile,
  };
}

async function getRunDetail(id: string, ctx: Context) {
  const run = await findPipelineRunById(id);
  if (!run) {
    throw new TRPCError({ code: 'NOT_FOUND', message: `PipelineRun ${id} not found` });
  }
  if (run.tenantId !== ctx.tenantId) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: `You are not allowed to view run ${id}`,
    });
  }
  const [channel, stages, reviewLogs, spentUsd] = await Promise.all([
    findChannelById(run.channelId),
    listStagesForRun(id),
    listReviewLogsForRun(id),
    sumUsageCostForRun(id),
  ]);
  // Sprint 3 Task 11 (R2/B13) — computed at read time, not stored (no schema
  // change): both derive purely from data `getRunDetail` already fetched.
  // Sprint 3 Task 12 (R6, optional) — plain existence checks, not a
  // presigned-URL mint (that stays `runs.getVideoUrl`'s own explicit call,
  // since minting one on every `runs.get` poll would be wasteful).
  // Sprint 4 Task 9 (R1): the run's own snapshotted profile, so the chip "Video · 10 min" reads
  // the same values the pipeline does.
  const resolved = await loadResolvedConfig(run, channel ?? { styleGuide: null, defaultVoice: null });
  const scriptChapters = deriveChapters(stages);
  const longForm: LongFormRunFields = { chapters: scriptChapters };
  if (scriptChapters === undefined) delete longForm.chapters;
  else longForm.scriptEditText = formatChapterSheet(scriptChapters);
  // Sprint 4 Task 10 (R3.2): preview/video/subtitle links, subtitle upload result and chapter starts,
  // for a long run only. Links are signed for 24 hours, like runs.getVideoUrl; a Short gets none.
  if (resolved.videoKind === 'long') {
    Object.assign(
      longForm,
      await deriveLongFormRunFields({
        runId: id,
        stages,
        scriptChapters,
        sign: isR2Configured() ? (key) => getPresignedDownloadUrl({ key, expiresInSeconds: LINK_TTL_SECONDS }) : undefined,
      }),
    );
  }
  const gateDecisions = deriveGateDecisions(stages, reviewLogs);
  return {
    run,
    channel,
    stages,
    reviewLogs,
    videoKind: resolved.videoKind,
    targetSeconds: resolved.targetSeconds,
    ...longForm,
    lastGateDecision: deriveLastGateDecision(stages),
    // Sprint 4 Task 12 (R2): every decided gate, oldest first; absent when none was decided.
    ...(gateDecisions && { gateDecisions }),
    // Sprint 4 Task 12 (R3): everything this run has spent (all stages and attempts), USD to 4 decimals,
    // and the run's spend limit when it has one.
    spentUsd: Math.round(spentUsd * 10000) / 10000,
    ...(run.creationOptions?.maxCostUsd !== undefined && { maxCostUsd: run.creationOptions.maxCostUsd }),
    // Sprint 4 Task 12 (R1): the settings the run used and where each came from; absent on older runs.
    ...(run.creationOptions?.resolvedOptions && { resolvedOptions: run.creationOptions.resolvedOptions }),
    // Sprint 4 Task 2: what the Gate 1 screen shows beyond the score, in one
    // stable place (derived from stage output and creationOptions, not stored).
    scriptReview: deriveScriptReview(run, stages),
    // Gate 2 quality checks of the latest completed video_review, with per-row warn flags
    // (qualityMetrics.rows.<row>.warn). null when the run has no measured metrics.
    qualityMetrics: deriveQualityMetrics(
      stages,
      resolved.videoKind === 'long' ? qualityProfileFor('long', resolved.visualSecondsPerStill) : undefined,
      resolved.targetSeconds,
    ),
    endReason: deriveEndReason(run),
    cancelRequested: deriveCancelRequested(run),
    // Bugs Task 12 (R1) - the app adds a Details line ("Switched to AI stills after stock footage failed review").
    videoFallbackUsed: run.creationOptions?.videoFallbackUsed === true,
    // Bugs Task 12 (R2) - the app disables Retry / Revise (with the reason under them) at the cap.
    manualRetry: {
      max: MAX_MANUAL_RETRIES_PER_STAGE,
      retryStage: retryTargetStage(run),
      retryUsed: run.currentStage ? manualRetriesUsed(run, retryTargetStage(run) ?? run.currentStage) : 0,
      retryCapReached: (() => {
        const stage = retryTargetStage(run);
        return stage ? isManualRetryCapReached(run, stage) : false;
      })(),
      reviseCapReached: isManualRetryCapReached(run, 'video_generation'),
      message: MANUAL_RETRY_CAP_MESSAGE,
    },
    hasR2Draft: stages.some(
      (s) => s.stageName === 'video_generation' && Boolean((s.output as { r2DraftKey?: string } | null)?.r2DraftKey),
    ),
    hasR2Bundle: stages.some(
      (s) => s.stageName === 'video_generation' && Boolean((s.output as { r2ManifestKey?: string } | null)?.r2ManifestKey),
    ),
    hasR2Final: stages.some(
      (s) => s.stageName === 'publishing' && Boolean((s.output as { r2FinalKey?: string } | null)?.r2FinalKey),
    ),
  };
}

// Sprint 3 Task 2 (K1) — the gate-ownership check gate1/gate2 both run
// before ever calling resolvePendingApproval. Looks up the run/channel
// itself rather than trusting a client-supplied channelId, so there's no
// way to spoof ownership by lying about which channel a gate belongs to.
// The actual allow/deny decision is canResolveGate (run-pipeline/gate-ownership.ts),
// kept pure and separate so it can be unit tested directly.
async function assertGateOwnership(runId: string, ctx: Context): Promise<Channel> {
  const run = await findPipelineRunById(runId);
  if (!run) {
    throw new TRPCError({ code: 'NOT_FOUND', message: `PipelineRun ${runId} not found` });
  }
  const channel = await findChannelById(run.channelId);
  if (!channel) {
    throw new TRPCError({ code: 'NOT_FOUND', message: `Channel for run ${runId} not found` });
  }

  if (!canResolveGate(ctx, channel)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: `You are not allowed to resolve gates for run ${runId}`,
    });
  }
  return channel;
}

// Bugs Task 8 (R1) + Sprint 3 Task 8 (R3) — the two checks every real path to
// starting a run must apply: an archived channel is retired for good, and an
// unlinked channel would spend the whole pipeline's LLM/TTS/footage budget
// only to fail at the very last stage. Extracted so Sprint 3 Task 11
// (R4/B12)'s `rerun` applies the exact same checks `create` already does,
// against the same channel, rather than a second copy that could drift.
async function assertChannelCanRun(channel: Channel): Promise<void> {
  if (!channel.isActive) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: `Channel ${channel.id} is archived` });
  }
  if (!(await findByChannel(channel.id))) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Channel "${channel.name}" isn't connected to YouTube yet — connect it before starting a run`,
    });
  }
}

export const runsRouter = router({
  // POST /runs — BUSINESS_LOGIC.md Section 2. Creates the row, then drives it
  // in the background (pipeline-runner.ts) rather than leaving it sitting at
  // 'pending' forever — nothing else in this codebase currently starts a
  // 'pending' run on its own (resume-on-startup.ts only ever resumes
  // 'running' ones).
  create: publicProcedure
    .input(
      z.object({
        channelId: z.string().uuid(),
        briefText: z.string().min(1),
        // Sprint 2 Task 1 (D2) — an explicit, structured choice, validated
        // against media/registry.ts's known TTS_VOICES keys right here at
        // the API edge (Failure Modes: reject bad structured input at the
        // edge, not deep in the pipeline). Never passed through
        // parse-brief.ts's LLM call — that's the whole point of this field
        // existing separately from briefText.
        voice: z.enum(TTS_VOICE_KEYS).optional(),
        // Sprint 2 Task 2 (E2) — same edge-validation posture as voice:
        // rejected here (a structured tRPC input error) if it doesn't match
        // a real visualSource, never passed through as free text for
        // parse-brief.ts or the planning LLM to interpret loosely.
        visualSource: z.enum(VISUAL_SOURCES).optional(),
        // Sprint 2 Task 3 (F1) — same edge-validation posture as
        // voice/visualSource: rejected here if it doesn't match a real mood
        // tag (or "none"), never passed through as free text.
        audioLayer: z.enum(AUDIO_LAYERS).optional(),
        // Sprint 3 Task 9 (R4) — same edge-validation posture as
        // voice/visualSource/audioLayer above.
        // Sprint 4 Task 9 (R1): a Short is 30/45/60; a long video is whole minutes from 120 to 900.
        // The exact rule depends on videoKind, so it is checked in the mutation, not here.
        targetDurationSec: z.number().int().optional(),
        // Sprint 4 Task 9 (R1): default 'short'. Inferred from formatKey when only that is sent.
        videoKind: z.enum(['short', 'long']).optional(),
        // Sprint 4 Task 2 (R5): explicit sources only, folded into creationOptions.
        sources: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
        // Sprint 4 Task 6: validated against the format manifest at the edge.
        formatKey: z.enum(FORMAT_KEYS).optional(),
        // Sprint 4 Task 9 (R7): per-video spend limit in USD for a long video; default is the
        // suggested value from runs.estimateCost. Stored now, enforced during the run in PR B.
        maxCostUsd: z.number().positive().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const channel = await findChannelById(input.channelId);
      if (!channel) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Channel ${input.channelId} not found` });
      }
      // Sprint 3 Hardening — closes KNOWN_ISSUES_AND_BLOCKERS.md §3's real,
      // live-demonstrated gap: nothing previously stopped a signed-in
      // session from creating a run against a *different* tenant's channel
      // if it knew that channel's id. Mirrors assertGateOwnership's own
      // FORBIDDEN shape/message convention (below) rather than inventing a
      // second authorization-error style for the same class of check —
      // creation-time ownership, not resolution-time (Task 2/K1, already
      // closed).
      if (channel.tenantId !== ctx.tenantId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: `You are not allowed to create a run against channel ${input.channelId}`,
        });
      }
      await assertChannelCanRun(channel);

      // Sprint 4 Task 9 (R1/R1b/R5.3/R7): video type, length, offered formats, spend limit.
      const request = await resolveVideoRequest(channel, input);
      const isLong = request.videoKind === 'long';
      if (input.formatKey && request.offeredFormatKeys.length > 0 && !request.offeredFormatKeys.includes(input.formatKey)) {
        badRequest('That format is not offered by this channel');
      }
      if (isLong && input.visualSource === 'stock-footage') {
        badRequest('Long videos use AI stills only; stock footage is not available for them');
      }
      if (!isLong && input.maxCostUsd !== undefined) {
        badRequest('A spend limit can only be set for a long video');
      }
      let maxCostUsd: number | undefined;
      if (isLong) {
        const estimate = estimateRunCost({
          videoKind: 'long',
          targetSeconds: request.targetSeconds,
          secondsPerStill: request.secondsPerStill,
        });
        maxCostUsd = input.maxCostUsd ?? estimate.suggestedMaxUsd;
        if (maxCostUsd > env.LONGFORM_MAX_RUN_USD_LIMIT) {
          badRequest(`The spend limit cannot be more than $${env.LONGFORM_MAX_RUN_USD_LIMIT.toFixed(2)} per video`);
        }
        if (maxCostUsd < estimate.estimateUsd) {
          badRequest(
            `Spend limit $${maxCostUsd.toFixed(2)} is below the estimated $${estimate.estimateUsd.toFixed(2)} for this video`,
          );
        }
        // R7.2: one attempt must fit in what this channel may still spend this week.
        let remaining: number;
        try {
          remaining = await getRemainingWeeklyUsd(channel.tenantId, channel.id, channel.platform);
        } catch (err) {
          if (err instanceof NoBudgetConfiguredError) badRequest('No weekly budget is configured for this account');
          throw err;
        }
        if (estimate.estimateUsd > remaining) {
          badRequest(`Estimated $${estimate.estimateUsd.toFixed(2)} for this video, $${remaining.toFixed(2)} left this week for this channel`);
        }
      }

      // Sprint 4 Task 12 (R1): the settings this run will use and where each came from, written once
      // with the picks. Built from what the user picked, before any default is filled in.
      const resolvedOptions = buildResolvedOptions({
        picks: { ...input, videoKind: request.videoKind },
        profile: request.profile,
        legacyStyleGuide: channel.styleGuide,
        legacyDefaultVoice: channel.defaultVoice,
      });
      const creationOptions = {
        ...(input.voice && { voice: input.voice }),
        ...(input.visualSource && { visualSource: input.visualSource }),
        ...(input.audioLayer && { audioLayer: input.audioLayer }),
        // A long run stores the resolved length (default 600), so every stage reads one value.
        ...((isLong || input.targetDurationSec) && { targetDurationSec: isLong ? request.targetSeconds : input.targetDurationSec }),
        ...(isLong && { videoKind: 'long' as const }),
        ...(maxCostUsd !== undefined && { maxCostUsd }),
        ...(input.sources?.length && { sources: input.sources }),
        ...(input.formatKey && { formatKey: input.formatKey }),
        resolvedOptions,
      };
      // Sprint 3 Task 1 (J3) — the real signed-in session's tenant, never
      // MVP_TENANT_ID. Now guaranteed to match channel.tenantId by the
      // check above (Sprint 3 Hardening).
      const run = await createRun({
        tenantId: ctx.tenantId,
        channelId: input.channelId,
        briefText: input.briefText,
        creationOptions,
      });
      startPipelineInBackground(run.id);
      return run;
    }),

  // Sprint 4 Task 9 (R7): the brief screen's cost preview. Same channel ownership check as create;
  // read-only (writes nothing). suggestedMaxUsd is what runs.create uses when maxCostUsd is omitted.
  estimateCost: publicProcedure
    .input(
      z.object({
        channelId: z.string().uuid(),
        videoKind: z.enum(['short', 'long']),
        targetDurationSec: z.number().int().optional(),
        options: z.object({ secondsPerStill: z.number().min(1).max(10).optional() }).optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const channel = await findChannelById(input.channelId);
      if (!channel) badRequest(`Channel ${input.channelId} not found`);
      if (channel.tenantId !== ctx.tenantId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: `You are not allowed to estimate a run for channel ${input.channelId}` });
      }
      const request = await resolveVideoRequest(channel, input);
      const estimate = estimateRunCost({
        videoKind: request.videoKind,
        targetSeconds: request.targetSeconds,
        secondsPerStill: input.options?.secondsPerStill ?? request.secondsPerStill,
      });
      let remainingWeeklyUsd: number;
      try {
        remainingWeeklyUsd = await getRemainingWeeklyUsd(channel.tenantId, channel.id, channel.platform);
      } catch (err) {
        if (err instanceof NoBudgetConfiguredError) badRequest('No weekly budget is configured for this account');
        throw err;
      }
      return {
        estimateUsd: estimate.estimateUsd,
        worstCaseUsd: estimate.worstCaseUsd,
        suggestedMaxUsd: estimate.suggestedMaxUsd,
        remainingWeeklyUsd,
      };
    }),

  // GET /runs — Queue screen (Task 2): filterable by status/stage.
  // Bugs Task 3 (R1) — tenant-scoped: ctx.tenantId always threaded through,
  // same as `create`'s own tenant check. Previously queried every tenant's
  // runs unconditionally.
  list: publicProcedure
    .input(
      z.object({
        statuses: z.array(z.enum(PIPELINE_RUN_STATUSES)).optional(),
        stage: z.enum(STAGE_NAMES).optional(),
        channelId: z.string().uuid().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const runs = await listRuns({ ...input, tenantId: ctx.tenantId });
      return runs.map((run) => ({ ...run, cancelRequested: deriveCancelRequested(run) }));
    }),

  // GET /runs/:id — full detail: run + channel + full stage history +
  // review logs (script, video, gate decisions all live here).
  get: publicProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ input, ctx }) => {
    return getRunDetail(input.id, ctx);
  }),

  // Sprint 3 Task 11 (R5, optional) — a lighter poll target than refetching
  // all of `runs.get` (full stage history + review logs) every few seconds
  // while a run is actively progressing. `attemptNo` reflects the current
  // stage's own latest attempt specifically (not just "the most recently
  // touched stage row overall", which could be a different, already-finished
  // stage if the current one hasn't started its first attempt yet). No
  // `pct` — this pipeline has no meaningful notion of percent-through-a-stage
  // today (a stage is either not started, running, or done), so it's left
  // genuinely absent rather than a fabricated number.
  progress: publicProcedure.input(z.object({ runId: z.string().uuid() })).query(async ({ input, ctx }) => {
    const run = await findPipelineRunById(input.runId);
    if (!run) {
      throw new TRPCError({ code: 'NOT_FOUND', message: `PipelineRun ${input.runId} not found` });
    }
    if (run.tenantId !== ctx.tenantId) {
      throw new TRPCError({ code: 'FORBIDDEN', message: `You are not allowed to view run ${input.runId}` });
    }
    const currentStageAttempt = run.currentStage ? await findLatestAttempt(input.runId, run.currentStage) : null;
    // Sprint 4 Task 12 (R4): while the stills of a video are being made, how many are finished and
    // how many are planned. Absent for every other stage, and before the first count is stored.
    const stills =
      run.currentStage === 'video_generation' && currentStageAttempt?.status === 'running'
        ? readStillsProgress(currentStageAttempt.output)
        : undefined;
    return { stage: run.currentStage, attemptNo: currentStageAttempt?.attemptNumber ?? null, ...stills };
  }),

  // Sprint 3 Task 12 (R5) — mints a fresh 24h presigned R2 URL on demand, so
  // another Claude session with no device/SSH access to the VPS can fetch a
  // generated video directly (a curl/fetch, no app, no session needed — see
  // reports/task12.md for the exact invocation shape). Same tenant-scoping
  // pattern `get`/`progress` already use, not `assertGateOwnership` (this is
  // a plain read, not a gate resolution). Never persists the minted URL —
  // fresh every call, so a stale, leaked link simply expires.
  getVideoUrl: publicProcedure
    .input(
      z.object({
        runId: z.string().uuid(),
        // Only meaningful for variant:'draft' — a specific attempt's own
        // upload, not "the latest." Ignored for variant:'final' (there's
        // only ever one).
        attemptNumber: z.number().int().positive().optional(),
        variant: z.enum(['draft', 'final']).optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const run = await findPipelineRunById(input.runId);
      if (!run) {
        throw new TRPCError({ code: 'NOT_FOUND', message: `PipelineRun ${input.runId} not found` });
      }
      if (run.tenantId !== ctx.tenantId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: `You are not allowed to view run ${input.runId}` });
      }
      if (!isR2Configured()) {
        return { available: false as const };
      }

      let variant = input.variant;
      let key: string | undefined;

      if (variant === 'final' || !variant) {
        const publishingStage = await findLatestCompletedAttempt(input.runId, 'publishing');
        const r2FinalKey = (publishingStage?.output as { r2FinalKey?: string } | undefined)?.r2FinalKey;
        if (r2FinalKey) {
          variant = 'final';
          key = r2FinalKey;
        } else if (variant === 'final') {
          // Explicitly asked for 'final' and there isn't one — don't
          // silently fall back to a draft the caller didn't ask for.
          return { available: false as const };
        }
      }

      if (!key) {
        // Either variant:'draft' was explicit, or omitted-variant found no
        // final and is falling back to the latest (or a specific) draft.
        variant = 'draft';
        const stages = await listStagesForRun(input.runId);
        const draftStage = input.attemptNumber
          ? stages.find((s) => s.stageName === 'video_generation' && s.attemptNumber === input.attemptNumber)
          : [...stages].reverse().find((s) => s.stageName === 'video_generation' && s.status === 'completed');
        key = (draftStage?.output as { r2DraftKey?: string } | undefined)?.r2DraftKey;
      }

      if (!key) {
        return { available: false as const };
      }

      const expiresInSeconds = 24 * 60 * 60;
      const url = await getPresignedDownloadUrl({ key, expiresInSeconds });
      const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
      return { available: true as const, variant, url, expiresAt };
    }),

  // Sprint 3 Task 13 (R4) — presigned URLs for every file in an attempt's
  // debug bundle (see storage/attempt-bundle.ts). Same tenant scoping as
  // getVideoUrl. Defaults to the latest video_generation attempt that has a
  // manifest; "no manifest" (never uploaded, or upload interrupted) is
  // { available: false }, not an error.
  getAttemptBundle: publicProcedure
    .input(z.object({ runId: z.string().uuid(), attemptNumber: z.number().int().positive().optional() }))
    .query(async ({ input, ctx }) => {
      const run = await findPipelineRunById(input.runId);
      if (!run) {
        throw new TRPCError({ code: 'NOT_FOUND', message: `PipelineRun ${input.runId} not found` });
      }
      if (run.tenantId !== ctx.tenantId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: `You are not allowed to view run ${input.runId}` });
      }
      if (!isR2Configured()) {
        return { available: false as const };
      }

      const stages = await listStagesForRun(input.runId);
      type BundleOutput = { r2ManifestKey?: string; r2BundlePrefix?: string };
      const withManifest = stages.filter(
        (s) => s.stageName === 'video_generation' && Boolean((s.output as BundleOutput | null)?.r2ManifestKey),
      );
      const stage = input.attemptNumber
        ? withManifest.find((s) => s.attemptNumber === input.attemptNumber)
        : withManifest[withManifest.length - 1];
      const manifestKey = (stage?.output as BundleOutput | undefined)?.r2ManifestKey;
      if (!stage || !manifestKey) {
        return { available: false as const };
      }

      const manifest = JSON.parse(await getObjectText(manifestKey)) as {
        files: Array<{ name: string; key: string; contentType: string; bytes: number }>;
      };
      const expiresInSeconds = 24 * 60 * 60;
      const files = await Promise.all(
        manifest.files.map(async (f) => ({
          name: f.name,
          contentType: f.contentType,
          bytes: f.bytes,
          url: await getPresignedDownloadUrl({ key: f.key, expiresInSeconds }),
        })),
      );
      const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
      return { available: true as const, attemptNumber: stage.attemptNumber, manifest, files, expiresAt };
    }),

  // POST /runs/:id/gate1 — resolves a pending Gate 1 through the same
  // resolution primitive every NotificationChannel shares
  // (resolvePendingApproval), converting the structured action into the exact
  // raw reply-string grammar agents/gate1/index.ts's parseGateReply already
  // parses (approve / "reject <reason>" / free text = edit) — no duplicate
  // parsing logic here.
  gate1: publicProcedure
    .input(
      z.discriminatedUnion('action', [
        z.object({ runId: z.string().uuid(), action: z.literal('approve') }),
        z.object({ runId: z.string().uuid(), action: z.literal('reject'), reason: z.string().min(1) }),
        z.object({ runId: z.string().uuid(), action: z.literal('edit'), editedScriptText: z.string().min(1) }),
      ]),
    )
    .mutation(async ({ input, ctx }) => {
      await assertGateOwnership(input.runId, ctx);

      // Sprint 4 Task 9 (R2.5): a long script is edited as "## Title" chapter sections; refuse an edit
      // that does not parse into at least 3 chapters before it reaches the pipeline.
      if (input.action === 'edit') {
        const editedRun = await findPipelineRunById(input.runId);
        if (editedRun?.creationOptions?.videoKind === 'long') {
          const parsed = parseChapterSheet(input.editedScriptText);
          if (!parsed.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: parsed.message });
        }
      }

      const replyText =
        input.action === 'approve'
          ? 'approve'
          : input.action === 'reject'
            ? `reject ${input.reason}`
            : input.editedScriptText;

      const { resolved } = resolvePendingApproval(input.runId, { reply: replyText, userId: ctx.userId });
      if (!resolved) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Gate 1 for run ${input.runId} is not currently pending (already resolved, or not open yet)`,
        });
      }
      return { resolved: true };
    }),

  // POST /runs/:id/gate2 — same pattern as gate1, against
  // agents/gate2/index.ts's parseGate2Reply grammar (approve / "reject
  // <reason>" / free text = revision notes).
  gate2: publicProcedure
    .input(
      z.discriminatedUnion('action', [
        z.object({
          runId: z.string().uuid(),
          action: z.literal('approve'),
          // Sprint 3 Task 8 (R1) — optional per-approval visibility choice;
          // omitted means the channel's own defaultPrivacyStatus applies.
          privacyStatus: PrivacyStatusSchema.optional(),
        }),
        z.object({ runId: z.string().uuid(), action: z.literal('reject'), reason: z.string().min(1) }),
        z.object({ runId: z.string().uuid(), action: z.literal('revise'), notes: z.string().min(1) }),
      ]),
    )
    .mutation(async ({ input, ctx }) => {
      const channel = await assertGateOwnership(input.runId, ctx);

      // Sprint 3 Task 8 (R1) — always send an explicit `approve <privacy>`
      // (matches parseGate2Reply's APPROVE_WITH_PRIVACY exactly): the explicit
      // choice wins, else the channel's own default — never a bare 'approve'.
      const replyText =
        input.action === 'approve'
          ? `approve ${input.privacyStatus ?? channel.defaultPrivacyStatus}`
          : input.action === 'reject'
            ? `reject ${input.reason}`
            : input.notes;

      // Bugs Task 12 (R2/R5a) - a Revise starts a new video attempt: it is counted by the manual cap
      // (not the automatic regeneration cap) and refused up front, with the reason, at that cap or
      // when the budget gate would refuse the render. A refused Revise creates no attempt and does
      // not count.
      let reviseRun: PipelineRun | null = null;
      if (input.action === 'revise') {
        reviseRun = await findPipelineRunById(input.runId);
        if (reviseRun && isManualRetryCapReached(reviseRun, 'video_generation')) {
          throw new TRPCError({ code: 'CONFLICT', message: MANUAL_RETRY_CAP_MESSAGE });
        }
        const budget = await checkBudget(channel.tenantId, channel.id, channel.platform);
        if (!budget.ok) {
          throw new TRPCError({ code: 'CONFLICT', message: describeBudgetRefusal(budget) });
        }
      }

      const { resolved } = resolvePendingApproval(input.runId, { reply: replyText, userId: ctx.userId });
      if (!resolved) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Gate 2 for run ${input.runId} is not currently pending (already resolved, or not open yet)`,
        });
      }
      if (reviseRun) await recordManualRetry(reviseRun, 'video_generation');
      return { resolved: true };
    }),

  // Bugs Task 7 (R3) — a needs_attention run had no way out from the app
  // (three separate tester reports: "no way to resolve it", "how do you
  // cancel", "stuck at a run which does nothing"). retry re-enters the
  // runner at the run's currentStage (the stage that escalated) — each
  // runXStage starts a fresh attempt, and the budget gate/circuit breakers
  // still apply exactly as on a first attempt. Same ownership check as the
  // gates: moving a run forward or killing it is at least as sensitive.
  retry: publicProcedure
    .input(z.object({ runId: z.string().uuid(), maxCostUsd: z.number().positive().optional() }))
    .mutation(async ({ input, ctx }) => {
    const channel = await assertGateOwnership(input.runId, ctx);
    // Same rule as create — the runner would only re-fail it as 'Channel deleted'.
    if (!channel.isActive) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: `Channel ${channel.id} is archived — cancel this run instead` });
    }
    const run = await findPipelineRunById(input.runId);
    if (!run || run.status !== 'needs_attention') {
      throw new TRPCError({
        code: 'CONFLICT',
        message: `Run ${input.runId} can only be retried from Needs attention (it is '${run?.status}')`,
      });
    }
    if (!run.currentStage) {
      throw new TRPCError({ code: 'CONFLICT', message: `Run ${input.runId} has no stage to retry` });
    }
    // Flip to 'running' first — the runner loop exits immediately on
    // needs_attention.
    // Bugs Task 9 (R4) — a regen-cap escalation parks at currentStage
    // 'video_review'; re-reviewing the same video just hits the cap again
    // (18a5e2f5). Retry means "make one more video": step back to
    // video_generation, which feeds the latest review's fix notes forward.
    // Bugs Task 12 (R5b) - Retry restarts the stage that actually failed and never re-runs a gate: a
    // run parked at gate2 retries video_generation, at gate1 script_generation. (Re-running gate2
    // here is what created the orphan 'running' gate attempt of 2026-10-10.)
    const target = retryTargetStage(run);
    if (!target) {
      throw new TRPCError({ code: 'CONFLICT', message: `Run ${input.runId} has no stage to retry` });
    }
    // Bugs Task 12 (R2) - counted per stage; the 4th manual Retry is refused with the reason.
    if (isManualRetryCapReached(run, target)) {
      throw new TRPCError({ code: 'CONFLICT', message: MANUAL_RETRY_CAP_MESSAGE });
    }
    const regenCapped = target !== run.currentStage;
    // Bugs Closure R1 — a Retry that would be refused by the budget gate at
    // once only creates another skipped attempt and bounces back to Needs
    // attention (reports "I retried 10 times"). Say why instead, with the numbers.
    const retryStage = target;
    if (retryStage === 'script_generation' || retryStage === 'video_generation') {
      const budget = await checkBudget(run.tenantId, channel.id, channel.platform);
      if (!budget.ok) {
        throw new TRPCError({ code: 'CONFLICT', message: describeBudgetRefusal(budget) });
      }
    }
    // Sprint 4 Task 9 (R7.3): a run stopped at its spend limit can be retried with a higher one.
    let newMaxCostUsd: number | undefined;
    if (input.maxCostUsd !== undefined) {
      if (run.creationOptions?.videoKind !== 'long') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'A spend limit can only be set for a long video' });
      }
      if (input.maxCostUsd > env.LONGFORM_MAX_RUN_USD_LIMIT) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `The spend limit cannot be more than $${env.LONGFORM_MAX_RUN_USD_LIMIT.toFixed(2)} per video` });
      }
      newMaxCostUsd = input.maxCostUsd;
    }
    // Only a Retry that really starts a new attempt counts (budget refusal threw above).
    await recordManualRetry(run, target);
    const updated = await updatePipelineRun(run.id, {
      status: 'running',
      lastError: null,
      ...(regenCapped && { currentStage: target }),
      ...(newMaxCostUsd !== undefined && { creationOptionsMerge: { maxCostUsd: newMaxCostUsd } }),
    });
    continuePipelineInBackground(run.id);
    return updated;
  }),

  // Sprint 3 Task 11 (R4/B12) — a dead-end run (rejected/cancelled/failed —
  // any ended run, not status-restricted the way `retry` is) can be re-run:
  // a brand new PipelineRun with the exact same channel/briefText/
  // creationOptions as the source, driven through the exact same
  // create-then-drive path `create`'s own mutation uses. Same ownership
  // check as retry/cancel; the source run's own channel gets the identical
  // `assertChannelCanRun` checks `create` applies to a client-supplied one —
  // reused, not re-implemented, so an archived/disconnected channel is
  // rejected with the exact same messages either mutation would give.
  rerun: publicProcedure.input(z.object({ runId: z.string().uuid() })).mutation(async ({ input, ctx }) => {
    const channel = await assertGateOwnership(input.runId, ctx);
    const sourceRun = await findPipelineRunById(input.runId);
    if (!sourceRun) {
      throw new TRPCError({ code: 'NOT_FOUND', message: `PipelineRun ${input.runId} not found` });
    }
    await assertChannelCanRun(channel);
    // Bugs Task 12 - a new run starts at zero: drop the run-owned bookkeeping, keep the user's picks.
    const picks = sourceRun.creationOptions
      ? (({ manualRetries: _m, videoFallbackUsed: _v, resolvedOptions: _r, ...kept }) => kept)(sourceRun.creationOptions)
      : undefined;
    // Sprint 4 Task 12 (R1): recomputed against the channel's current profile. A long run stores its
    // resolved length, so the length counts as a pick only if the source said it was one.
    const sourceLength = sourceRun.creationOptions?.resolvedOptions?.targetSeconds;
    const lengthWasPicked = sourceLength ? sourceLength.from === 'run' : picks?.videoKind !== 'long';
    const profile = (await findActiveProfileForChannel(channel.id))?.data ?? null;
    const resolvedOptions = buildResolvedOptions({
      picks: { ...picks, targetDurationSec: lengthWasPicked ? picks?.targetDurationSec : undefined },
      profile,
      legacyStyleGuide: channel.styleGuide,
      legacyDefaultVoice: channel.defaultVoice,
    });
    const run = await createRun({
      tenantId: ctx.tenantId,
      channelId: sourceRun.channelId,
      briefText: sourceRun.briefText,
      creationOptions: { ...picks, resolvedOptions },
    });
    startPipelineInBackground(run.id);
    return run;
  }),

  // Cancel = the existing terminal 'failed' status with an explicit reason
  // (no new status value → no schema/enum change). A run paused at a gate is
  // cancelled through that gate's own reject path so the blocked
  // runGate1Stage/runGate2Stage call records it and returns.
  // Sprint 3 Task 11 (R3/B11) — a genuinely 'running' run is now cancellable
  // too, via the cancellation-registry: recorded and returned immediately,
  // not blocked on pipeline-runner.ts's loop actually noticing (it checks
  // once per iteration — see cancellation-registry.ts's own comment on why
  // an in-memory, restart-losable registry is an accepted tradeoff here).
  cancel: publicProcedure.input(z.object({ runId: z.string().uuid() })).mutation(async ({ input, ctx }) => {
    await assertGateOwnership(input.runId, ctx);
    const run = await findPipelineRunById(input.runId);
    if (!run) {
      throw new TRPCError({ code: 'NOT_FOUND', message: `PipelineRun ${input.runId} not found` });
    }
    // Bugs Task 10 (R1) — already ended: idempotent, never an error. Only a run
    // that really ended as a cancel is reported as cancelled, so the app
    // never shows a false "Run cancelled" for a completed/otherwise failed run.
    if (run.status === 'completed' || run.status === 'failed') {
      return { cancelled: deriveEndReason(run) === 'cancelled', immediate: false, alreadyEnded: true };
    }
    // Bugs Task 13: once approved, a run at publishing (the upload) or analytics (the stats snapshot right
    // after it) has a video that is live or about to be; ending it as "Cancelled" would misreport it.
    if (run.status === 'running' && (run.currentStage === 'publishing' || run.currentStage === 'analytics')) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'This run is publishing - the video is already on its way to YouTube, so it can no longer be cancelled.',
      });
    }
    if (run.status === 'paused_gate1' || run.status === 'paused_gate2') {
      if (resolvePendingApproval(run.id, { reply: `reject ${CANCELLED_BY_USER}`, userId: ctx.userId }).resolved) {
        return { cancelled: true, immediate: true, alreadyEnded: false };
      }
      // Gate not registered in this process (e.g. mid-restart) — fall through
      // to the direct write; the stale gate attempt is harmless once failed.
    } else if (run.status === 'running' || run.status === 'pending') {
      requestCancellation(run.id);
      // A loop that is genuinely driving the run reads the registry at its
      // next step. If none is (stalled, died, hung past the stale threshold,
      // server restarted), nobody will — end the run now. The registry entry
      // stays so a stalled loop that wakes later stops at its next check.
      const stages = await listStagesForRun(run.id);
      if (isActivelyDriven(run.id, lastProgressAt(run, stages))) {
        return { cancelled: true, immediate: false, alreadyEnded: false };
      }
    } else if (run.status !== 'needs_attention') {
      throw new TRPCError({
        code: 'CONFLICT',
        message: `Run ${input.runId} can't be cancelled while '${run.status}'`,
      });
    }
    await updatePipelineRun(run.id, { status: 'failed', lastError: CANCELLED_BY_USER });
    return { cancelled: true, immediate: true, alreadyEnded: false };
  }),

  // POST /runs/:id/tag-post-hoc — Sprint 3 Task 7 (O4). Replaces the old
  // bot-only `tag <runId> <word> [notes]` text command (Sprint 2 Task 6)
  // with a real in-app equivalent — same ownership check as gate1/gate2
  // (attaching a post-hoc quality tag to a run is at least as sensitive as
  // resolving one of its gates), same underlying write
  // (run-pipeline/post-hoc-tag.ts's recordPostHocTag — a ReviewLog row with
  // agent: 'founder-post-hoc' — reused directly, not re-implemented). `tag`
  // is normalized the exact same way the old text-command parser did
  // (lowercased, truncated to 50 chars) so a tag submitted through the app
  // produces the identical DB row shape the old text-command path produced.
  tagPostHoc: publicProcedure
    .input(z.object({ runId: z.string().uuid(), tag: z.string().min(1), notes: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      await assertGateOwnership(input.runId, ctx);

      const result = await recordPostHocTag({
        runId: input.runId,
        tag: input.tag.toLowerCase().slice(0, 50),
        notes: (input.notes ?? '').trim(),
      });
      if (!result.ok) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: result.error });
      }
      return result.reviewLog;
    }),
});
