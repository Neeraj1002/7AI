import {
  runIntakeStage,
  runScriptGenerationStage,
  runScriptReviewStage,
  runGate1Stage,
  runVideoGenerationStage,
  runVideoReviewStage,
  runGate2Stage,
} from './state-machine';
import type { PipelineRun } from '../types';

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
  let run = await runIntakeStage(runId);

  while (run.status !== 'needs_attention' && run.status !== 'failed') {
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
      default:
        // 'intake' (shouldn't recur), 'publishing'/'analytics' (no processor
        // on this branch yet), or null (nothing left to drive) — stop
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
