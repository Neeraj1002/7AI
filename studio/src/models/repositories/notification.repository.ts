import { prisma } from '../prisma-client';
import type { Notification as PrismaNotification } from '@prisma/client';
import type { CreateNotificationInput, Notification, NotificationKind } from '../../types';

function toDomainNotification(row: PrismaNotification): Notification {
  return {
    id: row.id,
    tenantId: row.tenantId,
    channelId: row.channelId,
    userId: row.userId,
    kind: row.kind as NotificationKind,
    message: row.message,
    threadKey: row.threadKey,
    resolvedAt: row.resolvedAt,
    createdAt: row.createdAt,
  };
}

export async function insertNotification(input: CreateNotificationInput): Promise<Notification> {
  const row = await prisma.notification.create({
    data: {
      tenantId: input.tenantId,
      channelId: input.channelId ?? undefined,
      userId: input.userId,
      kind: input.kind,
      message: input.message,
      threadKey: input.threadKey,
    },
  });
  return toDomainNotification(row);
}

// Backs the dashboard's `notifications.list` query — most recent first,
// same "poll, don't push" pattern every other dashboard query already uses.
export async function listNotificationsForUser(userId: string, limit = 50): Promise<Notification[]> {
  const rows = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return rows.map(toDomainNotification);
}

// Sprint 3 Task 3 (K2) — marks every open 'approval_request' row for a
// given threadKey resolved, regardless of which real user's row it is or
// which channel actually resolved the gate (in-app or Telegram) — a gate
// can produce more than one Notification row (one per recipient, per
// resolveNotificationRecipients' fan-out for a null-ownerUserId channel),
// and all of them should stop reading as "still pending" once any one
// resolution path closes the underlying gate.
export async function markNotificationsResolvedByThreadKey(threadKey: string, resolvedAt: Date): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { threadKey, resolvedAt: null },
    data: { resolvedAt },
  });
  return result.count;
}
