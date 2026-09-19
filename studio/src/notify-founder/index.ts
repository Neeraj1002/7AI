// Public surface of the founder-notification / approval-gate layer. Call
// sites import only from here — never from telegram-channel.ts or
// in-app-channel.ts directly — mirroring studio/src/llm/'s import-boundary
// pattern.
import { TelegramFounderChannel } from './telegram-channel';
import { InAppFounderChannel } from './in-app-channel';
import { resolvePendingApproval } from './pending-approvals';
import { findUserById } from '../models/repositories/user.repository';
import type { FounderChannel } from './channel';
import type { User } from '../types';

export type { FounderChannel } from './channel';
export {
  startTelegramReceiveLoop,
  simulateIncomingTelegramMessage,
  peekPendingMessageId,
} from './telegram-channel';
export { resolveNotificationRecipients } from './recipients';
export { createTelegramLinkCode, unlinkTelegram } from './telegram-link';

// Sprint 3 Task 3 (K2) — dispatches to every recipient's in-app channel
// (always) and Telegram channel (only if that recipient has telegramChatId
// set). Every channel involved registers into the exact same shared
// pending-approval promise (pending-approvals.ts's getOrCreatePendingApproval
// is idempotent per threadKey) — "first reply wins" falls out of that
// sharing for free, not a new race-handling design.
class MultiFounderChannel implements FounderChannel {
  constructor(private readonly channels: FounderChannel[]) {}

  async notify(message: string): Promise<void> {
    const results = await Promise.allSettled(this.channels.map((channel) => channel.notify(message)));
    for (const result of results) {
      if (result.status === 'rejected') {
        // Failure Modes (BUSINESS_LOGIC.md Task 3): a Telegram send failure
        // must never prevent the in-app notification from existing — each
        // channel is dispatched independently via allSettled, and a
        // rejection here is logged, never thrown back at the caller.
        console.error('[notify-founder] a channel failed to send a notification:', result.reason);
      }
    }
  }

  async requestApproval(params: {
    threadKey: string;
    message: string;
    attachmentPath?: string;
  }): Promise<{ reply: string }> {
    if (this.channels.length === 0) {
      throw new Error(`composeFounderChannel: no real recipients resolved for threadKey ${params.threadKey}`);
    }
    const results = await Promise.allSettled(this.channels.map((channel) => channel.requestApproval(params)));
    const fulfilled = results.find(
      (result): result is PromiseFulfilledResult<{ reply: string }> => result.status === 'fulfilled',
    );
    for (const result of results) {
      if (result.status === 'rejected') {
        console.error('[notify-founder] a channel failed to send an approval request:', result.reason);
      }
    }
    if (!fulfilled) {
      throw new Error(`composeFounderChannel: every channel failed to send for threadKey ${params.threadKey}`);
    }
    return fulfilled.value;
  }

  resolvePendingApproval(threadKey: string, reply: string): { resolved: boolean } {
    return resolvePendingApproval(threadKey, reply);
  }
}

// Sprint 3 Task 3 (K2) — builds a real FounderChannel for a set of already-
// resolved recipients (agents/gate1//gate2/founder-digest.ts/gate-reminder.ts
// each resolve *which* users first — resolveNotificationRecipients for a
// channel-scoped gate, listUsersByTenantAndRole for a tenant-wide digest —
// then hand the ids here). In-app is always included for a real recipient;
// Telegram only if that user's telegramChatId is set. A userId that no
// longer resolves to a real User (a since-deleted row) is silently skipped,
// not an error — the remaining real recipients still get notified.
export async function composeFounderChannel(params: {
  tenantId: string;
  channelId: string | null;
  userIds: string[];
}): Promise<FounderChannel> {
  const users = await Promise.all(params.userIds.map((id) => findUserById(id)));
  const realUsers = users.filter((user): user is User => user !== null);

  const channels: FounderChannel[] = [];
  for (const user of realUsers) {
    channels.push(new InAppFounderChannel({ tenantId: params.tenantId, channelId: params.channelId, userId: user.id }));
    if (user.telegramChatId) {
      channels.push(new TelegramFounderChannel(user.telegramChatId));
    }
  }
  return new MultiFounderChannel(channels);
}

// Sprint 3 Task 3 (K2) — channel-agnostic: works regardless of which
// channel(s) actually registered the pending promise for this threadKey.
// api/routers/runs.ts's gate1/gate2 mutations call this directly (no
// per-user identity needed to resolve a gate someone is already
// authorized, per Task 2's canResolveGate, to act on).
export { resolvePendingApproval };
