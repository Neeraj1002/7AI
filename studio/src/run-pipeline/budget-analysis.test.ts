import { describe, it, expect } from 'vitest';
import { analyzeBudget, type AnalyzeBudgetChannelInput } from './budget-analysis';

const ch = (
  channelId: string,
  overrideUsd: number | null,
  extra: Partial<AnalyzeBudgetChannelInput> = {},
): AnalyzeBudgetChannelInput => ({ channelId, name: channelId, isActive: true, overrideUsd, gateSpentUsd: 0, ...extra });

const codes = (a: ReturnType<typeof analyzeBudget>) => a.warnings.map((w) => w.code);
const byId = (a: ReturnType<typeof analyzeBudget>, id: string) => a.channels.find((c) => c.channelId === id)!;

describe('analyzeBudget', () => {
  it('splits a healthy pool equally with no warnings', () => {
    const a = analyzeBudget({ poolCeilingUsd: 40, channels: [ch('a', null), ch('b', null)], gateSpent: 3, weekSpent: 3 });
    expect(byId(a, 'a').effectiveCeilingUsd).toBe(20);
    expect(byId(a, 'b').effectiveCeilingUsd).toBe(20);
    expect(a.channels.map((c) => c.status)).toEqual(['ok', 'ok']);
    expect(a.warnings).toEqual([]);
    expect(a.reservedByOverridesUsd).toBe(0);
    expect(a.remainingPoolUsd).toBe(40);
  });

  it('an override smaller than the pool leaves the rest to the default-share channel', () => {
    const a = analyzeBudget({ poolCeilingUsd: 40, channels: [ch('a', 10), ch('b', null)], gateSpent: 0, weekSpent: 0 });
    expect(byId(a, 'a').effectiveCeilingUsd).toBe(10);
    expect(byId(a, 'b').effectiveCeilingUsd).toBe(30);
    expect(a.remainingPoolUsd).toBe(30);
    expect(a.warnings).toEqual([]);
  });

  it('F9: an override EQUAL to the pool starves the second channel at a $0 share', () => {
    const a = analyzeBudget({
      poolCeilingUsd: 2,
      channels: [ch('notebook', 2, { gateSpentUsd: 1.2975 }), ch('underdogs', null)],
      gateSpent: 1.2975,
      weekSpent: 1.2975,
    });
    expect(byId(a, 'underdogs').effectiveCeilingUsd).toBe(0);
    expect(byId(a, 'underdogs').status).toBe('zero_share');
    expect(byId(a, 'notebook').status).toBe('ok');
    expect(codes(a)).toContain('override_reserves_whole_pool');
    expect(codes(a)).toContain('zero_share');
    expect(codes(a)).not.toContain('override_exceeds_pool');
    expect(a.warnings.find((w) => w.code === 'zero_share')?.channelId).toBe('underdogs');
    expect(a.remainingPoolUsd).toBe(0);
  });

  it('overrides greater than the pool warn and floor the remaining pool at 0', () => {
    const a = analyzeBudget({ poolCeilingUsd: 10, channels: [ch('a', 8), ch('b', 8), ch('c', null)], gateSpent: 0, weekSpent: 0 });
    expect(codes(a)).toContain('override_exceeds_pool');
    expect(codes(a)).toContain('zero_share');
    expect(codes(a)).not.toContain('override_reserves_whole_pool');
    expect(a.reservedByOverridesUsd).toBe(16);
    expect(a.remainingPoolUsd).toBe(0);
    expect(byId(a, 'c').effectiveCeilingUsd).toBe(0);
  });

  it('no channels: no warnings but the no-channel guide check', () => {
    const a = analyzeBudget({ poolCeilingUsd: 20, channels: [], gateSpent: 0, weekSpent: 0 });
    expect(a.channels).toEqual([]);
    expect(a.warnings).toEqual([]);
  });

  it('no quota: ceilings are null, one no_quota warning, nothing throws', () => {
    const a = analyzeBudget({ poolCeilingUsd: null, channels: [ch('a', null), ch('b', null, { isActive: false })], gateSpent: 0, weekSpent: 0 });
    expect(codes(a)).toEqual(['no_quota']);
    expect(a.channels.map((c) => c.effectiveCeilingUsd)).toEqual([null, null]);
    expect(a.channels.map((c) => c.status)).toEqual(['ok', 'inactive']);
    expect(a.poolCeilingUsd).toBeNull();
  });

  it('pool already spent: pool_exhausted, and a channel at its own ceiling is at_limit', () => {
    const a = analyzeBudget({
      poolCeilingUsd: 2,
      channels: [ch('a', null, { gateSpentUsd: 2.5 })],
      gateSpent: 2.5,
      weekSpent: 2.5,
    });
    expect(codes(a)).toContain('pool_exhausted');
    expect(byId(a, 'a').status).toBe('at_limit');
  });

  it('below_guide: a $40 budget over three active channels, with the gate module wording', () => {
    const a = analyzeBudget({ poolCeilingUsd: 40, channels: [ch('a', null), ch('b', null), ch('c', null)], gateSpent: 0, weekSpent: 0 });
    const w = a.warnings.find((x) => x.code === 'below_guide');
    expect(w?.message).toContain('$40.00 weekly budget');
    expect(w?.message).toContain('3 active channel(s)');
    expect(codes(a)).not.toContain('zero_share');
  });

  it('override_starves_others: an override leaves another channel a positive share below the $5 floor', () => {
    const a = analyzeBudget({ poolCeilingUsd: 20, channels: [ch('big', 18), ch('small', null)], gateSpent: 0, weekSpent: 0 });
    expect(byId(a, 'small').effectiveCeilingUsd).toBe(2);
    const w = a.warnings.find((x) => x.code === 'override_starves_others');
    expect(w?.channelId).toBe('small');
    expect(codes(a)).not.toContain('zero_share');
  });

  it('inactive channels are listed but do not take part in the split', () => {
    const a = analyzeBudget({ poolCeilingUsd: 30, channels: [ch('a', null), ch('sample', null, { isActive: false })], gateSpent: 0, weekSpent: 0 });
    expect(byId(a, 'a').effectiveCeilingUsd).toBe(30);
    expect(byId(a, 'sample').effectiveCeilingUsd).toBeNull();
    expect(byId(a, 'sample').status).toBe('inactive');
  });
});
