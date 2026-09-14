import { describe, it, expect, vi } from 'vitest';
import { computeChannelBudgetCeilings } from './budget-gate';

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
