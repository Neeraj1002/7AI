import { describe, it, expect } from 'vitest';
import { priceStill, resolveImagePricing } from './registry';

// Sprint 4 Task 11 (R3): usage figures below are the real response from
// gpt-image-2.5-flare, 1024x1536 'low', measured 2026-10-11.
const MEASURED_USAGE = {
  input_tokens: 29,
  input_tokens_details: { image_tokens: 0, text_tokens: 29 },
  output_tokens: 158,
};

describe('priceStill', () => {
  it('prices a token-billed model from the response usage', () => {
    const pricing = resolveImagePricing('gpt-image-2.5-flare');
    // 158 * $30/M + 29 * $5/M
    expect(priceStill(pricing, MEASURED_USAGE)).toBeCloseTo(0.004885, 6);
  });

  it('prices image input tokens at the image input rate', () => {
    const pricing = resolveImagePricing('gpt-image-2.5-flare');
    const usage = { ...MEASURED_USAGE, input_tokens_details: { image_tokens: 1000, text_tokens: 0 } };
    expect(priceStill(pricing, usage)).toBeCloseTo((158 * 30 + 1000 * 8) / 1e6, 8);
  });

  it('falls back to the flat measured price when the response has no usage', () => {
    const pricing = resolveImagePricing('gpt-image-2.5-flare');
    expect(priceStill(pricing, undefined)).toBe(0.005);
    expect(priceStill(pricing, {})).toBe(0.005);
  });

  it('keeps the flat price for the legacy model regardless of usage', () => {
    const pricing = resolveImagePricing('gpt-image-1.5');
    expect(priceStill(pricing, { output_tokens: 591, input_tokens: 29 })).toBe(0.013);
  });

  it('prices the dated snapshot and the alias the same', () => {
    expect(resolveImagePricing('gpt-image-2.5-flare-2026-09-08')).toEqual(resolveImagePricing('gpt-image-2.5-flare'));
  });
});

describe('resolveImagePricing', () => {
  it('still throws for an unknown model — a missing price stays loud', () => {
    expect(() => resolveImagePricing('gpt-image-9')).toThrow(/No image pricing entry/);
  });
});
