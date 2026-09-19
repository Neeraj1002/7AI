import type { FounderChannel } from './channel';
import { insertNotification } from '../models/repositories/notification.repository';
import { getOrCreatePendingApproval, resolvePendingApproval as resolvePendingApprovalShared } from './pending-approvals';

// Sprint 3 Task 3 (K2) — the real "in-app push through the dashboard"
// default channel MVP_PART2 §1 asked for. Always dispatched to, regardless
// of whether the recipient has Telegram linked — the one channel every
// user always has, so a gate is never left with no visible trace anywhere
// a user would look.
//
// Bound to one specific recipient at construction time (composeFounderChannel
// builds one instance per recipient), not a singleton — unlike the old
// pre-Sprint-3 `founderChannel` export, there's no single "the" in-app
// channel once more than one user can receive notifications.
export class InAppFounderChannel implements FounderChannel {
  constructor(
    private readonly params: { tenantId: string; channelId: string | null; userId: string },
  ) {}

  async notify(message: string): Promise<void> {
    await insertNotification({
      tenantId: this.params.tenantId,
      channelId: this.params.channelId,
      userId: this.params.userId,
      kind: 'notify',
      message,
    });
  }

  async requestApproval(params: { threadKey: string; message: string; attachmentPath?: string }): Promise<{ reply: string }> {
    // attachmentPath (a Gate 2 video file) has no in-app equivalent to
    // attach — the dashboard reads the video directly from
    // GET /runs/:id/video (BUSINESS_LOGIC.md Section 4), so the in-app
    // notification just carries the message text; nothing is lost, the
    // file is already reachable another way this channel doesn't need to
    // duplicate.
    await insertNotification({
      tenantId: this.params.tenantId,
      channelId: this.params.channelId,
      userId: this.params.userId,
      kind: 'approval_request',
      message: params.message,
      threadKey: params.threadKey,
    });
    const reply = await getOrCreatePendingApproval(params.threadKey);
    return { reply };
  }

  resolvePendingApproval(threadKey: string, reply: string): { resolved: boolean } {
    return resolvePendingApprovalShared(threadKey, reply);
  }
}
