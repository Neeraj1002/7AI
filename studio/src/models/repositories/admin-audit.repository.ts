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
