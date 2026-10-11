import { describe, it, expect, vi, beforeEach } from 'vitest';

// Bugs Closure R1 (D4) — the gate makes BOTH checks on every decision: the channel's spend against
// its ceiling, and the tenant's total against the weekly budget. Repositories are mocked.
const mocks = vi.hoisted(() => ({
  findAgentQuota: vi.fn(),
  listActiveChannelsByTenantAndPlatform: vi.fn(),
  sumUsageCostForTenantPlatform: vi.fn(),
  sumUsageCostForTenantChannelPlatform: vi.fn(),
}));
vi.mock('../models/repositories/agent-quota.repository', () => ({ findAgentQuota: mocks.findAgentQuota }));
vi.mock('../models/repositories/channel.repository', () => ({
  listActiveChannelsByTenantAndPlatform: mocks.listActiveChannelsByTenantAndPlatform,
}));
vi.mock('../models/repositories/usage-event.repository', () => ({
  sumUsageCostForTenantPlatform: mocks.sumUsageCostForTenantPlatform,
  sumUsageCostForTenantChannelPlatform: mocks.sumUsageCostForTenantChannelPlatform,
}));

import { checkBudget, NoBudgetConfiguredError } from './budget-gate';

const channels = [
  { id: 'a', name: 'A', budgetOverrideUsd: null },
  { id: 'b', name: 'B', budgetOverrideUsd: null },
];

describe('checkBudget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findAgentQuota.mockResolvedValue({ budgetCeilingUsd: '40' });
    mocks.listActiveChannelsByTenantAndPlatform.mockResolvedValue(channels);
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
