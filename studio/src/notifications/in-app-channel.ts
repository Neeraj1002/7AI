import type { NotificationChannel } from './channel';
import { insertNotification, insertOrReuseApprovalNotification } from '../models/repositories/notification.repository';
import {
  getOrCreatePendingApproval,
  resolvePendingApproval as resolvePendingApprovalShared,
  type ApprovalReply,
} from './pending-approvals';

// Sprint 3 Task 3 (K2) — the real "in-app push through the dashboard"
// default channel MVP_PART2 §1 asked for. Always dispatched to, regardless
// of whether the recipient has push registered — the one channel every user
// always has, so a gate is never left with no visible trace anywhere a user
// would look.
//
// Sprint 3 Task 7 (O5) — renamed from InAppFounderChannel.
//
// Bound to one specific recipient at construction time (composeNotificationChannel
// builds one instance per recipient), not a singleton.
export class InAppChannel implements NotificationChannel {
  constructor(
    private readonly params: { tenantId: string; channelId: string | null; userId: string },
  ) {}

  async notify(message: string, meta?: { threadKey?: string }): Promise<void> {
    await insertNotification({
      tenantId: this.params.tenantId,
      channelId: this.params.channelId,
      userId: this.params.userId,
      kind: 'notify',
      message,
      threadKey: meta?.threadKey,
    });
  }

  async requestApproval(params: { threadKey: string; message: string }): Promise<ApprovalReply> {
    await insertOrReuseApprovalNotification({
      tenantId: this.params.tenantId,
      channelId: this.params.channelId,
      userId: this.params.userId,
      kind: 'approval_request',
      message: params.message,
      threadKey: params.threadKey,
    });
    return getOrCreatePendingApproval(params.threadKey);
  }

  resolvePendingApproval(threadKey: string, value: ApprovalReply): { resolved: boolean } {
    return resolvePendingApprovalShared(threadKey, value);
  }
}
