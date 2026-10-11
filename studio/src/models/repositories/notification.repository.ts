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

// Bugs Closure follow-up - a gate re-sent after a server restart reuses the
// recipient's still-open card for that run instead of adding a duplicate.
// Returns the existing row, or a new one when none is open (the first send,
// or a later gate of the same run once the earlier card was resolved).
export async function insertOrReuseApprovalNotification(input: CreateNotificationInput): Promise<Notification> {
  if (input.threadKey) {
    const open = await prisma.notification.findFirst({
      where: { userId: input.userId, kind: 'approval_request', threadKey: input.threadKey, resolvedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (open) return toDomainNotification(open);
  }
  return insertNotification(input);
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
// which channel actually resolved the gate (in-app or push) — a gate can
// produce more than one Notification row (one per recipient, per
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

// Bugs Task 12 (R6) - what a gate re-send needs to decide whether to push again: the user's
// still-open approval card for the thread (if any) and the newest row of any kind for it.
export async function findResendState(
  userId: string,
  threadKey: string,
): Promise<{ openApprovalCreatedAt: Date | null; lastNotificationAt: Date | null }> {
  const [open, last] = await Promise.all([
    prisma.notification.findFirst({
      where: { userId, kind: 'approval_request', threadKey, resolvedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    prisma.notification.findFirst({
      where: { userId, threadKey },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
  ]);
  return { openApprovalCreatedAt: open?.createdAt ?? null, lastNotificationAt: last?.createdAt ?? null };
}
