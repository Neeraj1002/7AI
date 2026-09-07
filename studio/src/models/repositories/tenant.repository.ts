import { prisma } from '../prisma-client';
import type { Tenant } from '../../types';

export async function findTenantById(id: string): Promise<Tenant | null> {
  return prisma.tenant.findUnique({ where: { id } });
}

export async function listTenants(): Promise<Tenant[]> {
  return prisma.tenant.findMany({ orderBy: { createdAt: 'asc' } });
}
