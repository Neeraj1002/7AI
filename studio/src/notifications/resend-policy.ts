// Bugs Task 12 (R6/R5g) - pure decision for "should this gate prompt push to the phone?".
// 2026-10-10: a restart loop re-sent the same Gate 2 prompt about once a second.
export type PushDecision = 'send' | 'reminder' | 'skip-recent' | 'skip-stale';

export function decideApprovalPush(input: {
  now: number;
  openApprovalCreatedAt: Date | null;
  lastNotificationAt: Date | null;
  windowMs: number;
  staleDays: number;
}): PushDecision {
  // No open card: a genuinely new gate (or a later attempt) - push as normal.
  if (!input.openApprovalCreatedAt) return 'send';
  if (input.now - input.openApprovalCreatedAt.getTime() > input.staleDays * 86_400_000) return 'skip-stale';
  const last = input.lastNotificationAt ?? input.openApprovalCreatedAt;
  if (input.now - last.getTime() < input.windowMs) return 'skip-recent';
  return 'reminder';
}

// Expo rejects oversized payloads (4096 bytes in total) and a phone shows a few lines at most. The
// full text always stays in the in-app Notification row; the push carries a short summary.
export const PUSH_BODY_MAX_CHARS = 180;

export function buildPushBody(message: string, reminder: boolean): string {
  const lines = message
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('(Re-sending'));
  const head = lines[0] ?? '';
  const detail = lines.find((l) => l.startsWith('Brief:') || l.startsWith('Video Intelligence verdict:'));
  const text = [head, detail].filter(Boolean).join(' - ');
  const prefixed = reminder ? `Reminder: ${text}` : text;
  return prefixed.length > PUSH_BODY_MAX_CHARS ? `${prefixed.slice(0, PUSH_BODY_MAX_CHARS - 1)}…` : prefixed;
}
