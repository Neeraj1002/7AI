import { prisma } from '../prisma-client';
import type { DbClient } from './pipeline-stage.repository';
import type { Tenant } from '../../types';

export async function findTenantById(id: string): Promise<Tenant | null> {
  return prisma.tenant.findUnique({ where: { id } });
}

// Sprint 3 Task 4 (L1) — scripts/invite-tenant.ts's own transaction: a
// Tenant is never created without its owning User and AgentQuota rows in
// the same transaction, so no tenant is ever left in the "exists but can't
// actually run anything" state NoBudgetConfiguredError previously allowed.
export async function insertTenant(name: string, client: DbClient = prisma): Promise<Tenant> {
  return client.tenant.create({ data: { name } });
}

export async function listTenants(): Promise<Tenant[]> {
  return prisma.tenant.findMany({ orderBy: { createdAt: 'asc' } });
}

// Sprint 2 Task 6 (I1) — updated only after a digest message has actually
// been sent successfully (see founder-digest.ts), never speculatively
// before the send, so a failed notify() never marks a digest as sent.
export async function updateTenantLastDigestSentAt(id: string, sentAt: Date): Promise<Tenant> {
  return prisma.tenant.update({ where: { id }, data: { lastFounderDigestSentAt: sentAt } });
}
