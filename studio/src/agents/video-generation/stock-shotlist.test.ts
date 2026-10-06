import { describe, it, expect } from 'vitest';
import { planShotSegment, excludedSourceIds } from './stock-shotlist';

describe('planShotSegment (Sprint 4 Task 8, R5): no clip ever loops', () => {
  it('trims a long clip to its beat window', () => {
    const seg = planShotSegment({ positionSeconds: 0, windowEndSeconds: 4, clipSeconds: 12, isLast: false, totalSeconds: 20 });
    expect(seg).toEqual({ useSeconds: 4, holdSeconds: 0 });
  });

  it('a short middle clip contributes only what it has; the deficit rolls to the next beat', () => {
    const first = planShotSegment({ positionSeconds: 0, windowEndSeconds: 6, clipSeconds: 4, isLast: false, totalSeconds: 20 });
    expect(first).toEqual({ useSeconds: 4, holdSeconds: 0 });
    const second = planShotSegment({ positionSeconds: 4, windowEndSeconds: 12, clipSeconds: 20, isLast: false, totalSeconds: 20 });
    expect(second.useSeconds).toBe(8); // window END is the target, so it absorbs the deficit
  });

  it('only the final clip is extended (frame hold) when footage still falls short of the voiceover', () => {
    const last = planShotSegment({ positionSeconds: 16, windowEndSeconds: 20, clipSeconds: 2, isLast: true, totalSeconds: 20 });
    expect(last.useSeconds).toBe(2);
    expect(last.holdSeconds).toBeCloseTo(2.25, 5);
    expect(last.useSeconds + last.holdSeconds + 16).toBeGreaterThanOrEqual(20);
  });

  it('never extends a non-final clip', () => {
    const mid = planShotSegment({ positionSeconds: 0, windowEndSeconds: 10, clipSeconds: 1, isLast: false, totalSeconds: 20 });
    expect(mid.holdSeconds).toBe(0);
  });
});

// Bugs Closure R6 — a revise attempt must not get a clip an earlier attempt of the run used.
describe('excludedSourceIds', () => {
  it('combines earlier attempts\' ids with this attempt\'s, without duplicates', () => {
    expect(excludedSourceIds(['1', '2'], ['2', '3']).sort()).toEqual(['1', '2', '3']);
  });
  it('is just this attempt\'s ids on a first attempt (no previous ids)', () => {
    expect(excludedSourceIds(undefined, ['7'])).toEqual(['7']);
  });
});
