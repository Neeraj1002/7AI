import { prisma } from '../prisma-client';
import type { Prisma, UsageEvent as PrismaUsageEvent } from '@prisma/client';
import type { ChannelPlatform, CreateUsageEventInput, UsageEvent } from '../../types';

function toDomainUsageEvent(row: PrismaUsageEvent): UsageEvent {
  return {
    id: row.id,
    tenantId: row.tenantId,
    channelId: row.channelId,
    pipelineRunId: row.pipelineRunId,
    stageId: row.stageId,
    agent: row.agent,
    provider: row.provider,
    model: row.model,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    characterCount: row.characterCount,
    audioDurationSeconds: row.audioDurationSeconds ? row.audioDurationSeconds.toString() : null,
    costUsd: row.costUsd.toString(),
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    createdAt: row.createdAt,
  };
}

export async function insertUsageEvent(input: CreateUsageEventInput): Promise<UsageEvent> {
  const row = await prisma.usageEvent.create({
    data: {
      tenantId: input.tenantId,
      channelId: input.channelId,
      pipelineRunId: input.pipelineRunId,
      stageId: input.stageId,
      agent: input.agent,
      provider: input.provider,
      model: input.model,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      characterCount: input.characterCount,
      audioDurationSeconds: input.audioDurationSeconds as Prisma.Decimal.Value | undefined,
      costUsd: input.costUsd as Prisma.Decimal.Value,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
    },
  });
  return toDomainUsageEvent(row);
}

// Backs the Script Generation cost gate (BUSINESS_LOGIC.md Section 2) — sums
// spend for every channel on this (tenantId, platform), since UsageEvent
// itself doesn't store platform directly (only channelId).
export async function sumUsageCostForTenantPlatform(
  tenantId: string,
  platform: ChannelPlatform,
): Promise<number> {
  const result = await prisma.usageEvent.aggregate({
    where: { tenantId, channel: { platform } },
    _sum: { costUsd: true },
  });
  return result._sum.costUsd ? Number(result._sum.costUsd) : 0;
}
