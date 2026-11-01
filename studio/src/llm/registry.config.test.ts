import { describe, it, expect } from 'vitest';
import { assertPurposeConfig, LLM_REGISTRY, MODEL_PRICING, resolvePricing, type RegistryEntry } from './registry';
import { MODEL_FACTS, resolveModelFacts } from './models';
import { PURPOSES } from './types';

// LLM Registry task (R1): every purpose declares its model, output limit and reasoning setting.
describe('every purpose declares model, output limit and reasoning', () => {
  it('has an entry for every purpose in PURPOSES', () => {
    expect(Object.keys(LLM_REGISTRY).sort()).toEqual([...PURPOSES].sort());
  });

  it.each([...PURPOSES])('%s: a model, a limit, a reasoning setting, and a valid combination', (purpose) => {
    const entry = LLM_REGISTRY[purpose];
    expect(entry.model.length).toBeGreaterThan(0);
    expect(entry.label.length).toBeGreaterThan(0);
    expect(Number.isInteger(entry.maxOutputTokens)).toBe(true);
    expect(entry.maxOutputTokens).toBeGreaterThan(0);
    expect(entry.reasoning === 'off' || typeof entry.reasoning.budgetTokens === 'number').toBe(true);
    expect(() => assertPurposeConfig(purpose)).not.toThrow();
    expect(resolveModelFacts(entry.model).maxOutputTokens).toBeGreaterThanOrEqual(entry.maxOutputTokens);
    expect(MODEL_PRICING[entry.model]).toBeDefined();
  });

  it('starting limits: 16,000 for script generation, video planning and script review; 4,000 for the small replies', () => {
    expect(LLM_REGISTRY['script-generation'].maxOutputTokens).toBe(16_000);
    expect(LLM_REGISTRY['video-production-planning'].maxOutputTokens).toBe(16_000);
    expect(LLM_REGISTRY['script-review'].maxOutputTokens).toBe(16_000);
    expect(LLM_REGISTRY['intake-parsing'].maxOutputTokens).toBe(4_000);
    expect(LLM_REGISTRY['metadata-generation'].maxOutputTokens).toBe(4_000);
    expect(LLM_REGISTRY['video-intelligence-own-draft'].maxOutputTokens).toBe(4_000);
  });

  it('Sprint 6 Task 1 packaging purposes: brief 4,000, six concepts 8,000, cold reader 4,000', () => {
    expect(LLM_REGISTRY['packaging-brief'].maxOutputTokens).toBe(4_000);
    expect(LLM_REGISTRY['packaging-concepts'].maxOutputTokens).toBe(8_000);
    expect(LLM_REGISTRY['packaging-cold-reader'].maxOutputTokens).toBe(4_000);
  });

  it('Sprint 6 Task 1 PR B picture purposes: critic 3,000, payoff 4,000, defect check 2,000, compare 2,000', () => {
    expect(LLM_REGISTRY['packaging-critic'].maxOutputTokens).toBe(3_000);
    expect(LLM_REGISTRY['packaging-payoff'].maxOutputTokens).toBe(4_000);
    expect(LLM_REGISTRY['packaging-defect-check'].maxOutputTokens).toBe(2_000);
    expect(LLM_REGISTRY['packaging-compare'].maxOutputTokens).toBe(2_000);
  });

  // Prompt tidy-up: the two checks that used to borrow another purpose's entry keep exactly that entry's settings.
  it('still-check and hard-cap-confirmation keep the model, limit and reasoning they used to borrow', () => {
    expect(LLM_REGISTRY['still-check']).toMatchObject({ model: 'claude-haiku-4-5', maxOutputTokens: 4_000, reasoning: 'off' });
    expect(LLM_REGISTRY['hard-cap-confirmation']).toMatchObject({ model: 'claude-sonnet-5-5', maxOutputTokens: 16_000, reasoning: 'off' });
  });

  it('reasoning is off everywhere in this task', () => {
    for (const purpose of PURPOSES) expect(LLM_REGISTRY[purpose].reasoning).toBe('off');
  });

  it('every model a purpose uses has model facts and a pricing row', () => {
    for (const { model } of Object.values(LLM_REGISTRY)) {
      expect(MODEL_FACTS[model]).toBeDefined();
      expect(() => resolvePricing(model)).not.toThrow();
    }
  });
});

describe('assertPurposeConfig refuses a call that cannot work', () => {
  const entry = (patch: Partial<RegistryEntry>): RegistryEntry => ({ ...LLM_REGISTRY['script-generation'], ...patch });

  it('a limit above the model maximum', () => {
    expect(() => assertPurposeConfig('script-generation', entry({ maxOutputTokens: 200_000 }))).toThrow(/allows at most/);
    expect(() => assertPurposeConfig('script-review', entry({ model: 'claude-haiku-4-5', maxOutputTokens: 70_000 }))).toThrow(/allows at most 64000/);
  });

  it('a reasoning budget on a model that reasons adaptively and rejects a manual budget', () => {
    expect(() => assertPurposeConfig('script-generation', entry({ reasoning: { budgetTokens: 4_000 } }))).toThrow(/rejects a manual thinking budget/);
  });

  it('a reasoning budget that leaves no room for the answer', () => {
    const haiku = { model: 'claude-haiku-4-5' };
    expect(() => assertPurposeConfig('script-review', entry({ ...haiku, maxOutputTokens: 4_000, reasoning: { budgetTokens: 4_000 } }))).toThrow(/below its reasoning budget/);
    expect(() => assertPurposeConfig('script-review', entry({ ...haiku, maxOutputTokens: 8_000, reasoning: { budgetTokens: 4_000 } }))).not.toThrow();
  });

  it('a budget below the 1,024-token minimum, and a missing limit', () => {
    expect(() => assertPurposeConfig('script-review', entry({ model: 'claude-haiku-4-5', reasoning: { budgetTokens: 500 } }))).toThrow(/at least 1,024/);
    expect(() => assertPurposeConfig('script-generation', entry({ maxOutputTokens: undefined as never }))).toThrow(/positive integer/);
  });

  it('an unknown model', () => {
    expect(() => assertPurposeConfig('script-generation', entry({ model: 'nope' }))).toThrow(/No model facts/);
  });
});
