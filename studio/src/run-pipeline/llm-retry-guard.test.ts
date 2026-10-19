import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ checkBudget: vi.fn(), sumUsageCostForRun: vi.fn(), findChannelById: vi.fn() }));
vi.mock('./budget-gate', async (orig) => ({ ...(await orig<object>()), checkBudget: mocks.checkBudget }));
vi.mock('../models/repositories/usage-event.repository', () => ({ sumUsageCostForRun: mocks.sumUsageCostForRun }));
vi.mock('../models/repositories/channel.repository', () => ({ findChannelById: mocks.findChannelById }));

import { makeLlmRetryGuard } from './llm-retry-guard';

const run = { id: 'run-1', tenantId: 't1', channelId: 'c1', creationOptions: null };
const info = { purpose: 'script-generation' as const, reason: 'cut-off' as const, unbookedCostUsd: 0.25 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findChannelById.mockResolvedValue({ id: 'c1', platform: 'youtube', name: 'NIYT' });
  mocks.sumUsageCostForRun.mockResolvedValue(0);
  mocks.checkBudget.mockResolvedValue({ ok: true });
});

describe('makeLlmRetryGuard (R5: each retry is checked by the same rule the stage uses)', () => {
  it('allows a retry when the weekly budget has room, passing what is spent but not yet booked', async () => {
    expect(await makeLlmRetryGuard(run)(info)).toBeNull();
    expect(mocks.checkBudget).toHaveBeenCalledWith('t1', 'c1', 'youtube', expect.any(Date), 0.25);
  });

  it('refuses with the budget gate\'s own words when the account or channel is over', async () => {
    mocks.checkBudget.mockResolvedValue({ ok: false, scope: 'pool', spentUsd: 10, ceilingUsd: 10, channelId: 'c1', channelName: 'NIYT', shareReservedByOverrides: false, resetsAt: new Date() });
    expect(await makeLlmRetryGuard(run)(info)).toBe('Account spend limit reached: $10.00 used of $10.00 this week. Resets Monday 00:00 UTC.');
  });

  it('refuses when the per-video limit the user set is reached, counting the unbooked spend', async () => {
    mocks.sumUsageCostForRun.mockResolvedValue(0.8);
    const refusal = await makeLlmRetryGuard({ ...run, creationOptions: { maxCostUsd: 1 } })({ ...info, unbookedCostUsd: 0.25 });
    expect(refusal).toContain('Spend limit reached: this video has used $1.05 of its $1.00 limit');
    expect(mocks.checkBudget).not.toHaveBeenCalled();
  });

  it('allows a retry under the per-video limit', async () => {
    mocks.sumUsageCostForRun.mockResolvedValue(0.5);
    expect(await makeLlmRetryGuard({ ...run, creationOptions: { maxCostUsd: 1 } })(info)).toBeNull();
  });
});
