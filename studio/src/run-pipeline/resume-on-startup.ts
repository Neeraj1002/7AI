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
// Week 5 Task 3 (restart-safe gates): a run sitting at `paused_gate1`/
// `paused_gate2` is ALSO picked up here now, in a second pass below. This
// used to be a deliberate scope boundary (re-sending a gate message on every
// restart would be surprising founder-facing behavior, and nothing
// schedules a re-check) — now closed: `PipelineRun.status` staying
// `paused_gate1`/`paused_gate2` across a crash was always durable, but the
// in-memory `pendingByThreadKey` map (`notifications/pending-approvals.ts`)
// that the app's gate1/gate2 API call resolves against lived only in the
// crashed process's memory. Without re-establishing it, a paused run was
// stranded forever — no reply could ever reach it again.
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
  await resumeRunningRuns();
  await reopenPausedGates();
}

async function resumeRunningRuns(): Promise<void> {
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

// Week 5 Task 3 — the fix this task adds. Re-invokes the matching gate
// function for every run parked at `paused_gate1`/`paused_gate2`. Each of
// `runGate1Stage`/`runGate2Stage` already knows (state-machine.ts) to reuse
// the existing 'running' gate attempt rather than create a new one, so this
// is safe to call on every boot regardless of whether the gate was actually
// affected by a crash — re-sending the prompt and re-registering the pending
// reply is exactly what needs to happen either way.
//
// Deliberately fire-and-forget (not awaited per-run): requestGate1Decision/
// requestGate2Decision block on a real human reply, sometimes for hours.
// resumeOnStartup() itself must return promptly so the rest of main()'s
// boot sequence (the periodic background checkers, the API server)
// actually starts — otherwise a single pending gate would block the whole
// orchestrator from ever coming back up, and then nothing could ever
// answer it. The gate resolution proceeds in the background exactly as it
// would have if the process had never restarted.
async function reopenPausedGates(): Promise<void> {
  const pausedGate1Runs = await listRunsByStatus('paused_gate1');
  for (const run of pausedGate1Runs) {
    console.log(
      `[resume] run ${run.id}: was paused at Gate 1 when the process stopped — re-opening it in the background`,
    );
    void runGate1Stage(run.id).catch((error) => {
      console.error(`[resume] run ${run.id}: error re-opening Gate 1:`, error);
    });
  }

  const pausedGate2Runs = await listRunsByStatus('paused_gate2');
  for (const run of pausedGate2Runs) {
    console.log(
      `[resume] run ${run.id}: was paused at Gate 2 when the process stopped — re-opening it in the background`,
    );
    void runGate2Stage(run.id).catch((error) => {
      console.error(`[resume] run ${run.id}: error re-opening Gate 2:`, error);
    });
  }

  if (pausedGate1Runs.length === 0 && pausedGate2Runs.length === 0) {
    console.log('[resume] no paused_gate1/paused_gate2 PipelineRuns found on startup');
  }
}
