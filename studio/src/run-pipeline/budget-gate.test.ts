import { describe, it, expect, vi } from 'vitest';
import {
  computeChannelBudgetCeilings,
  currentBudgetWindowStart,
  nextBudgetWindowStart,
  describeBudgetRefusal,
  validateBudgetOverride,
  type BudgetRefusal,
} from './budget-gate';

// Week 5 Task 4 (C4) — computeChannelBudgetCeilings is deliberately pure
// (no DB access), isolated exactly so its allocation math can be unit
// tested directly. DB-backed integration tests (isBudgetAvailable itself,
// against a real Postgres instance) are explicitly deferred — see this
// task's report.

describe('computeChannelBudgetCeilings', () => {
  it('splits the pool equally across channels when none have an override', () => {
    const ceilings = computeChannelBudgetCeilings({
      poolCeilingUsd: 10,
      channels: [
        { channelId: 'a', budgetOverrideUsd: null },
        { channelId: 'b', budgetOverrideUsd: null },
      ],
    });
    expect(ceilings.get('a')).toBe(5);
    expect(ceilings.get('b')).toBe(5);
  });

  it('gives an overridden channel exactly its override, and splits the remainder among the rest', () => {
    const ceilings = computeChannelBudgetCeilings({
      poolCeilingUsd: 10,
      channels: [
        { channelId: 'a', budgetOverrideUsd: 8 },
        { channelId: 'b', budgetOverrideUsd: null },
      ],
    });
    expect(ceilings.get('a')).toBe(8);
    expect(ceilings.get('b')).toBe(2);
  });

  it('splits the remaining pool across multiple default-share channels after an override', () => {
    const ceilings = computeChannelBudgetCeilings({
      poolCeilingUsd: 10,
      channels: [
        { channelId: 'a', budgetOverrideUsd: 4 },
        { channelId: 'b', budgetOverrideUsd: null },
        { channelId: 'c', budgetOverrideUsd: null },
      ],
    });
    expect(ceilings.get('a')).toBe(4);
    expect(ceilings.get('b')).toBe(3);
    expect(ceilings.get('c')).toBe(3);
  });

  it('gives every channel its own override when all channels are overridden (no divide-by-zero)', () => {
    const ceilings = computeChannelBudgetCeilings({
      poolCeilingUsd: 10,
      channels: [
        { channelId: 'a', budgetOverrideUsd: 3 },
        { channelId: 'b', budgetOverrideUsd: 3 },
      ],
    });
    expect(ceilings.get('a')).toBe(3);
    expect(ceilings.get('b')).toBe(3);
  });

  it('floors the default-share pool at 0 and warns when overrides alone exceed the pool', () => {
    const onOverrideExceedsPool = vi.fn();
    const ceilings = computeChannelBudgetCeilings({
      poolCeilingUsd: 10,
      channels: [
        { channelId: 'a', budgetOverrideUsd: 15 },
        { channelId: 'b', budgetOverrideUsd: null },
      ],
      onOverrideExceedsPool,
    });
    expect(ceilings.get('a')).toBe(15); // an override always gets exactly what it asked for
    expect(ceilings.get('b')).toBe(0); // but the default-share channel gets nothing, not a negative share
    expect(onOverrideExceedsPool).toHaveBeenCalledWith({ reservedByOverrides: 15, poolCeilingUsd: 10 });
  });

  it('does not call onOverrideExceedsPool when overrides fit within the pool', () => {
    const onOverrideExceedsPool = vi.fn();
    computeChannelBudgetCeilings({
      poolCeilingUsd: 10,
      channels: [{ channelId: 'a', budgetOverrideUsd: 8 }],
      onOverrideExceedsPool,
    });
    expect(onOverrideExceedsPool).not.toHaveBeenCalled();
  });

  it('gives a lone default-share channel the entire pool', () => {
    const ceilings = computeChannelBudgetCeilings({
      poolCeilingUsd: 7,
      channels: [{ channelId: 'a', budgetOverrideUsd: null }],
    });
    expect(ceilings.get('a')).toBe(7);
  });

  it('returns an empty map for an empty channel list, without throwing', () => {
    const ceilings = computeChannelBudgetCeilings({ poolCeilingUsd: 10, channels: [] });
    expect(ceilings.size).toBe(0);
  });
});

// Bugs Closure R1 — F9: overrides that equal the pool starve every other channel silently.
describe('computeChannelBudgetCeilings — pool fully reserved (F9)', () => {
  it('warns and gives default-share channels $0 when overrides equal the pool exactly', () => {
    const onPoolFullyReserved = vi.fn();
    const onOverrideExceedsPool = vi.fn();
    const ceilings = computeChannelBudgetCeilings({
      poolCeilingUsd: 2,
      channels: [
        { channelId: 'notebook', budgetOverrideUsd: 2 },
        { channelId: 'underdogs', budgetOverrideUsd: null },
      ],
      onPoolFullyReserved,
      onOverrideExceedsPool,
    });
    expect(ceilings.get('underdogs')).toBe(0);
    expect(onPoolFullyReserved).toHaveBeenCalledWith({
      reservedByOverrides: 2,
      poolCeilingUsd: 2,
      starvedChannelIds: ['underdogs'],
    });
    expect(onOverrideExceedsPool).not.toHaveBeenCalled();
  });

  it('does not warn when every channel is overridden, even if the overrides use the whole pool', () => {
    const onPoolFullyReserved = vi.fn();
    computeChannelBudgetCeilings({
      poolCeilingUsd: 4,
      channels: [
        { channelId: 'a', budgetOverrideUsd: 2 },
        { channelId: 'b', budgetOverrideUsd: 2 },
      ],
      onPoolFullyReserved,
    });
    expect(onPoolFullyReserved).not.toHaveBeenCalled();
  });
});

