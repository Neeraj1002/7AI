import { describe, it, expect, vi, beforeEach } from 'vitest';

// Bugs Closure R1 (D4) — the gate makes BOTH checks on every decision: the channel's spend against
// its ceiling, and the tenant's total against the weekly budget. Repositories are mocked.
const mocks = vi.hoisted(() => ({
  findAgentQuota: vi.fn(),
  listActiveChannelsByTenantAndPlatform: vi.fn(),
  sumUsageCostForTenantPlatform: vi.fn(),
  sumUsageCostForTenantChannelPlatform: vi.fn(),
  listChannelIdsWithCredential: vi.fn(),
}));
vi.mock('../models/repositories/agent-credential.repository', () => ({
  listChannelIdsWithCredential: mocks.listChannelIdsWithCredential,
}));
vi.mock('../models/repositories/agent-quota.repository', () => ({ findAgentQuota: mocks.findAgentQuota }));
vi.mock('../models/repositories/channel.repository', () => ({
  listActiveChannelsByTenantAndPlatform: mocks.listActiveChannelsByTenantAndPlatform,
}));
vi.mock('../models/repositories/usage-event.repository', () => ({
  sumUsageCostForTenantPlatform: mocks.sumUsageCostForTenantPlatform,
  sumUsageCostForTenantChannelPlatform: mocks.sumUsageCostForTenantChannelPlatform,
}));

import { checkBudget, loadChannelBudgetView, NoBudgetConfiguredError, DEFAULT_WEEKLY_BUDGET_USD, MIN_CHANNEL_SHARE_USD } from './budget-gate';

const channels = [
  { id: 'a', name: 'A', budgetOverrideUsd: null },
  { id: 'b', name: 'B', budgetOverrideUsd: null },
];

describe('checkBudget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findAgentQuota.mockResolvedValue({ budgetCeilingUsd: '40' });
    mocks.listActiveChannelsByTenantAndPlatform.mockResolvedValue(channels);
    mocks.listChannelIdsWithCredential.mockImplementation(async (ids: string[]) => new Set(ids));
  });

  it('refuses with scope pool when channel A is under its ceiling but the tenant total is at the weekly budget', async () => {
    mocks.sumUsageCostForTenantPlatform.mockResolvedValue(40);
    mocks.sumUsageCostForTenantChannelPlatform.mockResolvedValue(3);
    const result = await checkBudget('t', 'a', 'youtube');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.scope).toBe('pool');
    expect(!result.ok && result.spentUsd).toBe(40);
  });

  it('refuses with scope channel when the channel is at its equal share but the tenant total is under budget', async () => {
    mocks.sumUsageCostForTenantPlatform.mockResolvedValue(25);
    mocks.sumUsageCostForTenantChannelPlatform.mockResolvedValue(20);
    const result = await checkBudget('t', 'a', 'youtube');
    expect(!result.ok && result.scope).toBe('channel');
    expect(!result.ok && result.ceilingUsd).toBe(20);
  });

  it('allows a run when both are under, and queries only the current week', async () => {
    mocks.sumUsageCostForTenantPlatform.mockResolvedValue(10);
    mocks.sumUsageCostForTenantChannelPlatform.mockResolvedValue(5);
    expect((await checkBudget('t', 'a', 'youtube', new Date('2026-10-07T12:00:00Z'))).ok).toBe(true);
    const since = mocks.sumUsageCostForTenantPlatform.mock.calls[0][2] as Date;
    expect(since.toISOString()).toBe('2026-10-05T00:00:00.000Z');
  });

  it('throws when the tenant has no budget row', async () => {
    mocks.findAgentQuota.mockResolvedValue(null);
    await expect(checkBudget('t', 'a', 'youtube')).rejects.toBeInstanceOf(NoBudgetConfiguredError);
  });
});

// Bugs Task 12 (R7) - the new-tenant default and who counts in the divisor.
describe('default budget shared across YouTube-connected channels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listChannelIdsWithCredential.mockImplementation(async (ids: string[]) => new Set(ids));
  });
  const many = (n: number) => Array.from({ length: n }, (_, i) => ({ id: 'c' + i, name: 'C' + i, budgetOverrideUsd: null as number | null }));
  const shares = async (n: number) => {
    mocks.findAgentQuota.mockResolvedValue({ budgetCeilingUsd: String(DEFAULT_WEEKLY_BUDGET_USD) });
    mocks.listActiveChannelsByTenantAndPlatform.mockResolvedValue(many(n));
    return [...(await loadChannelBudgetView('t', 'youtube')).ceilings.values()];
  };

  it('the default is $10 a week', () => expect(DEFAULT_WEEKLY_BUDGET_USD).toBe(10));

  it('1, 2, 3 and 7 connected channels split $10 equally (the $5 minimum is NOT enforced at run time)', async () => {
    expect(await shares(1)).toEqual([10]);
    expect(await shares(2)).toEqual([5, 5]);
    expect((await shares(3))[0]).toBeCloseTo(10 / 3);
    expect((await shares(7))[0]).toBeCloseTo(10 / 7);
    expect(10 / 3).toBeLessThan(MIN_CHANNEL_SHARE_USD);
  });

  it('an unconnected channel takes no share; disconnecting re-divides at once', async () => {
    mocks.findAgentQuota.mockResolvedValue({ budgetCeilingUsd: '10' });
    mocks.listActiveChannelsByTenantAndPlatform.mockResolvedValue(many(3));
    mocks.listChannelIdsWithCredential.mockResolvedValue(new Set(['c0', 'c1']));
    expect([...(await loadChannelBudgetView('t', 'youtube')).ceilings.values()]).toEqual([5, 5]);
    mocks.listChannelIdsWithCredential.mockResolvedValue(new Set(['c0']));
    expect([...(await loadChannelBudgetView('t', 'youtube')).ceilings.values()]).toEqual([10]);
  });

  it('an override keeps its value and the rest split the remainder', async () => {
    mocks.findAgentQuota.mockResolvedValue({ budgetCeilingUsd: '10' });
    const list = many(3);
    list[0].budgetOverrideUsd = 4;
    mocks.listActiveChannelsByTenantAndPlatform.mockResolvedValue(list);
    const view = await loadChannelBudgetView('t', 'youtube');
    expect([view.ceilings.get('c0'), view.ceilings.get('c1'), view.ceilings.get('c2')]).toEqual([4, 3, 3]);
  });

  it('a run on a channel that lost its connection is still bounded by the pool, not refused as unknown', async () => {
    mocks.findAgentQuota.mockResolvedValue({ budgetCeilingUsd: '10' });
    mocks.listActiveChannelsByTenantAndPlatform.mockResolvedValue(many(2));
    mocks.listChannelIdsWithCredential.mockResolvedValue(new Set(['c0']));
    mocks.sumUsageCostForTenantPlatform.mockResolvedValue(1);
    mocks.sumUsageCostForTenantChannelPlatform.mockResolvedValue(1);
    expect((await checkBudget('t', 'c1', 'youtube')).ok).toBe(true);
  });
});
