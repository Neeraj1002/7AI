// Sprint 3 Task 3 (K2) — see schema.prisma's Notification model comment for
// the nullable channelId deviation (tenant-wide notifications, i.e. the
// daily digest, have no single channel).

export const NOTIFICATION_KINDS = ['notify', 'approval_request'] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export type Notification = {
  id: string;
  tenantId: string;
  channelId: string | null;
  userId: string;
  kind: NotificationKind;
  message: string;
  threadKey: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
};

export type CreateNotificationInput = {
  tenantId: string;
  channelId?: string | null;
  userId: string;
  kind: NotificationKind;
  message: string;
  threadKey?: string;
};
