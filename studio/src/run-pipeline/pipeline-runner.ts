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
import { findChannelById } from '../models/repositories/channel.repository';
import { findPipelineRunById, updatePipelineRun } from '../models/repositories/pipeline-run.repository';
import type { PipelineRun } from '../types';

// Sprint 3 Task 11 (B14) — the founder's own stall guard: runPublishingStage
// makes a real, non-repeatable external call (a YouTube upload) that could in
// principle hang far longer than any of this loop's other stages. Without
// this, a genuinely stuck upload would leave the HTTP-triggered background
// driver (startPipelineInBackground/continuePipelineInBackground, both
// fire-and-forget) running forever with nothing surfacing it to the founder.
// 10 minutes, per the task's own instruction.
const PUBLISHING_STALL_TIMEOUT_MS = 10 * 60 * 1000;

// Races the real call against a timer — the simplest mechanism that needs no
// new cancellation plumbing (there is no AbortController threaded through
// uploadVideo/generatePublishingMetadata today, and building one is out of
// this item's scope). This does NOT cancel the real call if the timer wins:
// runPublishingStage keeps running in the background and will still commit
// its own result whenever it actually finishes. That's deliberately safe,
// not just tolerated — runPublishingStage already checks for an existing
// checkpointed `youtubeVideoId` before ever re-uploading (its own comment,
// "Resume-safety"), so nothing here risks a duplicate upload; the only
// residual is a benign race on which write lands last (documented in
// reports/task11.md): if the stalled call succeeds *after* this function has
// already moved the run to `needs_attention`, its own completion only
// touches `currentStage` (→ 'analytics'), never `status` — so the run is
// left at `needs_attention`/`analytics`, which `runs.retry` (already exists,
// generic for any needs_attention run) drives forward correctly. Nothing is
// lost, nothing double-uploads.
async function runPublishingStageWithStallGuard(runId: string): Promise<PipelineRun> {
  let settled = false;
  const stall = new Promise<'stalled'>((resolve) => {
    setTimeout(() => {
      if (!settled) resolve('stalled');
    }, PUBLISHING_STALL_TIMEOUT_MS);
  });

  const result = await Promise.race([runPublishingStage(runId).finally(() => { settled = true; }), stall]);
  if (result === 'stalled') {
    console.error(
      `[pipeline-runner] run ${runId}: publishing did not resolve within ${PUBLISHING_STALL_TIMEOUT_MS / 60000} minutes — moving to needs_attention rather than leaving the request hanging indefinitely`,
    );
    return await updatePipelineRun(runId, {
      status: 'needs_attention',
      lastError: `Publishing stalled — did not complete within ${PUBLISHING_STALL_TIMEOUT_MS / 60000} minutes. Safe to retry (no duplicate upload risk).`,
    });
  }
  return result;
}

// Sprint 3 Task 8 (R3) — defense in depth for archiving a channel: before each
// stage, stop burning LLM/TTS/video-gen spend on a channel that was archived
// mid-flight. A stage that was already executing when the archive landed can
// still finish and overwrite the run's status; this check re-fails it at the
// next iteration. (The unconditional "never uploads" guarantee lives in
// runPublishingStage itself.)
async function failRunIfChannelArchived(run: PipelineRun): Promise<PipelineRun | null> {
  const channel = await findChannelById(run.channelId);
  if (channel && channel.isActive) return null;
  return updatePipelineRun(run.id, { status: 'failed', lastError: 'Channel deleted' });
}

// Frontend track Task 1 — the piece the design doc calls out as genuinely
// missing (MOBILE_APP_DESIGN.md Section 3: "there's no programmatic 'start a
// run' entry point yet"). Every prior week drove the state machine one stage
// at a time from a human at a terminal (scripts/dry-run.ts) or from
// resume-on-startup.ts's crash recovery (which only ever re-enters a stage
// already in flight, never advances past one on its own). Submitting a brief
// through the API needs the run to actually progress on its own — through
// automated stages, into a gate, and (after that gate resolves) into whatever
// comes next — without a human re-invoking dry-run.ts for every step.
//
// This does not change any transition rule: it only calls the same
// runXStage functions state-machine.ts already exposes, driven by whatever
// `run.currentStage` says next, stopping the moment the run reaches a state
// that needs a human (a gate has opened and is blocking on a reply — the
// individual runGate1Stage/runGate2Stage calls below cover that; both are
// async functions that don't return until resolved) or a state nothing
// currently processes (needs_attention, failed, or a stage with no wired-up
// processor yet — e.g. 'publishing' on this branch, same "stops here
// deliberately" pattern every prior week has used for the next unbuilt
// stage). Bounded by the same MAX_VIDEO_REGEN_ATTEMPTS circuit breaker the
// individual stages already enforce — this adds no new loop of its own.
export async function runPipelineToNextGate(runId: string): Promise<PipelineRun> {
  return driveFromCurrentStage(await runIntakeStage(runId));
}

