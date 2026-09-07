import { prisma } from '../prisma-client';
import type { Channel as PrismaChannel } from '@prisma/client';
import type { Channel, ChannelPlatform, CreateChannelInput, PriorsScope } from '../../types';

function toDomainChannel(row: PrismaChannel): Channel {
  return {
    id: row.id,
    tenantId: row.tenantId,
    platform: row.platform as ChannelPlatform,
    name: row.name,
    externalChannelId: row.externalChannelId,
    nicheDescription: row.nicheDescription,
    styleGuide: row.styleGuide,
    brandAssets: (row.brandAssets ?? {}) as Channel['brandAssets'],
    postingCadence: row.postingCadence,
    approvalGateConfig: row.approvalGateConfig as Channel['approvalGateConfig'],
    priorsScope: row.priorsScope as PriorsScope,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function findChannelById(id: string): Promise<Channel | null> {
  const row = await prisma.channel.findUnique({ where: { id } });
  return row ? toDomainChannel(row) : null;
}

export async function listActiveChannelsByTenant(tenantId: string): Promise<Channel[]> {
  const rows = await prisma.channel.findMany({
    where: { tenantId, isActive: true },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map(toDomainChannel);
}

// Backs the 7-channel cap (BUSINESS_LOGIC.md Section 3) — the cap decision itself
// lives in studio/src/manage-channels/channel-cap.ts, not here; this stays pure data access.
export async function countActiveChannelsByTenantAndPlatform(
  tenantId: string,
  platform: ChannelPlatform,
): Promise<number> {
  return prisma.channel.count({
    where: { tenantId, platform, isActive: true },
  });
}

export async function insertChannel(input: CreateChannelInput): Promise<Channel> {
  const row = await prisma.channel.create({
    data: {
      tenantId: input.tenantId,
      platform: input.platform,
      name: input.name,
      nicheDescription: input.nicheDescription,
      styleGuide: input.styleGuide,
      postingCadence: input.postingCadence,
      priorsScope: input.priorsScope,
    },
  });
  return toDomainChannel(row);
}
