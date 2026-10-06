import { prisma } from '../prisma-client';
import { currentBudgetWindowStart } from '../../run-pipeline/budget-gate';
import { analyzeAllTenantBudgets } from './admin.repository';

// Admin Sprint 1 (R5) - cross-tenant tenant views for the admin screens.
// Structure only: no brief, no intakeParsed, no stage input/output, no
// credential token, no push token or chat id. Every select below is explicit,
// so a new sensitive column added to a table later can never leak in here.

const MS_PER_DAY = 24 * 3_600_000;
const LAST_ERROR_MAX = 500;

export function truncate(text: string | null, max: number): string | null {
  if (text === null) return null;
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

const num = (d: { toString(): string } | null | undefined): number => (d ? Number(d) : 0);

export type TenantListItem = {
  id: string;
  name: string;
  createdAt: string;
  ownerEmails: string[];
  userCount: number;
  activeChannelCount: number;
  runsThisWeek: number;
  lastRunAt: string | null;
  spendThisWeekUsd: number;
  spendAllTimeUsd: number;
  poolCeilingUsd: number | null;
  warningCount: number;
};

// Aggregates, never one query per tenant.
export async function listTenantsForAdmin(): Promise<TenantListItem[]> {
  const weekStart = currentBudgetWindowStart();
  const [tenants, owners, userGroups, channelGroups, runWeek, runLast, spendWeek, spendAll, budgets] = await Promise.all([
    prisma.tenant.findMany({ select: { id: true, name: true, createdAt: true } }),
    prisma.user.findMany({ where: { role: 'owner' }, select: { tenantId: true, email: true }, orderBy: { createdAt: 'asc' } }),
    prisma.user.groupBy({ by: ['tenantId'], _count: { _all: true } }),
    prisma.channel.groupBy({ by: ['tenantId'], where: { isActive: true }, _count: { _all: true } }),
    prisma.pipelineRun.groupBy({ by: ['tenantId'], where: { createdAt: { gte: weekStart } }, _count: { _all: true } }),
    prisma.pipelineRun.groupBy({ by: ['tenantId'], _max: { createdAt: true } }),
    prisma.usageEvent.groupBy({ by: ['tenantId'], where: { createdAt: { gte: weekStart } }, _sum: { costUsd: true } }),
    prisma.usageEvent.groupBy({ by: ['tenantId'], _sum: { costUsd: true } }),
    analyzeAllTenantBudgets('youtube'),
  ]);
  const ownerEmails = new Map<string, string[]>();
  for (const o of owners) ownerEmails.set(o.tenantId, [...(ownerEmails.get(o.tenantId) ?? []), o.email]);
  const by = <T extends { tenantId: string }, V>(rows: T[], f: (r: T) => V) => new Map(rows.map((r) => [r.tenantId, f(r)]));
  const userCount = by(userGroups, (r) => r._count._all);
  const activeChannels = by(channelGroups, (r) => r._count._all);
  const runsWeek = by(runWeek, (r) => r._count._all);
  const lastRun = by(runLast, (r) => r._max.createdAt);
  const weekSpend = by(spendWeek, (r) => num(r._sum.costUsd));
  const allSpend = by(spendAll, (r) => num(r._sum.costUsd));

  return tenants
    .map((t) => {
      const budget = budgets.get(t.id);
      return {
        id: t.id,
        name: t.name,
        createdAt: t.createdAt.toISOString(),
        ownerEmails: ownerEmails.get(t.id) ?? [],
        userCount: userCount.get(t.id) ?? 0,
        activeChannelCount: activeChannels.get(t.id) ?? 0,
        runsThisWeek: runsWeek.get(t.id) ?? 0,
        lastRunAt: lastRun.get(t.id)?.toISOString() ?? null,
        spendThisWeekUsd: weekSpend.get(t.id) ?? 0,
        spendAllTimeUsd: allSpend.get(t.id) ?? 0,
        poolCeilingUsd: budget?.poolCeilingUsd ?? null,
        warningCount: budget?.warnings.length ?? 0,
      };
    })
    .sort((a, b) => b.spendThisWeekUsd - a.spendThisWeekUsd || a.name.localeCompare(b.name));
}

export async function getTenantForAdmin(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true, createdAt: true } });
  if (!tenant) return null;
  const now = new Date();
  const weekStart = currentBudgetWindowStart(now);

  const [users, channels, recentRuns] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, email: true, name: true, role: true, isPlatformAdmin: true, createdAt: true },
    }),
    prisma.channel.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        platform: true,
        isActive: true,
        ownerUserId: true,
        defaultVoice: true,
        defaultPrivacyStatus: true,
        budgetOverrideUsd: true,
        agentCredential: { select: { updatedAt: true } },
      },
    }),
    prisma.pipelineRun.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: {
        id: true,
        channelId: true,
        status: true,
        currentStage: true,
        lastError: true,
        createdAt: true,
        updatedAt: true,
        channel: { select: { name: true } },
      },
    }),
  ]);

  const channelIds = channels.map((c) => c.id);
  const runIds = recentRuns.map((r) => r.id);
  const [spendAll, spendWeek, statusGroups, snapshots, runCosts] = await Promise.all([
    prisma.usageEvent.groupBy({ by: ['channelId'], where: { tenantId }, _sum: { costUsd: true } }),
    prisma.usageEvent.groupBy({ by: ['channelId'], where: { tenantId, createdAt: { gte: weekStart } }, _sum: { costUsd: true } }),
    prisma.pipelineRun.groupBy({ by: ['channelId', 'status'], where: { tenantId }, _count: { _all: true } }),
    channelIds.length
      ? prisma.performanceSnapshot.groupBy({ by: ['channelId'], where: { channelId: { in: channelIds } }, _max: { snapshotAt: true } })
      : [],
    runIds.length
      ? prisma.usageEvent.groupBy({ by: ['pipelineRunId'], where: { pipelineRunId: { in: runIds } }, _sum: { costUsd: true } })
      : [],
  ]);
  const allByChannel = new Map(spendAll.map((r) => [r.channelId, num(r._sum.costUsd)]));
  const weekByChannel = new Map(spendWeek.map((r) => [r.channelId, num(r._sum.costUsd)]));
  const snapByChannel = new Map(snapshots.map((r) => [r.channelId, r._max.snapshotAt]));
  const costByRun = new Map(runCosts.map((r) => [r.pipelineRunId, num(r._sum.costUsd)]));
  const statusByChannel = new Map<string, Record<string, number>>();
  for (const g of statusGroups) {
    const m = statusByChannel.get(g.channelId) ?? {};
    m[g.status] = g._count._all;
    statusByChannel.set(g.channelId, m);
  }

  return {
    id: tenant.id,
    name: tenant.name,
    createdAt: tenant.createdAt.toISOString(),
    users: users.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() })),
    channels: channels.map((c) => {
      const credUpdated = c.agentCredential?.updatedAt ?? null;
      return {
        id: c.id,
        name: c.name,
        platform: c.platform,
        isActive: c.isActive,
        ownerUserId: c.ownerUserId,
        defaultVoice: c.defaultVoice,
        defaultPrivacyStatus: c.defaultPrivacyStatus,
        budgetOverrideUsd: c.budgetOverrideUsd !== null ? Number(c.budgetOverrideUsd) : null,
        hasYoutubeCredential: credUpdated !== null,
        credentialUpdatedAt: credUpdated ? credUpdated.toISOString() : null,
        credentialAgeDays: credUpdated ? Math.floor((now.getTime() - credUpdated.getTime()) / MS_PER_DAY) : null,
        spentAllTimeUsd: allByChannel.get(c.id) ?? 0,
        spentThisWeekUsd: weekByChannel.get(c.id) ?? 0,
        runsByStatus: statusByChannel.get(c.id) ?? {},
        lastSnapshotAt: snapByChannel.get(c.id)?.toISOString() ?? null,
      };
    }),
    recentRuns: recentRuns.map((r) => ({
      id: r.id,
      channelId: r.channelId,
      channelName: r.channel.name,
      status: r.status,
      currentStage: r.currentStage,
      lastError: truncate(r.lastError, LAST_ERROR_MAX),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      costUsd: costByRun.get(r.id) ?? 0,
    })),
  };
}
