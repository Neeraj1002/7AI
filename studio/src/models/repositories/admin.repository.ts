import { prisma } from '../prisma-client';
import type { ChannelPlatform } from '../../types';
import { findAgentQuota } from './agent-quota.repository';
import {
  sumUsageCostForTenantChannelPlatform,
  sumUsageCostForTenantPlatform,
} from './usage-event.repository';
import { currentBudgetWindowStart } from '../../run-pipeline/budget-gate';
import {
  analyzeBudget,
  type AnalyzeBudgetChannelInput,
  type BudgetAnalysis,
} from '../../run-pipeline/budget-analysis';

// Admin Sprint 1 - the only repository allowed to aggregate across tenants.
// Every function takes tenant as an explicit argument (or none, for a
// deliberately platform-wide view); nothing here reads a request context.
// Never select AgentCredential.refreshTokenEncrypted, a brief, or a stage
// input/output from this file except where a function's own comment says it
// is the audited content path.

export type RunSummary = { id: string; status: string; tenantId: string; tenantName: string | null };

// One findMany for the runs plus one for their tenants' names, however many
// ids are passed (no N+1). Ids that no longer exist are simply absent.
export async function findRunSummariesByIds(runIds: string[]): Promise<Map<string, RunSummary>> {
  const ids = [...new Set(runIds)];
  if (ids.length === 0) return new Map();
  const runs = await prisma.pipelineRun.findMany({
    where: { id: { in: ids } },
    select: { id: true, status: true, tenantId: true },
  });
  const tenantIds = [...new Set(runs.map((r) => r.tenantId))];
  const tenants = tenantIds.length
    ? await prisma.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(tenants.map((t) => [t.id, t.name]));
  return new Map(
    runs.map((r) => [r.id, { id: r.id, status: r.status, tenantId: r.tenantId, tenantName: nameById.get(r.tenantId) ?? null }]),
  );
}

// ---------------------------------------------------------------------------
// Budget inputs (R6). Spend comes from the SAME functions the gate calls
// (usage-event.repository), always with since = the weekly window start; both
// default to LIFETIME spend when `since` is omitted.
// ---------------------------------------------------------------------------

export type TenantBudgetAnalysis = BudgetAnalysis & {
  gateSpentUsd: number;
  spentThisWeekUsd: number;
  weekStartUtc: Date;
};

export async function analyzeTenantBudget(tenantId: string, platform: ChannelPlatform): Promise<TenantBudgetAnalysis> {
  const since = currentBudgetWindowStart();
  const [quota, channelRows] = await Promise.all([
    findAgentQuota(tenantId, platform),
    prisma.channel.findMany({
      where: { tenantId, platform },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, isActive: true, budgetOverrideUsd: true },
    }),
  ]);
  const gateSpentUsd = await sumUsageCostForTenantPlatform(tenantId, platform, since);
  const channels: AnalyzeBudgetChannelInput[] = await Promise.all(
    channelRows.map(async (c) => ({
      channelId: c.id,
      name: c.name,
      isActive: c.isActive,
      overrideUsd: c.budgetOverrideUsd !== null ? Number(c.budgetOverrideUsd) : null,
      gateSpentUsd: await sumUsageCostForTenantChannelPlatform(tenantId, c.id, platform, since),
    })),
  );
  const analysis = analyzeBudget({
    poolCeilingUsd: quota ? Number(quota.budgetCeilingUsd) : null,
    channels,
    gateSpent: gateSpentUsd,
    weekSpent: gateSpentUsd,
  });
  return { ...analysis, gateSpentUsd, spentThisWeekUsd: gateSpentUsd, weekStartUtc: since };
}

// The same analysis for EVERY tenant with a fixed number of queries (quotas,
// channels, one usage groupBy), for the overview and the tenants list. The
// per-tenant figures equal analyzeTenantBudget's (a test asserts it).
export async function analyzeAllTenantBudgets(platform: ChannelPlatform): Promise<Map<string, TenantBudgetAnalysis>> {
  const since = currentBudgetWindowStart();
  const [quotas, channelRows, spendRows] = await Promise.all([
    prisma.agentQuota.findMany({ where: { platform }, select: { tenantId: true, budgetCeilingUsd: true } }),
    prisma.channel.findMany({
      where: { platform },
      orderBy: { createdAt: 'asc' },
      select: { id: true, tenantId: true, name: true, isActive: true, budgetOverrideUsd: true },
    }),
    prisma.usageEvent.groupBy({
      by: ['tenantId', 'channelId'],
      where: { createdAt: { gte: since }, channel: { platform } },
      _sum: { costUsd: true },
    }),
  ]);
  const spendByChannel = new Map(spendRows.map((r) => [r.channelId, r._sum.costUsd ? Number(r._sum.costUsd) : 0]));
  const poolByTenant = new Map(quotas.map((q) => [q.tenantId, Number(q.budgetCeilingUsd)]));
  const channelsByTenant = new Map<string, AnalyzeBudgetChannelInput[]>();
  for (const c of channelRows) {
    const list = channelsByTenant.get(c.tenantId) ?? [];
    list.push({
      channelId: c.id,
      name: c.name,
      isActive: c.isActive,
      overrideUsd: c.budgetOverrideUsd !== null ? Number(c.budgetOverrideUsd) : null,
      gateSpentUsd: spendByChannel.get(c.id) ?? 0,
    });
    channelsByTenant.set(c.tenantId, list);
  }

  const tenantIds = new Set<string>([...poolByTenant.keys(), ...channelsByTenant.keys()]);
  const result = new Map<string, TenantBudgetAnalysis>();
  for (const tenantId of tenantIds) {
    const channels = channelsByTenant.get(tenantId) ?? [];
    const gateSpentUsd = channels.reduce((sum, c) => sum + c.gateSpentUsd, 0);
    const analysis = analyzeBudget({
      poolCeilingUsd: poolByTenant.get(tenantId) ?? null,
      channels,
      gateSpent: gateSpentUsd,
      weekSpent: gateSpentUsd,
    });
    result.set(tenantId, { ...analysis, gateSpentUsd, spentThisWeekUsd: gateSpentUsd, weekStartUtc: since });
  }
  return result;
}
