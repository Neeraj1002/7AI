// Public surface of the notification / approval-gate layer. Call sites
// import only from here — never from push-channel.ts or in-app-channel.ts
// directly — mirroring studio/src/llm/'s import-boundary pattern.
//
// Sprint 3 Task 7 (O5) — this directory was studio/src/notify-founder/,
// renamed to match what Task 3 (K2) already made true in behavior: there's
// no longer a single hardcoded "the founder" recipient, and
// composeFounderChannel (now composeNotificationChannel) fans out to an
// arbitrary list of real users. Full rename chosen over a re-exported alias
// (rather than leaving the old vocabulary standing) — every call site is
// already being touched by this same task's O1-O4 changes, so there was no
// real savings left in keeping the old names around.
import { ExpoPushChannel } from './push-channel';
import { InAppChannel } from './in-app-channel';
import { resolvePendingApproval, type ApprovalReply } from './pending-approvals';
import { findUserById } from '../models/repositories/user.repository';
import { findResendState, insertNotification } from '../models/repositories/notification.repository';
import { decideApprovalPush, type PushDecision } from './resend-policy';
import { env } from '../config/env';
import type { NotificationChannel } from './channel';
import type { User } from '../types';

export type { NotificationChannel } from './channel';
export { resolveNotificationRecipients } from './recipients';
export { hasPendingApproval } from './pending-approvals';

// Sprint 3 Task 3 (K2) — dispatches to every recipient's in-app channel
// (always) and, since Task 7 (O1), push channel (only if that recipient has
// a registered expoPushToken). Every channel involved registers into the
// exact same shared pending-approval promise (pending-approvals.ts's
// getOrCreatePendingApproval is idempotent per threadKey) — "first reply
// wins" falls out of that sharing for free, not a new race-handling design.
class MultiNotificationChannel implements NotificationChannel {
  constructor(
    private readonly channels: NotificationChannel[],
    private readonly tenantId: string | null = null,
    private readonly channelId: string | null = null,
  ) {}

  async notify(message: string, meta?: { threadKey?: string }): Promise<void> {
    const results = await Promise.allSettled(this.channels.map((channel) => channel.notify(message, meta)));
    for (const result of results) {
      if (result.status === 'rejected') {
        // Failure Modes (BUSINESS_LOGIC.md Task 3): a push send failure
        // must never prevent the in-app notification from existing — each
        // channel is dispatched independently via allSettled, and a
        // rejection here is logged, never thrown back at the caller.
        console.error('[notifications] a channel failed to send a notification:', result.reason);
      }
    }
  }

  async requestApproval(params: { threadKey: string; message: string }): Promise<ApprovalReply> {
    if (this.channels.length === 0) {
      throw new Error(`composeNotificationChannel: no real recipients resolved for threadKey ${params.threadKey}`);
    }
    // Bugs Task 12 (R6): decide per recipient, BEFORE the in-app channel inserts/reuses its row,
    // whether this prompt should push (a re-sent gate must not stack identical pushes).
    const decisions = await this.decidePushes(params.threadKey, params.message);
    const results = await Promise.allSettled(
      this.channels.map((channel) =>
        channel.requestApproval({
          ...params,
          pushDecision: channel.recipientUserId ? decisions.get(channel.recipientUserId) : undefined,
        }),
      ),
    );
    const fulfilled = results.find(
      (result): result is PromiseFulfilledResult<ApprovalReply> => result.status === 'fulfilled',
    );
    for (const result of results) {
      if (result.status === 'rejected') {
        console.error('[notifications] a channel failed to send an approval request:', result.reason);
      }
    }
    if (!fulfilled) {
      throw new Error(`composeNotificationChannel: every channel failed to send for threadKey ${params.threadKey}`);
    }
    return fulfilled.value;
  }

  private async decidePushes(threadKey: string, message: string): Promise<Map<string, PushDecision>> {
    const out = new Map<string, PushDecision>();
    const userIds = [...new Set(this.channels.map((c) => c.recipientUserId).filter((id): id is string => !!id))];
    for (const userId of userIds) {
      try {
        const state = await findResendState(userId, threadKey);
        const decision = decideApprovalPush({
          now: Date.now(),
          ...state,
          windowMs: env.GATE_RESEND_PUSH_WINDOW_MS,
          staleDays: env.GATE_RESEND_STALE_DAYS,
        });
        out.set(userId, decision);
        // A reminder leaves a row behind so the next restart inside the window sees it.
        if (decision === 'reminder') {
          const tenantId = this.tenantId;
          if (tenantId) {
            await insertNotification({
              tenantId,
              channelId: this.channelId,
              userId,
              kind: 'notify',
              message: `Reminder: ${message.split('\n')[0]}`,
              threadKey,
            });
          }
        }
      } catch (error) {
        console.error('[notifications] could not read re-send state - sending normally:', error);
      }
    }
    return out;
  }

  resolvePendingApproval(threadKey: string, value: ApprovalReply): { resolved: boolean } {
    return resolvePendingApproval(threadKey, value);
  }
}

// Sprint 3 Task 3 (K2) — builds a real NotificationChannel for a set of
// already-resolved recipients (agents/gate1//gate2/founder-digest.ts/
// gate-reminder.ts each resolve *which* users first — resolveNotificationRecipients
// for a channel-scoped gate, listUsersByTenantAndRole for a tenant-wide
// digest — then hand the ids here). In-app is always included for a real
// recipient; push (Task 7/O1) only if that user's expoPushToken is set. A
// userId that no longer resolves to a real User (a since-deleted row) is
// silently skipped, not an error — the remaining real recipients still get
// notified.
export async function composeNotificationChannel(params: {
  tenantId: string;
  channelId: string | null;
  userIds: string[];
}): Promise<NotificationChannel> {
  const users = await Promise.all(params.userIds.map((id) => findUserById(id)));
  const realUsers = users.filter((user): user is User => user !== null);

  const channels: NotificationChannel[] = [];
  for (const user of realUsers) {
    channels.push(new InAppChannel({ tenantId: params.tenantId, channelId: params.channelId, userId: user.id }));
    if (user.expoPushToken) {
      channels.push(
        new ExpoPushChannel({
          tenantId: params.tenantId,
          channelId: params.channelId,
          userId: user.id,
          expoPushToken: user.expoPushToken,
        }),
      );
    }
  }
  return new MultiNotificationChannel(channels, params.tenantId, params.channelId);
}

// Sprint 3 Task 3 (K2) — channel-agnostic: works regardless of which
// channel(s) actually registered the pending promise for this threadKey.
// api/routers/runs.ts's gate1/gate2 mutations call this directly (no
// per-user identity needed to resolve a gate someone is already
// authorized, per Task 2's canResolveGate, to act on).
export { resolvePendingApproval };