// Bugs Closure R1 (D1) — the window is Monday 00:00 UTC.
describe('weekly budget window', () => {
  it('counts a Sunday 23:59:59 UTC event as last week and a Monday 00:00:00 UTC event as this week', () => {
    // Monday 2026-10-05 12:00 UTC is "now"; the window starts that Monday 00:00 UTC.
    const now = new Date('2026-10-05T12:00:00Z');
    const start = currentBudgetWindowStart(now);
    expect(start.toISOString()).toBe('2026-10-05T00:00:00.000Z');
    const sundayEvent = new Date('2026-10-04T23:59:59Z');
    const mondayEvent = new Date('2026-10-05T00:00:00Z');
    expect(sundayEvent >= start).toBe(false);
    expect(mondayEvent >= start).toBe(true);
  });

  it('maps every day of the week to the same Monday and resets the following Monday', () => {
    for (const day of ['2026-10-05', '2026-10-06', '2026-10-09', '2026-10-11']) {
      const now = new Date(`${day}T23:59:59Z`);
      expect(currentBudgetWindowStart(now).toISOString()).toBe('2026-10-05T00:00:00.000Z');
      expect(nextBudgetWindowStart(now).toISOString()).toBe('2026-10-12T00:00:00.000Z');
    }
  });

  it('crosses month and year boundaries', () => {
    expect(currentBudgetWindowStart(new Date('2026-01-01T10:00:00Z')).toISOString()).toBe('2025-12-29T00:00:00.000Z');
    expect(nextBudgetWindowStart(new Date('2026-12-30T10:00:00Z')).toISOString()).toBe('2027-01-04T00:00:00.000Z');
  });
});

describe('describeBudgetRefusal', () => {
  const base: BudgetRefusal = {
    ok: false,
    scope: 'pool',
    spentUsd: 2.14,
    ceilingUsd: 2,
    channelId: 'c1',
    channelName: 'Underdogs',
    shareReservedByOverrides: false,
    resetsAt: new Date('2026-10-12T00:00:00Z'),
  };

  it('names the account limit with the used and ceiling numbers', () => {
    expect(describeBudgetRefusal(base)).toBe(
      'Account spend limit reached: $2.14 used of $2.00 this week. Resets Monday 00:00 UTC.',
    );
  });

  it('names the channel when its own ceiling is the one hit', () => {
    expect(describeBudgetRefusal({ ...base, scope: 'channel', spentUsd: 0.91, ceilingUsd: 0.9 })).toBe(
      'Limit for channel "Underdogs" reached: $0.91 used of $0.90 this week. Resets Monday 00:00 UTC.',
    );
  });

  it('explains a $0 share caused by another channel\'s override', () => {
    const text = describeBudgetRefusal({
      ...base,
      scope: 'channel',
      spentUsd: 0.73,
      ceilingUsd: 0,
      shareReservedByOverrides: true,
    });
    expect(text).toContain('Channel "Underdogs" has a $0.00 share');
    expect(text).toContain("another channel's override reserves the whole account limit");
  });
});

describe('validateBudgetOverride', () => {
  const channels = [
    { id: 'notebook', name: 'Not In Your Notebook', budgetOverrideUsd: null },
    { id: 'underdogs', name: 'Underdogs', budgetOverrideUsd: null },
  ];

  it('rejects an override that leaves nothing for the other active channels, naming them', () => {
    const verdict = validateBudgetOverride({ poolCeilingUsd: 2, channelId: 'notebook', newOverrideUsd: 2, channels });
    expect(verdict.ok).toBe(false);
    expect(!verdict.ok && verdict.message).toContain('"Underdogs"');
  });

  it('rejects an override greater than the whole pool', () => {
    const verdict = validateBudgetOverride({ poolCeilingUsd: 2, channelId: 'notebook', newOverrideUsd: 5, channels });
    expect(!verdict.ok && verdict.message).toContain('more than the whole weekly account limit');
  });

  it('accepts an override that leaves room for the others', () => {
    expect(validateBudgetOverride({ poolCeilingUsd: 40, channelId: 'notebook', newOverrideUsd: 20, channels }).ok).toBe(true);
  });

  it('accepts a full-pool override when no other channel needs a share', () => {
    const only = [{ id: 'notebook', name: 'Not In Your Notebook', budgetOverrideUsd: null }];
    expect(validateBudgetOverride({ poolCeilingUsd: 2, channelId: 'notebook', newOverrideUsd: 2, channels: only }).ok).toBe(true);
  });
});
