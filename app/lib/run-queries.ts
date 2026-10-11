// Sprint 4 Frontend Task 2 (R3/R4) — the two `runs.list` queries the Queue and the Inbox share. Both screens call
// exactly these inputs, so TanStack Query keeps one cache entry for each and opening the Inbox never adds a call
// per card.
export const QUEUE_STATUSES = ['paused_gate1', 'paused_gate2', 'needs_attention', 'running', 'pending'] as const;
// Runs that have ended (completed, failed, cancelled, rejected).
export const ENDED_STATUSES = ['completed', 'failed'] as const;
export const QUEUE_POLL_MS = 15_000;
