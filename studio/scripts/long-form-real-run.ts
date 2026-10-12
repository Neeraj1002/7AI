// Sprint 4 Task 9: operator tool for the real long-form test. Creates one long-form run on the dev
// database, drives it through intake, script, review, Gate 1 (approved directly, as dry-run.ts does),
// video generation and video review, and stops at Gate 2 without approving. Prints what the task
// asks to be recorded. It spends real money (a 2-minute video is about $0.40):
//   npx tsx scripts/long-form-real-run.ts [seconds=120]
import { prisma } from '../src/models/prisma-client';
import { MVP_TENANT_ID } from '../src/types';
import {
  createRun,
  runIntakeStage,
  runScriptGenerationStage,
  runScriptReviewStage,
  runVideoGenerationStage,
  runVideoReviewStage,
} from '../src/run-pipeline/state-machine';
import { completeStage, createStageAttempt, findLatestAttempt, findLatestCompletedAttempt } from '../src/models/repositories/pipeline-stage.repository';
import { updatePipelineRun } from '../src/models/repositories/pipeline-run.repository';
import { estimateRunCost } from '../src/run-pipeline/cost-estimate';
import { getRemainingWeeklyUsd } from '../src/run-pipeline/budget-gate';

const BRIEF = `A 2-minute explainer: how the Eiffel Tower was built, and why it was not torn down.
Use only these facts:
- The tower was built for the 1889 World's Fair in Paris, which marked 100 years since the French Revolution.
- It was designed at the engineering company of Gustave Eiffel; the first sketch came from Maurice Koechlin and Emile Nouguier.
- Construction took 2 years, 2 months and 5 days, from 1887 to 1889, and the tower opened on 31 March 1889.
- It is made of 18,038 pieces of wrought iron held together by 2.5 million rivets.
- At 300 metres it was the tallest man-made structure in the world until the Chrysler Building passed it in 1930.
- Its permit was for 20 years, after which the city could have dismantled it.
- Eiffel saved it by turning it into a scientific tool: he used it for meteorological and aerodynamic experiments and a radio antenna, so the city kept it.
Chapters should follow: why build it, how it went up, why it was almost lost, why it stayed.`;

const SOURCES = ['https://www.toureiffel.paris/en/the-monument/history', 'https://en.wikipedia.org/wiki/Eiffel_Tower'];

async function main(): Promise<void> {
  const seconds = Number(process.argv[2] ?? 120);
  const channel =
    (await prisma.channel.findFirst({ where: { tenantId: MVP_TENANT_ID, isActive: true } })) ??
    (await prisma.channel.create({
      data: { tenantId: MVP_TENANT_ID, platform: 'youtube', name: 'Dry-run test channel', nicheDescription: 'Week 1 dry-run fixture' },
    }));
  const estimate = estimateRunCost({ videoKind: 'long', targetSeconds: seconds });
  const remaining = await getRemainingWeeklyUsd(channel.tenantId, channel.id, 'youtube');
  console.log(`[real-run] channel ${channel.id}; estimate $${estimate.estimateUsd}, worst case $${estimate.worstCaseUsd}, suggested limit $${estimate.suggestedMaxUsd}, left this week $${remaining.toFixed(2)}`);
  if (estimate.estimateUsd > remaining) throw new Error('Not enough weekly budget left for one attempt; stopping before spending anything.');

  const existingRunId = process.argv[3];
  const run = existingRunId
    ? { id: existingRunId }
    : await createRun({
    tenantId: channel.tenantId,
    channelId: channel.id,
    briefText: BRIEF,
    creationOptions: {
      videoKind: 'long',
      targetDurationSec: seconds,
      formatKey: 'chaptered-explainer',
      sources: SOURCES,
      maxCostUsd: estimate.suggestedMaxUsd,
    },
  });
  const runId = run.id;
  const resuming = Boolean(existingRunId);
  console.log(`[real-run] runId=${runId}`);
  const t0 = Date.now();
  const mark = (label: string) => console.log(`[real-run] ${label} at +${((Date.now() - t0) / 1000).toFixed(0)}s`);

  if (!resuming) {
  await runIntakeStage(runId);
  mark('intake done');
  await runScriptGenerationStage(runId);
  mark('script_generation done');
  // Script review may loop back into a fresh generation (auto-retry); follow it until Gate 1.
  for (let i = 0; i < 4; i += 1) {
    const current = await runScriptReviewStage(runId);
    mark(`script_review done -> ${current.status}/${current.currentStage}`);
    if (current.status === 'paused_gate1') break;
    if (current.status === 'running' && current.currentStage === 'script_generation') {
      await runScriptGenerationStage(runId);
      continue;
    }
    throw new Error(`Run stopped at ${current.status}/${current.currentStage}: ${current.lastError}`);
  }
  }

  // Gate 1 is approved by writing the same rows the gate's own approve path writes (as the
  // "Gate 1 disabled" auto-approve does). The normal route opens a notification, which needs the admin
  // migration (users.isPlatformAdmin) that this dev database has not had applied.
  const script = await findLatestCompletedAttempt(runId, 'script_generation');
  const out = script?.output as { scriptText: string; chapters?: unknown[] } | null;
  if (!out) throw new Error('No script to approve');
  const gate = await createStageAttempt({ pipelineRunId: runId, stageName: 'gate1', attemptNumber: ((await findLatestAttempt(runId, 'gate1'))?.attemptNumber ?? 0) + 1, input: { scriptText: out.scriptText } });
  await completeStage(gate.id, { outcome: 'approve', sanctionedScriptText: out.scriptText, ...(out.chapters && { chapters: out.chapters }) });
  await updatePipelineRun(runId, { status: 'running', currentStage: 'video_generation' });
  mark('gate1 approved (direct)');

  const gen = await runVideoGenerationStage(runId);
  mark(`video_generation done -> ${gen.status}/${gen.currentStage}`);
  if (gen.status !== 'running') throw new Error(`video_generation stopped: ${gen.status} ${gen.lastError}`);
  const review = await runVideoReviewStage(runId);
  mark(`video_review done -> ${review.status}/${review.currentStage}`);
  console.log(`[real-run] finished. runId=${runId} status=${review.status} stage=${review.currentStage}`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
