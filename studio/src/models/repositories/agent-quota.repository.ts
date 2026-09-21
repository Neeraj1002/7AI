import { prisma } from '../prisma-client';
import type { AgentQuota as PrismaAgentQuota } from '@prisma/client';
import type { DbClient } from './pipeline-stage.repository';
import type { AgentQuota, ChannelPlatform } from '../../types';

function toDomainAgentQuota(row: PrismaAgentQuota): AgentQuota {
  return {
    id: row.id,
    tenantId: row.tenantId,
    platform: row.platform as ChannelPlatform,
    budgetCeilingUsd: row.budgetCeilingUsd.toString(),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function findAgentQuota(
  tenantId: string,
  platform: ChannelPlatform,
): Promise<AgentQuota | null> {
  const row = await prisma.agentQuota.findUnique({
    where: { tenantId_platform: { tenantId, platform } },
  });
  return row ? toDomainAgentQuota(row) : null;
}

// Sprint 3 Task 4 (L1) — the real gap: exactly one AgentQuota row has ever
// existed, seeded once by hand (Week 2 Task 4) for the founder's own
// tenant. Every other tenant hit NoBudgetConfiguredError on its very first
// brief. scripts/invite-tenant.ts calls this in the same transaction as
// Tenant/User creation — a tenant is never left without a budget row.
export async function insertAgentQuota(
  tenantId: string,
  platform: ChannelPlatform,
  budgetCeilingUsd: number,
  client: DbClient = prisma,
): Promise<AgentQuota> {
  const row = await client.agentQuota.create({
    data: { tenantId, platform, budgetCeilingUsd },
  });
  return toDomainAgentQuota(row);
}
