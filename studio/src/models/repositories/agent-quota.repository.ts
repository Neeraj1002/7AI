import { prisma } from '../prisma-client';
import type { AgentQuota as PrismaAgentQuota } from '@prisma/client';
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
