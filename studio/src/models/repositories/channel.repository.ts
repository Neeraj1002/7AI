import { prisma } from '../prisma-client';
import type { Channel as PrismaChannel, Prisma } from '@prisma/client';
import type { Channel, ChannelPlatform, CreateChannelInput, PriorsScope } from '../../types';

function toDomainChannel(row: PrismaChannel): Channel {
  return {
    id: row.id,
    tenantId: row.tenantId,
    platform: row.platform as ChannelPlatform,
    name: row.name,
    externalChannelId: row.externalChannelId,
    nicheDescription: row.nicheDescription,
    brandAssets: (row.brandAssets ?? {}) as Channel['brandAssets'],
    postingCadence: row.postingCadence,
    approvalGateConfig: row.approvalGateConfig as Channel['approvalGateConfig'],
    priorsScope: row.priorsScope as PriorsScope,
    budgetOverrideUsd: row.budgetOverrideUsd ? row.budgetOverrideUsd.toString() : null,
    activeProfileVersionId: row.activeProfileVersionId,
    defaultPrivacyStatus: row.defaultPrivacyStatus as Channel['defaultPrivacyStatus'],
    ownerUserId: row.ownerUserId,
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

// Week 5 Task 4 (C2) — backs the per-channel budget allocation
// (budget-gate.ts's computeChannelBudgetCeilings needs every active channel
// on this exact (tenantId, platform), not every channel on the tenant
// regardless of platform, since the pooled AgentQuota ceiling is itself
// scoped per platform.
export async function listActiveChannelsByTenantAndPlatform(
  tenantId: string,
  platform: ChannelPlatform,
): Promise<Channel[]> {
  const rows = await prisma.channel.findMany({
    where: { tenantId, platform, isActive: true },
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
      postingCadence: input.postingCadence,
      priorsScope: input.priorsScope,
      ownerUserId: input.ownerUserId,
    },
  });
  return toDomainChannel(row);
}

// Sprint 3 Task 8 (R2) — partial patch, same shape as updatePipelineRun:
// only keys actually present in the patch reach Prisma's `data`. `isActive`
// exists so R3's archive is one Prisma call through the same path.
export type ChannelPatch = {
  name?: string;
  nicheDescription?: string;
  defaultPrivacyStatus?: Channel['defaultPrivacyStatus'];
  budgetOverrideUsd?: string | null;
  isActive?: boolean;
};

// Sprint 3 Task 9 (R1 shared design note) — Channel.brandAssets is one JSON
// column two different features write to (captionsEnabled here, watermarkUrl
// in R3's upload route). Every writer goes through this: read the current
// value, merge in only the keys actually being set, write the whole object
// back. A naive `{ brandAssets: { captionsEnabled } }` write would silently
// erase whatever the other feature had stored — this is the one place that
// can't happen.
export async function updateChannelBrandAssets(
  id: string,
  patch: Partial<Channel['brandAssets']>,
): Promise<Channel> {
  const current = await prisma.channel.findUniqueOrThrow({ where: { id }, select: { brandAssets: true } });
  const merged: Record<string, unknown> = { ...((current.brandAssets ?? {}) as Channel['brandAssets']), ...patch };
  // A patch value of `undefined` means "remove this key" (R3's watermark
  // DELETE), not "store the literal value undefined" — stripped explicitly
  // rather than relying on the DB driver's own JSON-serialization behavior
  // for an undefined-valued key to do the right thing.
  for (const key of Object.keys(merged)) {
    if (merged[key] === undefined) delete merged[key];
  }
  const row = await prisma.channel.update({
    where: { id },
    data: { brandAssets: merged as Prisma.InputJsonValue },
  });
  return toDomainChannel(row);
}

// Sprint 3 Task 9 (R2) — same read-merge-write shape as updateChannelBrandAssets,
// for the same reason: approvalGateConfig holds two independent booleans and a
// caller setting only one (e.g. gate1Enabled) must never clobber the other.
// Unlike brandAssets, neither key is ever *removed* (both always resolve to a
// real boolean via the column's own default), but an undefined-valued key is
// still stripped before writing — belt-and-suspenders against a caller passing
// `{ gate1Enabled: undefined }` explicitly and clobbering the current value.
export async function updateChannelApprovalGateConfig(
  id: string,
  patch: Partial<Channel['approvalGateConfig']>,
): Promise<Channel> {
  const current = await prisma.channel.findUniqueOrThrow({ where: { id }, select: { approvalGateConfig: true } });
  const merged: Record<string, unknown> = {
    ...((current.approvalGateConfig ?? {}) as Channel['approvalGateConfig']),
    ...patch,
  };
  for (const key of Object.keys(merged)) {
    if (merged[key] === undefined) delete merged[key];
  }
  const row = await prisma.channel.update({
    where: { id },
    data: { approvalGateConfig: merged as Prisma.InputJsonValue },
  });
  return toDomainChannel(row);
}

export async function updateChannel(id: string, patch: ChannelPatch): Promise<Channel> {
  const data: ChannelPatch = {};
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.nicheDescription !== undefined) data.nicheDescription = patch.nicheDescription;
  if (patch.defaultPrivacyStatus !== undefined) data.defaultPrivacyStatus = patch.defaultPrivacyStatus;
  if (patch.budgetOverrideUsd !== undefined) data.budgetOverrideUsd = patch.budgetOverrideUsd;
  if (patch.isActive !== undefined) data.isActive = patch.isActive;
  const row = await prisma.channel.update({ where: { id }, data });
  return toDomainChannel(row);
}

// Sprint 3 Task 8 (R3) — one-way soft delete; there is deliberately no
// unarchive counterpart.
export async function archiveChannel(id: string): Promise<Channel> {
  return updateChannel(id, { isActive: false });
}
