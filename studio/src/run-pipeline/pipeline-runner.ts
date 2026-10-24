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
import { findPipelineRunById, updatePipelineRun, CANCELLED_BY_USER } from '../models/repositories/pipeline-run.repository';
import { isCancellationRequested, clearCancellation, markDriven, unmarkDriven } from './cancellation-registry';
import type { PipelineRun } from '../types';
import { readPublishingReceipt } from '../models/repositories/publishing-recovery.repository';

// Sprint 3 Task 11 (B14) — the founder's own stall guard: runPublishingStage
// makes a real, non-repeatable external call (a YouTube upload) that could in
// principle hang far longer than any of this loop's other stages. Without
// this, a genuinely stuck upload would leave the HTTP-triggered background
// driver (startPipelineInBackground/continuePipelineInBackground, both
// fire-and-forget) running forever with nothing surfacing it to the founder.
// 10 minutes, per the task's own instruction.
const PUBLISHING_STALL_TIMEOUT_MS = 10 * 60 * 1000;

// The request may keep running after this timer. Its run-level claim remains the upload guard.
export async function runPublishingStageWithStallGuard(runId: string): Promise<PipelineRun> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stall = new Promise<'stalled'>(resolve => {
    timer = setTimeout(() => resolve('stalled'), PUBLISHING_STALL_TIMEOUT_MS);
  });
  const result = await Promise.race([runPublishingStage(runId), stall]);
  if (timer) clearTimeout(timer);
  if (result !== 'stalled') return result;
  const receipt = await readPublishingReceipt(runId);
  const detail = receipt?.phase === 'ambiguous'
    ? 'The YouTube upload outcome is unresolved; review it before retrying.'
    : receipt?.youtubeVideoId
      ? 'The video ID is recorded; follow-ups or stage completion may still be pending.'
      : 'Publishing may still be in progress; another upload is blocked while its receipt is active.';
  return updatePipelineRun(runId, {
    status: 'needs_attention',
    lastError: 'Publishing exceeded the ten-minute request window. ' + detail,
  });
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

// Bugs Task 10 (R1) — registers this loop as the run's driver for exactly as
// long as it runs (see cancellation-registry.ts's markDriven).
async function driveFromCurrentStage(initial: PipelineRun): Promise<PipelineRun> {
  markDriven(initial.id);
  try {
    return await driveLoop(initial);
  } finally {
    unmarkDriven(initial.id);
  }
}

async function driveLoop(initial: PipelineRun): Promise<PipelineRun> {
  const runId = initial.id;
  let run = initial;

  while (run.status !== 'needs_attention' && run.status !== 'failed') {
    // Sprint 3 Task 11 (R3/B11) — checked at the same point
    // failRunIfChannelArchived already checks (top of the loop, before the
    // switch): a stage already mid-flight when the cancel request lands is
    // allowed to finish and its result still persists to the stage-row
    // history via the switch case's own await below (that write isn't
    // discarded) — this check only stops the *next* iteration from acting on
    // that result to advance the run further, exactly per the task's own
    // instruction. No mid-call abort is built (no AbortController threaded
    // through any stage's real LLM/TTS/video call today).
    if (isCancellationRequested(runId)) {
      clearCancellation(runId);
      return await updatePipelineRun(runId, { status: 'failed', lastError: CANCELLED_BY_USER });
    }
    const archivedRun = await failRunIfChannelArchived(run);
    if (archivedRun) return archivedRun;
    switch (run.currentStage) {
      // Sprint 5 Task 8 (R13): a run stopped AT intake (preflight now stops one there, for example on a spend limit
      // below the estimate, or a voice that is no longer valid) and then retried used to stop dead here, because the
      // loop only ever started after intake. A retry re-enters intake; it moves the run on to script_generation.
      case 'intake':
        run = await runIntakeStage(runId);
        continue;
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
        // null (nothing left to drive) — stop
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
