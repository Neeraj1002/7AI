import { listRunsByStatus } from '../models/repositories/pipeline-run.repository';
import { findLatestStageForRun } from '../models/repositories/pipeline-stage.repository';
import {
  runIntakeStage,
  runScriptGenerationStage,
  runScriptReviewStage,
  runGate1Stage,
  runVideoGenerationStage,
  runVideoReviewStage,
  runGate2Stage,
  runPublishingStage,
} from './state-machine';
import type { PipelineRun, StageName } from '../types';

// Idempotent resume — BUSINESS_LOGIC.md Section 1. On process start, for every
// PipelineRun with status = 'running', look at its latest PipelineStage:
//   - status = 'completed' -> resume at the next stage (Week 1 only had
//     `intake` real, so this branch was unreachable; Week 2 Task 7 is what
//     makes it real, now that script_generation/script_review/gate1 exist).
//   - status = 'running'   -> the process died mid-stage; re-run that same
//     stage from its persisted input rather than assuming partial work
//     happened.
//
// A run sitting at `paused_gate1` is NOT picked up here (only `status =
// running` is queried) — a restart while waiting on a Telegram reply does not
// automatically reopen the gate. That's a deliberate scope boundary, not an
// oversight: re-sending a gate message on every restart would be surprising
// founder-facing behavior, and nothing schedules a re-check yet this week.
const STAGE_RESUMERS: Partial<Record<StageName, (runId: string) => Promise<PipelineRun>>> = {
  intake: runIntakeStage,
  script_generation: runScriptGenerationStage,
  script_review: runScriptReviewStage,
  gate1: runGate1Stage,
  video_generation: runVideoGenerationStage,
  video_review: runVideoReviewStage,
  gate2: runGate2Stage,
  // publishing's resumer is safe against a mid-upload crash specifically
  // because runPublishingStage itself checks for an already-checkpointed
  // youtubeVideoId before ever calling uploadVideo again — see its own
  // comment in state-machine.ts. Nothing extra is needed here.
  publishing: runPublishingStage,
};

export async function resumeOnStartup(): Promise<void> {
  const runningRuns = await listRunsByStatus('running');
  if (runningRuns.length === 0) {
    console.log('[resume] no running PipelineRuns found on startup');
    return;
  }

  for (const run of runningRuns) {
    const latestStage = await findLatestStageForRun(run.id);

    if (!latestStage) {
      // Shouldn't happen given persist-before-advance, but recover rather than
      // leave the run stuck forever.
      console.log(`[resume] run ${run.id}: status=running but no stage rows exist — starting intake`);
      await runIntakeStage(run.id);
      continue;
    }

    if (latestStage.status === 'running') {
      console.log(
        `[resume] run ${run.id}: stage '${latestStage.stageName}' (attempt ${latestStage.attemptNumber}) was mid-flight when the process stopped — re-running it from its persisted input`,
      );
      const resumer = STAGE_RESUMERS[latestStage.stageName];
      if (resumer) {
        await resumer(run.id);
      } else {
        console.log(
          `[resume] run ${run.id}: no processor wired up for stage '${latestStage.stageName}' yet — leaving as-is`,
        );
      }
      continue;
    }

    if (latestStage.status === 'completed') {
      const nextResumer = run.currentStage ? STAGE_RESUMERS[run.currentStage] : undefined;
      if (nextResumer) {
        console.log(
          `[resume] run ${run.id}: latest stage '${latestStage.stageName}' already completed — resuming at '${run.currentStage}'`,
        );
        await nextResumer(run.id);
      } else {
        console.log(
          `[resume] run ${run.id}: latest stage '${latestStage.stageName}' already completed — currentStage='${run.currentStage}' has no processor wired up yet`,
        );
      }
      continue;
    }

    console.log(
      `[resume] run ${run.id}: latest stage '${latestStage.stageName}' is '${latestStage.status}' — no automatic resume action defined for this state`,
    );
  }
}
