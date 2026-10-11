// Sprint 3 Task 11 (R3/B11) — in-memory cancellation-request registry, same
// "in-process state, not DB" precedent `notifications/pending-approvals.ts`
// already established for pending gate replies. `runs.cancel` on a
// `'running'` run records a request here and returns immediately;
// `pipeline-runner.ts`'s `driveFromCurrentStage` loop checks it once per
// iteration and stops the run rather than advancing it further.
//
// Deliberately not persisted: a cancel request racing a server restart is
// simply lost — the run just resumes normally via resume-on-startup.ts, and
// the founder can cancel again. Persisting this would need a schema change
// for a low-probability, low-cost failure mode (a restart happening in the
// exact window between the request and the loop's next check), which this
// task's own spec explicitly doesn't ask for.
const cancellationRequested = new Set<string>();

export function requestCancellation(runId: string): void {
  cancellationRequested.add(runId);
}

export function isCancellationRequested(runId: string): boolean {
  return cancellationRequested.has(runId);
}

// Called once the loop actually acts on a pending cancellation (or when a
// run reaches a terminal state some other way) so a stale entry can never
// resurface against a later, unrelated run that happens to reuse... well,
// UUIDs never repeat, but this keeps the Set from growing unboundedly across
// a long-lived process's lifetime regardless.
export function clearCancellation(runId: string): void {
  cancellationRequested.delete(runId);
}

// Bugs Task 10 (R1) — which run ids a `driveFromCurrentStage` loop is
// *currently* driving in this process. Without it `runs.cancel` cannot tell a
// live loop (which will notice the registry above at its next iteration) from
// a stalled/dead one (a server restart, a crashed or hung loop) whose cancel
// flag nobody will ever read. Added on loop entry, removed in a `finally`, so
// a thrown stage can never leave a ghost entry.
const activelyDriven = new Set<string>();

export function markDriven(runId: string): void {
  activelyDriven.add(runId);
}

export function unmarkDriven(runId: string): void {
  activelyDriven.delete(runId);
}

// A loop that has made no progress (no run or stage-row write) for this long
// counts as not driving the run: an await that never returns is
// indistinguishable from a dead loop, and a force-ended run is safe either way
// (updatePipelineRun refuses late writes to a cancelled run, and publishing
// refuses it, so the worst case is the in-flight stage finishing its own
// spend). Ten minutes matches PUBLISHING_STALL_TIMEOUT_MS in
// pipeline-runner.ts, the longest stall this codebase already tolerates.
export const CANCEL_STALE_AFTER_MS = 10 * 60 * 1000;

export function isActivelyDriven(runId: string, lastProgressAt: Date, now: number = Date.now()): boolean {
  return activelyDriven.has(runId) && now - lastProgressAt.getTime() < CANCEL_STALE_AFTER_MS;
}
