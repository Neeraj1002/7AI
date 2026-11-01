// Sprint 4 Frontend Task 2 (R3/R4) — the two `runs.list` queries the Queue and the Inbox share. Both screens call
// exactly these inputs, so TanStack Query keeps one cache entry for each and opening the Inbox never adds a call
// per card.
export const QUEUE_STATUSES = ['paused_gate1', 'paused_gate2', 'needs_attention', 'running', 'pending'] as const;
// Sprint 6 Task 3: the lists also ask for runs waiting on the angle choice.
export const QUEUE_STATUSES_WITH_ANGLE = ['paused_angle', ...QUEUE_STATUSES] as const;
export const QUEUE_BADGE_STATUSES = ['paused_angle', 'paused_gate1', 'paused_gate2'] as const;
// Runs that have ended (completed, failed, cancelled, rejected).
export const ENDED_STATUSES = ['completed', 'failed'] as const;
export const QUEUE_POLL_MS = 15_000;

/** True when a run that was in the previous active list is gone from the new one (it finished or was cancelled). */
export function someRunLeft(before: readonly string[] | null, now: readonly string[]): boolean {
  if (!before) return false;
  const nowSet = new Set(now);
  return before.some((id) => !nowSet.has(id));
}
