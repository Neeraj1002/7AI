import { describe, it, expect } from 'vitest';
import { estimateRunCost, suggestMaxUsd, longFormStillCount } from './cost-estimate';
import { resolveAiVisualsPurpose, resolveImagePricing } from '../ai-visuals/registry';

describe('suggestMaxUsd', () => {
  it('is 1.5x the estimate rounded up to the next fifty cents', () => {
    expect(suggestMaxUsd(2.0)).toBe(3);
    expect(suggestMaxUsd(2.1)).toBe(3.5);
    expect(suggestMaxUsd(0.5)).toBe(1);
    expect(suggestMaxUsd(1.0)).toBe(1.5);
  });
});

describe('longFormStillCount', () => {
  it('is ceil(seconds / secondsPerStill) clamped to 12..200', () => {
    expect(longFormStillCount(600, 5)).toBe(120);
    expect(longFormStillCount(120, 5)).toBe(24);
    expect(longFormStillCount(120, 10)).toBe(12);
    expect(longFormStillCount(900, 1)).toBe(200);
  });
});

describe('estimateRunCost (long)', () => {
  it('prices stills through resolveImagePricing and lands near the pilot figure for 10 minutes', () => {
    const e = estimateRunCost({ videoKind: 'long', targetSeconds: 600 });
    expect(e.breakdown.stillCount).toBe(120);
    expect(e.breakdown.stillsUsd).toBeCloseTo(120 * resolveImagePricing(resolveAiVisualsPurpose('still-generation').model).perImageUsd, 4);
    expect(e.estimateUsd).toBeGreaterThan(0.8);
    expect(e.estimateUsd).toBeLessThan(2.5);
    expect(e.suggestedMaxUsd).toBeGreaterThanOrEqual(e.estimateUsd * 1.5);
  });
  it('worst case pays for stills once and everything else three times', () => {
    const e = estimateRunCost({ videoKind: 'long', targetSeconds: 600 });
    const rest = e.estimateUsd - e.breakdown.stillsUsd;
    expect(e.worstCaseUsd).toBeCloseTo(e.breakdown.stillsUsd + rest * 3, 3);
  });
  it('grows with length and with a shorter secondsPerStill', () => {
    const two = estimateRunCost({ videoKind: 'long', targetSeconds: 120 }).estimateUsd;
    const ten = estimateRunCost({ videoKind: 'long', targetSeconds: 600 }).estimateUsd;
    const denser = estimateRunCost({ videoKind: 'long', targetSeconds: 600, secondsPerStill: 2.5 }).estimateUsd;
    expect(two).toBeLessThan(ten);
    expect(ten).toBeLessThan(denser);
  });
});

describe('estimateRunCost (short)', () => {
  it('is far below a long video', () => {
    expect(estimateRunCost({ videoKind: 'short', targetSeconds: 45 }).estimateUsd).toBeLessThan(0.5);
  });
});
