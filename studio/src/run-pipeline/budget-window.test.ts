import { describe, it, expect } from 'vitest';
import { currentBudgetWindowStart, nextBudgetWindowStart } from './budget-gate';

// Admin Sprint 1 (R8) - the week boundary the admin screens share with the gate. The task asked
// for a new util/week.ts helper only if budget-gate did not already export one; it does
// (currentBudgetWindowStart), so this pins its boundary instead of adding a duplicate.
describe('weekly window boundary (Monday 00:00 UTC)', () => {
  it('Sunday 23:59:59 UTC belongs to the week that started the previous Monday', () => {
    expect(currentBudgetWindowStart(new Date('2026-10-04T23:59:59.000Z')).toISOString()).toBe('2026-09-28T00:00:00.000Z');
  });

  it('Monday 00:00:00 UTC starts a new week', () => {
    const monday = new Date('2026-10-05T00:00:00.000Z');
    expect(currentBudgetWindowStart(monday).toISOString()).toBe('2026-10-05T00:00:00.000Z');
    expect(nextBudgetWindowStart(monday).toISOString()).toBe('2026-10-12T00:00:00.000Z');
  });

  it('handles an input written with a non-UTC offset by its UTC instant', () => {
    // 2026-10-05 03:00 at +05:30 is Sunday 2026-10-04 21:30 UTC, so still the previous week
    expect(currentBudgetWindowStart(new Date('2026-10-05T03:00:00+05:30')).toISOString()).toBe('2026-09-28T00:00:00.000Z');
    // 2026-10-05 05:30 at +05:30 is exactly Monday 00:00 UTC
    expect(currentBudgetWindowStart(new Date('2026-10-05T05:30:00+05:30')).toISOString()).toBe('2026-10-05T00:00:00.000Z');
  });
});
