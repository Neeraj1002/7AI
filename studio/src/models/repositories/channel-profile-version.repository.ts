import { prisma } from '../prisma-client';
import type { ChannelProfileVersion as PrismaChannelProfileVersion } from '@prisma/client';
import type { ChannelProfileData } from '../../channel-profile/schema';

// Sprint 4 Task 1. Profile versions are immutable: a change is a new row.

export type ChannelProfileVersion = {
  id: string;
  channelId: string;
  version: number;
  data: ChannelProfileData;
  createdByUserId: string | null;
  createdAt: Date;
};

function toDomain(row: PrismaChannelProfileVersion): ChannelProfileVersion {
  return {
    id: row.id,
    channelId: row.channelId,
    version: row.version,
    data: row.data as ChannelProfileData,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
  };
}

// Inserts version = max + 1 for the channel (starting at 1) and points
// channels.activeProfileVersionId at it, in one transaction. The channel row
// is locked first so two concurrent creates cannot both read the same max
// (the (channelId, version) unique constraint is the backstop).
export async function insertProfileVersion(params: {
  channelId: string;
  data: ChannelProfileData;
  createdByUserId: string | null;
}): Promise<ChannelProfileVersion> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM channels WHERE id = ${params.channelId}::uuid FOR UPDATE`;
    const latest = await tx.channelProfileVersion.findFirst({
      where: { channelId: params.channelId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const row = await tx.channelProfileVersion.create({
      data: {
        channelId: params.channelId,
        version: (latest?.version ?? 0) + 1,
        data: params.data as object,
        createdByUserId: params.createdByUserId,
      },
    });
    await tx.channel.update({ where: { id: params.channelId }, data: { activeProfileVersionId: row.id } });
    return toDomain(row);
  });
}

// null if the channel has never had a profile (a valid, expected state).
export async function findActiveProfileForChannel(channelId: string): Promise<ChannelProfileVersion | null> {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { activeProfileVersion: true },
  });
  return channel?.activeProfileVersion ? toDomain(channel.activeProfileVersion) : null;
}

export async function listProfileVersionsForChannel(channelId: string): Promise<ChannelProfileVersion[]> {
  const rows = await prisma.channelProfileVersion.findMany({
    where: { channelId },
    orderBy: { version: 'desc' },
  });
  return rows.map(toDomain);
}

// For stage code to fetch a run's own snapshotted version, not necessarily the
// channel's current active one.
export async function findProfileVersionById(id: string): Promise<ChannelProfileVersion | null> {
  const row = await prisma.channelProfileVersion.findUnique({ where: { id } });
  return row ? toDomain(row) : null;
}
