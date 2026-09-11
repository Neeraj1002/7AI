import { listRunsByStatus, updatePipelineRun } from '../models/repositories/pipeline-run.repository';
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
  runAnalyticsStage,
} from './state-machine';
import { env } from '../config/env';
import type { PipelineRun, PipelineStage, StageName } from '../types';

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
  analytics: runAnalyticsStage,
};

// B2 fix — the moment a stage last changed: `completedAt` for a finished
// stage, else `startedAt` for one still `running`, falling back to
// `createdAt` (always present) if somehow neither is set.
function latestStageTimestamp(stage: PipelineStage): Date {
  return stage.completedAt ?? stage.startedAt ?? stage.createdAt;
}

function staleAgeMs(stage: PipelineStage): number {
  return Date.now() - latestStageTimestamp(stage).getTime();
}

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

    // B2 fix (KNOWN_ISSUES_AND_BLOCKERS.md §2) — a run whose latest stage
    // hasn't moved in longer than RESUME_STALE_WINDOW_MS is not
    // auto-resumed. This is exactly the scenario that bit Week 4 Task 4 for
    // real: two genuine leftover Week 3 test runs sitting at
    // currentStage='publishing' since before any resumer existed for that
    // stage got swept up and completed for real the moment one was wired
    // in. A distinctly-prefixed lastError (not a budget/circuit-breaker/
    // quality escalation message) makes this reachable by log grep and by a
    // human deciding whether the run is actually abandoned or worth a
    // manual `resumer(run.id)` call.
    const ageMs = staleAgeMs(latestStage);
    if (ageMs > env.RESUME_STALE_WINDOW_MS) {
      const ageMinutes = Math.round(ageMs / 60_000);
      const windowMinutes = Math.round(env.RESUME_STALE_WINDOW_MS / 60_000);
      const message = `[stale-resume-skip] latest stage '${latestStage.stageName}' (${latestStage.status}) last changed ${ageMinutes}m ago, past the ${windowMinutes}m staleness window — not re-executed automatically`;
      console.log(`[resume] run ${run.id}: ${message}`);
      await updatePipelineRun(run.id, { status: 'needs_attention', lastError: message });
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
