import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { appRouter } from '../../router';
import { SANDBOX } from '../../../test-support/sandbox';
import { buildDecisionQueue, DECISION_QUEUE_CAP } from './overview';
import type { OverviewData, TenantBudgetAnalysis } from '../../../models/repositories/admin.repository';

const NOW = new Date('2026-10-06T12:00:00.000Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const H = 3_600_000;
const D = 24 * H;

function emptyData(): OverviewData {
  return {
    weekStartUtc: new Date('2026-10-05T00:00:00.000Z'),
    totals: { tenants: 0, users: 0, activeChannels: 0, inactiveChannels: 0 },
    runsThisWeek: { total: 0, completed: 0, failed: 0, needsAttention: 0, running: 0, pausedGate1: 0, pausedGate2: 0, pending: 0 },
    openNow: { pausedGate1: 0, pausedGate2: 0, needsAttention: 0, running: 0 },
    spend: { thisWeekUsd: 0, allTimeUsd: 0 },
    tenantNames: new Map(),
    budgets: new Map(),
    credentials: [],
    pendingRuns: [],
    untriagedBugs: { count: 0, oldest: null },
    costGaps: { count: 0, oldest: null },
  };
}

const analysis = (warnings: TenantBudgetAnalysis['warnings']): TenantBudgetAnalysis => ({
  poolCeilingUsd: 2,
  reservedByOverridesUsd: 0,
  remainingPoolUsd: 0,
  channels: [],
  warnings,
  gateSpentUsd: 0,
  spentThisWeekUsd: 0,
  weekStartUtc: new Date('2026-10-05T00:00:00.000Z'),
});

describe('buildDecisionQueue', () => {
  it('an empty database yields an empty queue', () => {
    expect(buildDecisionQueue(emptyData(), NOW)).toEqual([]);
  });

  it('flags exactly the planted problems and nothing for a healthy tenant', () => {
    const d = emptyData();
    d.tenantNames = new Map([['t-bad', 'Bad'], ['t-ok', 'Healthy']]);
    d.budgets = new Map([
      ['t-bad', analysis([
        { code: 'override_reserves_whole_pool', message: 'reserved' },
        { code: 'zero_share', channelId: 'c2', message: 'zero' },
        { code: 'pool_exhausted', message: 'spent' },
        { code: 'below_guide', message: 'info' },
      ])],
      ['t-ok', analysis([{ code: 'below_guide', message: 'info' }])],
    ]);
    d.credentials = [
      { channelId: 'c-old', channelName: 'Old', channelIsActive: true, tenantId: 't-bad', updatedAt: ago(8 * D) },
      { channelId: 'c-new', channelName: 'New', channelIsActive: true, tenantId: 't-ok', updatedAt: ago(2 * D) },
      { channelId: 'c-inactive', channelName: 'Inactive', channelIsActive: false, tenantId: 't-bad', updatedAt: ago(30 * D) },
    ];
    d.pendingRuns = [
      { id: 'r-na', tenantId: 't-bad', channelId: 'c2', status: 'needs_attention', updatedAt: ago(2 * D) },
      { id: 'r-na-fresh', tenantId: 't-ok', channelId: 'c3', status: 'needs_attention', updatedAt: ago(2 * H) },
      { id: 'r-g2', tenantId: 't-bad', channelId: 'c2', status: 'paused_gate2', updatedAt: ago(1 * D) },
      { id: 'r-g1-fresh', tenantId: 't-ok', channelId: 'c3', status: 'paused_gate1', updatedAt: ago(1 * H) },
    ];
    d.untriagedBugs = { count: 4, oldest: ago(3 * D) };
    d.costGaps = { count: 3, oldest: ago(2 * D) };

    const q = buildDecisionQueue(d, NOW);
    expect(q.map((i) => i.kind).sort()).toEqual(
      [
        'budget_pool_exhausted',
        'budget_zero_share',
        'bug_untriaged',
        'cost_gap',
        'gate_pending_stale',
        'run_needs_attention_stale',
        'youtube_connection_old',
      ].sort(),
    );
    expect(q.some((i) => i.tenantId === 't-ok')).toBe(false);
    expect(q.find((i) => i.kind === 'run_needs_attention_stale')?.runId).toBe('r-na');
    expect(q.find((i) => i.kind === 'youtube_connection_old')?.channelId).toBe('c-old');
    expect(q.find((i) => i.kind === 'budget_zero_share')?.channelId).toBe('c2');
  });

  it('sorts by severity, then oldest first, and caps at 50', () => {
    const d = emptyData();
    d.pendingRuns = Array.from({ length: 60 }, (_, i) => ({
      id: `r${i}`,
      tenantId: 't',
      channelId: 'c',
      status: 'needs_attention',
      updatedAt: ago(2 * D + i * H),
    }));
    d.untriagedBugs = { count: 1, oldest: ago(10 * D) };
    const q = buildDecisionQueue(d, NOW);
    expect(q).toHaveLength(DECISION_QUEUE_CAP);
    expect(q.every((i) => i.severity === 'high')).toBe(true);
    // oldest first: r59 has the largest age
    expect(q[0].runId).toBe('r59');
    expect(q.some((i) => i.kind === 'bug_untriaged')).toBe(false);
  });
});

describe.skipIf(!SANDBOX)('admin.overview against the sandbox database', () => {
  it('returns the documented shape for the ops token and is FORBIDDEN for an owner session', async () => {
    const ops = appRouter.createCaller({ tenantId: randomUUID(), userId: null, role: 'owner', identityKind: 'ops-token' });
    const o = await ops.admin.overview();
    expect(typeof o.generatedAt).toBe('string');
    expect(o.totals.tenants).toBeGreaterThanOrEqual(0);
    expect(o.runsThisWeek.total).toBe(
      o.runsThisWeek.completed + o.runsThisWeek.failed + o.runsThisWeek.needsAttention + o.runsThisWeek.running +
        o.runsThisWeek.pausedGate1 + o.runsThisWeek.pausedGate2 + o.runsThisWeek.pending,
    );
    expect(Array.isArray(o.decisionQueue)).toBe(true);
    const owner = appRouter.createCaller({ tenantId: randomUUID(), userId: randomUUID(), role: 'owner', identityKind: 'session' });
    await expect(owner.admin.overview()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
