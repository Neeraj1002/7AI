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
import { continuePipelineInBackground } from './pipeline-runner';
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
  // The publishing resumer enters the same durable run-level claim and
  // existing-session reconciliation path as a manual Retry.
  publishing: runPublishingStage,
  analytics: runAnalyticsStage,
};

// B2 fix — the moment a stage last changed: `completedAt` for a finished
// stage, else `startedAt` for one still `running`, falling back to
// `createdAt` (always present) if somehow neither is set.
function latestStageTimestamp(stage: PipelineStage): Date {
  return stage.completedAt ?? stage.startedAt ?? stage.createdAt;
}

// Sprint 4 Task 9 (R5.6): a long-form video_generation stage legitimately runs for tens of minutes
// (about 24 min of image generation for 10 minutes of video, up to 36 for 15, plus the render), and its
// stage row is only touched when it starts. With the default 30-minute window a restart in the middle
// of it would park the run instead of resuming it from the stills cache and finished chapters.
export const LONG_FORM_RESUME_STALE_WINDOW_MS = 3 * 60 * 60 * 1000;

export function resumeStaleWindowMs(run: Pick<PipelineRun, 'creationOptions'>, stage: Pick<PipelineStage, 'status'>): number {
  return run.creationOptions?.videoKind === 'long' && stage.status === 'running'
    ? Math.max(env.RESUME_STALE_WINDOW_MS, LONG_FORM_RESUME_STALE_WINDOW_MS)
    : env.RESUME_STALE_WINDOW_MS;
}

function staleAgeMs(stage: PipelineStage): number {
  return Date.now() - latestStageTimestamp(stage).getTime();
}

// Bugs Task 7 (R2) — a resumed stage used to be the only thing that ran: the
// run then sat at its next stage (e.g. 'running' at video_generation after a
// re-opened Gate 1 was approved) until yet another restart. Keep driving it
// in the background — except when it just parked at a gate: reopenPausedGates
// below picks those up, and driving them here too would open the same gate
// twice (both waiters share one pending approval, so both would advance).
function continueAfterResume(run: PipelineRun): void {
  if (run.status === 'running') {
    continuePipelineInBackground(run.id);
  }
}

export async function resumeOnStartup(): Promise<void> {
  await resumeRunningRuns();
  await reopenPausedGates();
}

// Bugs Task 12 (R5d) - how many boots may start a resume for the same run before it is parked. The
// count lives in the (otherwise unused) PipelineRun.retryCount column: incremented when a resume
// starts, reset to 0 when the resumed stage returns. A process that dies mid-resume (the
// 2026-10-10 restart storm) therefore leaves the count behind and the third boot parks the run.
// The one resume rule: a resume that THROWS parks the run at once (resumeInBackground); a resume that
// HANGS or whose process dies is parked on the third boot (this constant). Neither is retried again.
export const MAX_RESUME_ATTEMPTS = 2;

function isGateStage(stage: string | null | undefined): stage is 'gate1' | 'gate2' {
  return stage === 'gate1' || stage === 'gate2';
}

async function parkRun(runId: string, message: string): Promise<void> {
  console.error(`[resume] run ${runId}: ${message}`);
  await updatePipelineRun(runId, { status: 'needs_attention', lastError: message });
}

// Resumed stages are NOT awaited by boot: a render takes minutes and a gate blocks on a human
// reply for hours, and index.ts only starts the API server and the pollers after resumeOnStartup
// returns. (Awaiting a gate here left nothing alive on the event loop, so the process exited
// silently and PM2 restarted it, over and over.) Errors are contained per run.
function resumeInBackground(runId: string, resumer: (runId: string) => Promise<PipelineRun>): void {
  void (async () => {
    try {
      const result = await resumer(runId);
      await updatePipelineRun(runId, { retryCount: 0 });
      continueAfterResume(result);
    } catch (error) {
      console.error(`[resume] run ${runId}: resume threw:`, error);
      await parkRun(
        runId,
        `Could not resume after a restart: ${error instanceof Error ? error.message : String(error)}`,
      ).catch((parkError) => console.error(`[resume] run ${runId}: could not park the run:`, parkError));
    }
  })();
}

async function resumeRunningRuns(): Promise<void> {
  const runningRuns = await listRunsByStatus('running');
  if (runningRuns.length === 0) {
    console.log('[resume] no running PipelineRuns found on startup');
    return;
  }

  for (const run of runningRuns) {
    try {
      await resumeOneRun(run);
    } catch (error) {
      console.error(`[resume] run ${run.id}: error while resuming (other runs and the server continue):`, error);
      await parkRun(run.id, `Could not resume after a restart: ${error instanceof Error ? error.message : String(error)}`).catch(
        () => undefined,
      );
    }
  }
}