// Bugs Task 7 (R2) — the same loop, entered at whatever stage the run is
// already at instead of re-running intake. Used by resume-on-startup.ts (a
// re-opened gate, or a resumed mid-flight stage, used to stop dead after that
// one step — nothing drove the run onward until the next restart) and by
// runs.retry for a needs_attention run.
export async function runPipelineFromCurrentStage(runId: string): Promise<PipelineRun> {
  const run = await findPipelineRunById(runId);
  if (!run) {
    throw new Error(`PipelineRun ${runId} not found`);
  }
  return driveFromCurrentStage(run);
}

async function driveFromCurrentStage(initial: PipelineRun): Promise<PipelineRun> {
  const runId = initial.id;
  let run = initial;

  while (run.status !== 'needs_attention' && run.status !== 'failed') {
    const archivedRun = await failRunIfChannelArchived(run);
    if (archivedRun) return archivedRun;
    switch (run.currentStage) {
      case 'script_generation':
        run = await runScriptGenerationStage(runId);
        continue;
      case 'script_review':
        run = await runScriptReviewStage(runId);
        continue;
      case 'gate1':
        run = await runGate1Stage(runId);
        continue;
      case 'video_generation':
        run = await runVideoGenerationStage(runId);
        continue;
      case 'video_review':
        run = await runVideoReviewStage(runId);
        continue;
      case 'gate2':
        run = await runGate2Stage(runId);
        continue;
      // Sprint 3 Task 11 (B14) — the fix: this loop previously stopped dead
      // here, so a live Gate 2 approval never actually published until the
      // next process restart picked it up via resume-on-startup.ts's
      // STAGE_RESUMERS map. Same shape as every case above; publishing alone
      // gets the stall guard (see runPublishingStageWithStallGuard's own
      // comment) since it's the one stage with a real, non-repeatable
      // external side effect this loop now reaches live. This also closes
      // Task 9/R2's Gate-2-off auto-approve path for the same reason — it
      // drives through this identical loop, no separate fix needed.
      case 'publishing':
        run = await runPublishingStageWithStallGuard(runId);
        continue;
      case 'analytics':
        run = await runAnalyticsStage(runId);
        continue;
      default:
        // 'intake' (shouldn't recur) or null (nothing left to drive) — stop
        // advancing and leave the run exactly where it is.
        return run;
    }
  }
  return run;
}

// Fire-and-forget entry point for API request handlers: starts the driver
// without making the HTTP response wait for it (a run can take from seconds
// to minutes to reach its next gate). Errors are logged, not thrown — an
// unhandled rejection here would crash the whole orchestrator process, and a
// thrown error from an individual stage already means that stage's own
// catch block failed to convert it to a `needs_attention`/`failed` status
// (a bug worth logging loudly, not one that should take the API down with
// it).
// The API process stays up continuously from a run's creation through its
// gates (this is the orchestrator process, not a request-scoped worker), so
// the `runGate1Stage`/`runGate2Stage` call this driver is blocked inside of
// is still the exact in-memory call a later resolvePendingApproval() unblocks
// — there is no separate "resume after gate" entry point to build here. A
// gate left pending across a process restart is handled by
// resume-on-startup.ts (Week 5 Task 3): on boot, it re-invokes the matching
// gate function for every `paused_gate1`/`paused_gate2` run, which re-sends
// the gate prompt and re-registers the pending reply — this driver doesn't
// need its own restart-recovery path.
export function startPipelineInBackground(runId: string): void {
  void runPipelineToNextGate(runId).catch((error) => {
    console.error(`[pipeline-runner] run ${runId} — unhandled error driving the pipeline:`, error);
  });
}

// Bugs Task 7 (R2) — fire-and-forget counterpart of runPipelineFromCurrentStage,
// same error-logging posture as startPipelineInBackground.
export function continuePipelineInBackground(runId: string): void {
  void runPipelineFromCurrentStage(runId).catch((error) => {
    console.error(`[pipeline-runner] run ${runId} — unhandled error continuing the pipeline:`, error);
  });
}
