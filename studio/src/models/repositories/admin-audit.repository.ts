import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma-client';

// Admin Sprint 1 (R1/R2) — the audit trail for every admin write and every
// tenant-content view. writeAdminAudit takes a transaction client and is only
// ever called inside the same transaction as the change it records, so an audit
// row exists if and only if the change committed.

export const ADMIN_ACTOR_KINDS = ['session', 'ops-token', 'script'] as const;
export type AdminActorKind = (typeof ADMIN_ACTOR_KINDS)[number];

export type AdminActor = { kind: AdminActorKind; userId: string | null };

const SECRET_KEY_PATTERN = /token|secret|password|authorization|key/i;

// Drops any key that looks like a secret, at every depth, so a before/after
// snapshot can never carry a credential into the log.
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY_PATTERN.test(k)) continue;
      out[k] = redact(v);
    }
    return out;
  }
  return value;
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  // JSON round trip drops undefined and turns Dates into ISO strings.
  return JSON.parse(JSON.stringify(redact(value))) as Prisma.InputJsonValue;
}

export type AdminAuditInput = {
  actor: AdminActor;
  action: string;
  targetType: string;
  targetId?: string | null;
  tenantId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
};

export async function writeAdminAudit(tx: Prisma.TransactionClient, input: AdminAuditInput) {
  return tx.adminAuditLog.create({
    data: {
      actorKind: input.actor.kind,
      actorUserId: input.actor.userId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      tenantId: input.tenantId ?? null,
      before: toJson(input.before),
      after: toJson(input.after),
      reason: input.reason ?? null,
    },
  });
}

// For callers with no surrounding transaction of their own that still must
// write the audit row atomically with `work`.
export async function withAdminAudit<T>(
  work: (tx: Prisma.TransactionClient) => Promise<{ result: T; audit: AdminAuditInput }>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const { result, audit } = await work(tx);
    await writeAdminAudit(tx, audit);
    return result;
  });
}

export type AdminAuditListItem = {
  id: string;
  actorKind: AdminActorKind;
  actorUserId: string | null;
  actorEmail: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  tenantId: string | null;
  tenantName: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  createdAt: Date;
};

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ t: createdAt.toISOString(), id })).toString('base64url');
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { t?: unknown; id?: unknown };
    if (typeof parsed.t !== 'string' || typeof parsed.id !== 'string') return null;
    const createdAt = new Date(parsed.t);
    return Number.isNaN(createdAt.getTime()) ? null : { createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

// Newest first, keyset-paged by (createdAt, id). Two extra lookups per page
// (distinct actor users, distinct tenants) rather than joins: the log has no
// foreign keys by design.
export async function listAdminAudit(params: {
  limit: number;
  cursor?: string;
  tenantId?: string;
  action?: string;
}): Promise<{ items: AdminAuditListItem[]; nextCursor: string | null }> {
  const cursor = params.cursor ? decodeCursor(params.cursor) : null;
  const rows = await prisma.adminAuditLog.findMany({
    where: {
      ...(params.tenantId && { tenantId: params.tenantId }),
      ...(params.action && { action: params.action }),
      ...(cursor && {
        OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }],
      }),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: params.limit + 1,
  });
  const page = rows.slice(0, params.limit);

  const userIds = [...new Set(page.map((r) => r.actorUserId).filter((v): v is string => v !== null))];
  const tenantIds = [...new Set(page.map((r) => r.tenantId).filter((v): v is string => v !== null))];
  const [users, tenants] = await Promise.all([
    userIds.length > 0 ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } }) : [],
    tenantIds.length > 0 ? prisma.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true } }) : [],
  ]);
  const emailById = new Map(users.map((u) => [u.id, u.email]));
  const nameById = new Map(tenants.map((t) => [t.id, t.name]));

  const items = page.map((r) => ({
    id: r.id,
    actorKind: r.actorKind as AdminActorKind,
    actorUserId: r.actorUserId,
    actorEmail: r.actorUserId ? (emailById.get(r.actorUserId) ?? null) : null,
    action: r.action,
    targetType: r.targetType,
    targetId: r.targetId,
    tenantId: r.tenantId,
    tenantName: r.tenantId ? (nameById.get(r.tenantId) ?? null) : null,
    before: r.before,
    after: r.after,
    reason: r.reason,
    createdAt: r.createdAt,
  }));
  const last = page[page.length - 1];
  return { items, nextCursor: rows.length > params.limit && last ? encodeCursor(last.createdAt, last.id) : null };
}
