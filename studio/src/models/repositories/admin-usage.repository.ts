import { Prisma } from '@prisma/client';
import { prisma } from '../prisma-client';
import { currentBudgetWindowStart } from '../../run-pipeline/budget-gate';

// Admin Sprint 1 (R7) - cross-tenant usage aggregates. Nothing here returns a
// metadata VALUE: the gaps view returns the key NAMES found in metadata only.

const WEEK_MS = 7 * 24 * 3_600_000;
const DAY_MS = 24 * 3_600_000;
const METADATA_SAMPLE_ROWS = 20;

const num = (d: { toString(): string } | null | undefined): number => (d ? Number(d) : 0);

export type UsageWeek = { weekStartUtc: string; costUsd: number; events: number };

// Weeks start Monday 00:00 UTC (the same window as the budget gate). Oldest
// first; weeks with no events are included as zeros.
export async function usageByWeek(params: { weeks: number; tenantId?: string }): Promise<UsageWeek[]> {
  const currentStart = currentBudgetWindowStart();
  const firstStart = new Date(currentStart.getTime() - (params.weeks - 1) * WEEK_MS);
  const tenantFilter = params.tenantId ? Prisma.sql`AND "tenantId" = ${params.tenantId}::uuid` : Prisma.empty;
  const rows = await prisma.$queryRaw<{ week: Date; cost: number | null; events: number }[]>`
    SELECT date_trunc('week', "createdAt") AS week, SUM("costUsd")::float8 AS cost, COUNT(*)::int AS events
    FROM usage_events
    WHERE "createdAt" >= ${firstStart} ${tenantFilter}
    GROUP BY 1`;
  const byWeek = new Map(rows.map((r) => [new Date(r.week.getTime()).toISOString(), r]));
  return Array.from({ length: params.weeks }, (_, i) => {
    const start = new Date(firstStart.getTime() + i * WEEK_MS).toISOString();
    const r = byWeek.get(start);
    return { weekStartUtc: start, costUsd: r?.cost ?? 0, events: r?.events ?? 0 };
  });
}

export type UsageByAgentRow = { agent: string; provider: string; model: string; calls: number; costUsd: number };

export async function usageByAgent(params: { sinceDays: number; tenantId?: string }): Promise<UsageByAgentRow[]> {
  const since = new Date(Date.now() - params.sinceDays * DAY_MS);
  const rows = await prisma.usageEvent.groupBy({
    by: ['agent', 'provider', 'model'],
    where: { createdAt: { gte: since }, ...(params.tenantId && { tenantId: params.tenantId }) },
    _sum: { costUsd: true },
    _count: { _all: true },
  });
  return rows
    .map((r) => ({ agent: r.agent, provider: r.provider, model: r.model, calls: r._count._all, costUsd: num(r._sum.costUsd) }))
    .sort((a, b) => b.costUsd - a.costUsd || b.calls - a.calls);
}

export type UsageByRunRow = {
  pipelineRunId: string;
  tenantId: string;
  channelName: string | null;
  status: string | null;
  events: number;
  costUsd: number;
};

export async function usageByRun(params: { limit: number; tenantId?: string }): Promise<UsageByRunRow[]> {
  const groups = await prisma.usageEvent.groupBy({
    by: ['pipelineRunId'],
    where: { pipelineRunId: { not: null }, ...(params.tenantId && { tenantId: params.tenantId }) },
    _sum: { costUsd: true },
    _count: { _all: true },
    _max: { createdAt: true },
    orderBy: { _max: { createdAt: 'desc' } },
    take: params.limit,
  });
  const runIds = groups.map((g) => g.pipelineRunId).filter((id): id is string => id !== null);
  const runs = runIds.length
    ? await prisma.pipelineRun.findMany({
        where: { id: { in: runIds } },
        select: { id: true, tenantId: true, status: true, channel: { select: { name: true } } },
      })
    : [];
  const runById = new Map(runs.map((r) => [r.id, r]));
  return groups.map((g) => {
    const run = runById.get(g.pipelineRunId as string);
    return {
      pipelineRunId: g.pipelineRunId as string,
      tenantId: run?.tenantId ?? '',
      channelName: run?.channel.name ?? null,
      status: run?.status ?? null,
      events: g._count._all,
      costUsd: num(g._sum.costUsd),
    };
  });
}

export type UsageGapRow = {
  agent: string;
  provider: string;
  model: string;
  events: number;
  firstAt: string;
  lastAt: string;
  metadataKeys: string[];
};

// Rows recorded at $0, grouped. `metadataKeys` is the union of top-level key NAMES
// found in up to 20 sample rows per group; never a value.
export async function usageGaps(params: { sinceDays: number }): Promise<UsageGapRow[]> {
  const since = new Date(Date.now() - params.sinceDays * DAY_MS);
  const where = { costUsd: 0, createdAt: { gte: since } };
  const groups = await prisma.usageEvent.groupBy({
    by: ['agent', 'provider', 'model'],
    where,
    _count: { _all: true },
    _min: { createdAt: true },
    _max: { createdAt: true },
  });
  const rows = await Promise.all(
    groups.map(async (g) => {
      const samples = await prisma.usageEvent.findMany({
        where: { ...where, agent: g.agent, provider: g.provider, model: g.model },
        select: { metadata: true },
        orderBy: { createdAt: 'desc' },
        take: METADATA_SAMPLE_ROWS,
      });
      const keys = new Set<string>();
      for (const s of samples) {
        if (s.metadata && typeof s.metadata === 'object' && !Array.isArray(s.metadata)) {
          for (const k of Object.keys(s.metadata)) keys.add(k);
        }
      }
      return {
        agent: g.agent,
        provider: g.provider,
        model: g.model,
        events: g._count._all,
        firstAt: (g._min.createdAt as Date).toISOString(),
        lastAt: (g._max.createdAt as Date).toISOString(),
        metadataKeys: [...keys].sort(),
      };
    }),
  );
  return rows.sort((a, b) => b.events - a.events);
}
