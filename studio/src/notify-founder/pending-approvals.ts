import { markNotificationsResolvedByThreadKey } from '../models/repositories/notification.repository';

// Sprint 3 Task 3 (K2) — extracted out of telegram-channel.ts so it can be
// shared: the single source of truth for "is this gate still open,"
// regardless of which channel(s) notified about it. Both
// TelegramFounderChannel and InAppFounderChannel register into this same
// map, and api/routers/runs.ts's gate1/gate2 mutations resolve through it —
// none of them own a private copy of this state.

type PendingApproval = {
  promise: Promise<string>;
  resolve: (reply: string) => void;
  // Set only once a Telegram message has actually been sent for this
  // threadKey — never assumed. A threadKey with no telegramMessageId means
  // no Telegram channel is involved in this gate at all (an unlinked
  // user), so an unrelated incoming Telegram message must never be matched
  // against it via the "exactly one pending" fallback.
  telegramMessageId?: number;
};

const pendingByThreadKey = new Map<string, PendingApproval>();

// Idempotent by design: the first caller for a given threadKey creates the
// shared promise; every subsequent caller (e.g. a second recipient's
// channel, or Telegram attaching itself to a gate the in-app channel
// already registered) gets the exact same promise back. This is what lets
// multiple channels/recipients all await "the same gate" without any one
// of them silently overwriting another's resolve callback — a real bug an
// earlier design of this module would have had if each channel created its
// own independent Promise/Map entry.
export function getOrCreatePendingApproval(threadKey: string): Promise<string> {
  const existing = pendingByThreadKey.get(threadKey);
  if (existing) return existing.promise;

  let resolveFn!: (reply: string) => void;
  const promise = new Promise<string>((resolve) => {
    resolveFn = resolve;
  });
  pendingByThreadKey.set(threadKey, { promise, resolve: resolveFn });
  return promise;
}

export function attachTelegramMessageId(threadKey: string, messageId: number): void {
  const entry = pendingByThreadKey.get(threadKey);
  if (entry) entry.telegramMessageId = messageId;
}

export function findThreadKeyByTelegramMessageId(messageId: number): string | undefined {
  for (const [threadKey, entry] of pendingByThreadKey) {
    if (entry.telegramMessageId === messageId) return threadKey;
  }
  return undefined;
}

// The "founder won't always remember to tap Reply" fallback (Week 2 Task
// 6) — deliberately restricted to threadKeys that actually have a Telegram
// message attached, not every pending gate: an in-app-only gate (no linked
// Telegram for its recipient) has nothing in this Telegram chat for an
// unrelated incoming message to plausibly be a reply to.
export function singlePendingTelegramThreadKey(): string | undefined {
  const withTelegram = [...pendingByThreadKey.entries()].filter(([, entry]) => entry.telegramMessageId !== undefined);
  return withTelegram.length === 1 ? withTelegram[0][0] : undefined;
}

// Checks and deletes in one synchronous pass (no `await` in between), so a
// reply arriving on one channel can't interleave with a resolution attempt
// on another and double-resolve the same gate — whichever caller (a
// Telegram reply, an in-app API call) reaches this first wins; the other
// gets `resolved: false}`.
//
// Also marks every Notification row for this threadKey resolved (fire-and-
// forget, logged not thrown — a DB write failing here must never block the
// actual gate resolution, which has already happened synchronously above by
// the time this runs) — centralized here, not left to each call site to
// remember, so a Notification row can never end up permanently "still
// pending" in the dashboard just because whichever channel resolved the
// gate wasn't the in-app one.
export function resolvePendingApproval(threadKey: string, reply: string): { resolved: boolean } {
  const pending = pendingByThreadKey.get(threadKey);
  if (!pending) {
    return { resolved: false };
  }
  pendingByThreadKey.delete(threadKey);
  pending.resolve(reply);
  void markNotificationsResolvedByThreadKey(threadKey, new Date()).catch((error) => {
    console.error(`[pending-approvals] failed to mark Notification rows resolved for ${threadKey}:`, error);
  });
  return { resolved: true };
}

// Test-only: mirrors the old telegram-channel.ts export of the same name.
export function peekPendingMessageId(threadKey: string): number | undefined {
  return pendingByThreadKey.get(threadKey)?.telegramMessageId;
}
