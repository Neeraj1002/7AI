// Sprint 5 Task 7 R2 — cost sums on a fixture. Run with the server's vitest: cd studio && npx vitest run --root ../app
import { describe, it, expect } from 'vitest';
import { attemptsAddUp, costBreakdownOf, costMapOf, formatMoney, stageCostText } from './run-cost';

// The first acceptance run: three video attempts, $0.5492 in all.
const server = {
  costBreakdown: {
    totalUsd: 0.5492,
    estimateUsd: 0.24,
    limitUsd: 1,
    attempts: [
      { stageName: 'video_generation', attemptNumber: 1, totalUsd: 0.2, stages: [{ name: 'Voice', usd: 0.04 }, { name: 'Images', usd: 0.13 }, { name: 'Video review', usd: 0.03 }] },
      { stageName: 'video_generation', attemptNumber: 2, totalUsd: 0.2, stages: [{ name: 'Images', usd: 0.2 }] },
      { stageName: 'video_generation', attemptNumber: 3, totalUsd: 0.1492, failed: false, stages: [{ name: 'Video review', usd: 0, failed: true }] },
    ],
  },
};

describe('cost breakdown', () => {
  it('reads the server fields and the attempts add up to the total', () => {
    const b = costBreakdownOf(server)!;
    expect(b.totalUsd).toBe(0.5492);
    expect(b.estimateUsd).toBe(0.24);
    expect(b.attempts).toHaveLength(3);
    expect(attemptsAddUp(b)).toBe(true);
    expect(costMapOf(b).get('video_generation:3')?.totalUsd).toBe(0.1492);
  });
  it('is null on an older server and on malformed data', () => {
    expect(costBreakdownOf({})).toBeNull();
    expect(costBreakdownOf({ costBreakdown: { totalUsd: 'x', attempts: [] } })).toBeNull();
    expect(costBreakdownOf(undefined)).toBeNull();
  });
  it('detects attempts that do not add up', () => {
    const b = costBreakdownOf({ costBreakdown: { totalUsd: 1, attempts: [{ stageName: 'a', attemptNumber: 1, totalUsd: 0.4, stages: [] }] } })!;
    expect(attemptsAddUp(b)).toBe(false);
  });
});

describe('money text', () => {
  it('uses 4 decimals only under one cent', () => {
    expect(formatMoney(0.0053)).toBe('$0.0053');
    expect(formatMoney(0.5492)).toBe('$0.55');
    expect(formatMoney(0)).toBe('$0.00');
    expect(formatMoney(1)).toBe('$1.00');
  });
  it('a $0 failed provider call reads as failed, not as free or an error', () => {
    expect(stageCostText({ name: 'Video review', usd: 0, failed: true })).toBe('failed, not charged');
    expect(stageCostText({ name: 'Voice', usd: 0.04, failed: false })).toBe('$0.04');
  });
});
