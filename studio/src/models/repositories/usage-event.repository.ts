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

// Bugs Closure R6 — pure and tolerant: runs from before Sprint 4 Task 8 have only the single
// stockFootageSourceId, newer ones also a stockFootageSourceIds array (a shot list joins its ids
// with commas in the singular key). Anything unexpected yields no ids, never a throw.
export function sourceIdsFromUsageMetadata(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== 'object') return [];
  const m = metadata as { stockFootageSourceIds?: unknown; stockFootageSourceId?: unknown };
  if (Array.isArray(m.stockFootageSourceIds)) {
    return m.stockFootageSourceIds.filter((id): id is string => typeof id === 'string');
  }
  if (typeof m.stockFootageSourceId === 'string') {
    return m.stockFootageSourceId.split(',').map((id) => id.trim()).filter(Boolean);
  }
  return [];
}

// The stock clip ids a run's earlier video-generation attempts used.
export async function listStockSourceIdsUsedByRun(pipelineRunId: string): Promise<string[]> {
  const rows = await prisma.usageEvent.findMany({
    where: { pipelineRunId, agent: 'video-generation' },
    select: { metadata: true },
  });
  return [...new Set(rows.flatMap((r) => sourceIdsFromUsageMetadata(r.metadata)))];
}

// Sprint 4 Task 9 (R7.3): everything one run has spent so far, every stage and attempt, in USD.
export async function sumUsageCostForRun(pipelineRunId: string): Promise<number> {
  const result = await prisma.usageEvent.aggregate({ where: { pipelineRunId }, _sum: { costUsd: true } });
  return result._sum.costUsd ? Number(result._sum.costUsd) : 0;
}

// Sprint 6 Task 1 R11: what the curiosity packaging cost this run, both rounds, text and pictures, from the usage rows
// (agents named `packaging-...`: brief, concepts, cold reader, defect check, payoff, critic, compare, thumbnail).
export async function sumPackagingCostForRun(pipelineRunId: string): Promise<number> {
  const result = await prisma.usageEvent.aggregate({ where: { pipelineRunId, agent: { startsWith: 'packaging-' } }, _sum: { costUsd: true } });
  return result._sum.costUsd ? Math.round(Number(result._sum.costUsd) * 10000) / 10000 : 0;
}

// Sprint 6 Task 3 (Part B cap): what the script cold reader and promise match have cost this run so far, across every
// script that reached Gate 1, failed calls included (agents `story-cold-reader...` and `story-promise-match...`).
export async function sumStoryScriptCostForRun(pipelineRunId: string): Promise<number> {
  const result = await prisma.usageEvent.aggregate({
    where: { pipelineRunId, OR: [{ agent: { startsWith: 'story-cold-reader' } }, { agent: { startsWith: 'story-promise-match' } }] },
    _sum: { costUsd: true },
  });
  return result._sum.costUsd ? Number(result._sum.costUsd) : 0;
}

// Backs the Script Generation cost gate (BUSINESS_LOGIC.md Section 2) — sums
// spend for every channel on this (tenantId, platform), since UsageEvent
// itself doesn't store platform directly (only channelId).
export async function sumUsageCostForTenantPlatform(
  tenantId: string,
  platform: ChannelPlatform,
  // Bugs Closure R1 (D1) — the budget window start; omitted = lifetime spend.
  since?: Date,
): Promise<number> {
  const result = await prisma.usageEvent.aggregate({
    where: { tenantId, channel: { platform }, ...(since && { createdAt: { gte: since } }) },
    _sum: { costUsd: true },
  });
  return result._sum.costUsd ? Number(result._sum.costUsd) : 0;
}

// Week 5 Task 4 (C2) — backs the per-channel half of the fair-access budget
// gate, alongside the pooled sum above.
export async function sumUsageCostForTenantChannelPlatform(
  tenantId: string,
  channelId: string,
  platform: ChannelPlatform,
  since?: Date,
): Promise<number> {
  const result = await prisma.usageEvent.aggregate({
    where: { tenantId, channelId, channel: { platform }, ...(since && { createdAt: { gte: since } }) },
    _sum: { costUsd: true },
  });
  return result._sum.costUsd ? Number(result._sum.costUsd) : 0;
}

// Sprint 5 Task 8 (R8.7): what a run spent, per stage row, from the same ledger sumUsageCostForRun reads.
// The `null` key holds usage not tied to a stage row. The parts always add up to sumUsageCostForRun.
export async function listUsageCostByStage(pipelineRunId: string): Promise<Map<string | null, number>> {
  const rows = await prisma.usageEvent.groupBy({
    by: ['stageId'],
    where: { pipelineRunId },
    _sum: { costUsd: true },
  });
  return new Map(rows.map((r) => [r.stageId ?? null, r._sum.costUsd ? Number(r._sum.costUsd) : 0]));
}
