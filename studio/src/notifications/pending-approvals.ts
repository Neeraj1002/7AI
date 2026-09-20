import { markNotificationsResolvedByThreadKey } from '../models/repositories/notification.repository';

// Sprint 3 Task 3 (K2) — extracted out of the old bot-channel module so it
// can be shared: the single source of truth for "is this gate still open,"
// regardless of which channel(s) notified about it. Every NotificationChannel
// implementation registers into this same map, and api/routers/runs.ts's
// gate1/gate2 mutations resolve through it — none of them own a private copy
// of this state.
//
// Sprint 3 Task 7 (O2) — shrunk back to just the two functions every real
// caller still needs (getOrCreatePendingApproval/resolvePendingApproval),
// plus a channel-agnostic existence check (hasPendingApproval, below). The
// old bot channel's own reply-matching fields (a stored provider message
// id, a lookup from that id back to a threadKey, and a "the one pending
// gate" fallback) are gone — the whole "the founder might not tap Reply, so
// treat a lone incoming message as a reply" fallback (Week 2 Task 6) has no
// meaning once there's no bot to receive a message on; a gate is resolved
// only through a real, explicit API call now (the app, or
// scripts/dry-run.ts's own simulated equivalent).

type PendingApproval = {
  promise: Promise<string>;
  resolve: (reply: string) => void;
};

const pendingByThreadKey = new Map<string, PendingApproval>();

// Idempotent by design: the first caller for a given threadKey creates the
// shared promise; every subsequent caller (e.g. a second recipient's
// channel) gets the exact same promise back. This is what lets multiple
// channels/recipients all await "the same gate" without any one of them
// silently overwriting another's resolve callback.
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

// Sprint 3 Task 7 (O2) — the channel-agnostic replacement for the old bot
// channel's own message-id-based existence check: scripts/dry-run.ts's
// gate1/gate2 commands need to know "has runGate1Stage/runGate2Stage
// actually reached the point of registering a pending promise yet" before
// it's safe to call resolvePendingApproval — otherwise a simulated
// resolution could race ahead of the gate's own requestApproval call and
// resolve nothing.
export function hasPendingApproval(threadKey: string): boolean {
  return pendingByThreadKey.has(threadKey);
}

// Checks and deletes in one synchronous pass (no `await` in between), so a
// reply arriving on one channel can't interleave with a resolution attempt
// on another and double-resolve the same gate — whichever caller (the app's
// gate1/gate2 API call, a dry-run simulation) reaches this first wins; the
// other gets `resolved: false`.
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