async function resumeOneRun(run: PipelineRun): Promise<void> {
  const latestStage = await findLatestStageForRun(run.id);

  if (!latestStage) {
    // Shouldn't happen given persist-before-advance, but recover rather than
    // leave the run stuck forever.
    console.log(`[resume] run ${run.id}: status=running but no stage rows exist — starting intake`);
    resumeInBackground(run.id, runIntakeStage);
    return;
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
  const staleWindowMs = resumeStaleWindowMs(run, latestStage);
  if (ageMs > staleWindowMs) {
    const ageMinutes = Math.round(ageMs / 60_000);
    const windowMinutes = Math.round(staleWindowMs / 60_000);
    const message = `[stale-resume-skip] latest stage '${latestStage.stageName}' (${latestStage.status}) last changed ${ageMinutes}m ago, past the ${windowMinutes}m staleness window — not re-executed automatically`;
    console.log(`[resume] run ${run.id}: ${message}`);
    await updatePipelineRun(run.id, { status: 'needs_attention', lastError: message });
    return;
  }

  // Bugs Task 12 (R5c) - orphan gate: 'running' at a gate means no pending approval exists (the
  // 2026-10-10 state: Retry re-ran gate2 as a stage). Never re-run it; put the run back to its
  // paused status and let reopenPausedGates register the approval and re-send the card.
  const orphanGate = isGateStage(latestStage.stageName) && latestStage.status === 'running'
    ? latestStage.stageName
    : isGateStage(run.currentStage)
      ? run.currentStage
      : null;
  if (orphanGate) {
    console.warn(
      `[resume-repair] run ${run.id}: status=running at ${orphanGate} with no pending approval - repairing to paused_${orphanGate} (not re-running the stage)`,
    );
    await updatePipelineRun(run.id, { status: orphanGate === 'gate1' ? 'paused_gate1' : 'paused_gate2', currentStage: orphanGate });
    return;
  }

  // Bugs Task 12 (R5d) - a run that keeps being "resumed" across boots without ever finishing the
  // resumed stage is parked instead of retried again.
  if (run.retryCount >= MAX_RESUME_ATTEMPTS) {
    await parkRun(
      run.id,
      `Resume gave up: the server restarted ${run.retryCount} times while resuming '${latestStage.stageName}'. Retry it from the app when ready.`,
    );
    await updatePipelineRun(run.id, { retryCount: 0 });
    return;
  }
  await updatePipelineRun(run.id, { retryCount: run.retryCount + 1 });

  if (latestStage.status === 'running') {
    console.log(
      `[resume] run ${run.id}: stage '${latestStage.stageName}' (attempt ${latestStage.attemptNumber}) was mid-flight when the process stopped — re-running it from its persisted input`,
    );
    const resumer = STAGE_RESUMERS[latestStage.stageName];
    if (resumer) {
      resumeInBackground(run.id, resumer);
    } else {
      console.log(
        `[resume] run ${run.id}: no processor wired up for stage '${latestStage.stageName}' yet — leaving as-is`,
      );
    }
    return;
  }

  if (latestStage.status === 'completed') {
    const nextResumer = run.currentStage ? STAGE_RESUMERS[run.currentStage] : undefined;
    if (nextResumer) {
      console.log(
        `[resume] run ${run.id}: latest stage '${latestStage.stageName}' already completed — resuming at '${run.currentStage}'`,
      );
      resumeInBackground(run.id, nextResumer);
    } else {
      console.log(
        `[resume] run ${run.id}: latest stage '${latestStage.stageName}' already completed — currentStage='${run.currentStage}' has no processor wired up yet`,
      );
    }
    return;
  }

  console.log(
    `[resume] run ${run.id}: latest stage '${latestStage.stageName}' is '${latestStage.status}' — no automatic resume action defined for this state`,
  );
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
    // Bugs Task 7 (R2) — drive onward after the gate resolves, not just
    // re-open it (runPipelineFromCurrentStage enters at currentStage='gate1').
    continuePipelineInBackground(run.id);
  }

  const pausedGate2Runs = await listRunsByStatus('paused_gate2');
  for (const run of pausedGate2Runs) {
    console.log(
      `[resume] run ${run.id}: was paused at Gate 2 when the process stopped — re-opening it in the background`,
    );
    continuePipelineInBackground(run.id);
  }

  if (pausedGate1Runs.length === 0 && pausedGate2Runs.length === 0) {
    console.log('[resume] no paused_gate1/paused_gate2 PipelineRuns found on startup');
  }
}
