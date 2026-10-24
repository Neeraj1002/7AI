import { describe, it, expect } from 'vitest';
import { assertPurposeConfig, LLM_REGISTRY, MODEL_PRICING, resolvePricing } from './registry';
import { MODEL_FACTS, resolveModelFacts } from './models';
import { cutOffRetryLimit } from './failure-policy';
import { PURPOSES } from './types';

// LLM Registry task, Part B (R7): the model facts table, and what the registry may ask of it.
describe('model facts table', () => {
  it.each(Object.entries(MODEL_FACTS))('%s: every column is filled with a sane value', (model, facts) => {
    expect(facts.maxOutputTokens).toBeGreaterThan(0);
    expect(facts.streamingAboveTokens).toBeGreaterThan(0);
    expect(facts.streamingAboveTokens).toBeLessThanOrEqual(facts.maxOutputTokens);
    expect(typeof facts.supportsReasoning).toBe('boolean');
    expect(typeof facts.supportsStructuredOutput).toBe('boolean');
    // The pinned id is the model's own id (a dateless id is its own snapshot) or a dated snapshot of it.
    expect(facts.pinnedId === model || /^.+-\d{8}$/.test(facts.pinnedId)).toBe(true);
    if (facts.pinnedId !== model) expect(facts.pinnedId.startsWith(`${model}-`)).toBe(true);
  });

  it('every model with facts has a pricing row, and every pricing row has facts (extends the R8.6 rule, no second list)', () => {
    expect(Object.keys(MODEL_FACTS).sort()).toEqual(Object.keys(MODEL_PRICING).sort());
  });

  it('every model a purpose uses has both a facts row and a pricing row', () => {
    for (const { model } of Object.values(LLM_REGISTRY)) {
      expect(() => resolveModelFacts(model)).not.toThrow();
      expect(() => resolvePricing(model)).not.toThrow();
    }
  });
});

describe.each([...PURPOSES])('%s against its model facts', (purpose) => {
  const entry = LLM_REGISTRY[purpose];
  const facts = MODEL_FACTS[entry.model];

  it('its limit and its cut-off retry limit are at most the model maximum', () => {
    expect(entry.maxOutputTokens).toBeLessThanOrEqual(facts.maxOutputTokens);
    expect(cutOffRetryLimit(entry.maxOutputTokens, facts.maxOutputTokens)).toBeLessThanOrEqual(facts.maxOutputTokens);
    expect(cutOffRetryLimit(entry.maxOutputTokens, facts.maxOutputTokens)).toBeLessThanOrEqual(32_000);
  });

  it('reasoning is requested only where the model supports it', () => {
    if (entry.reasoning !== 'off') expect(facts.supportsReasoning).toBe(true);
    expect(() => assertPurposeConfig(purpose)).not.toThrow();
  });
});

describe('cutOffRetryLimit', () => {
  it('doubles, then stops at 32,000, then at the model maximum', () => {
    expect(cutOffRetryLimit(4_000, 64_000)).toBe(8_000);
    expect(cutOffRetryLimit(16_000, 64_000)).toBe(32_000);
    expect(cutOffRetryLimit(20_000, 64_000)).toBe(32_000);
    expect(cutOffRetryLimit(16_000, 20_000)).toBe(20_000);
  });
});
