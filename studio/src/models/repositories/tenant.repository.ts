import { prisma } from '../prisma-client';
import type { Tenant } from '../../types';

export async function findTenantById(id: string): Promise<Tenant | null> {
  return prisma.tenant.findUnique({ where: { id } });
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
