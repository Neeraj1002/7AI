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
