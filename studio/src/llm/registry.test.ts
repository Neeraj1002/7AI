import { describe, it, expect } from 'vitest';
import { resolvePurpose, resolvePricing, LLM_REGISTRY } from './registry';

describe('resolvePurpose', () => {
  it('resolves every registered purpose to a provider+model', () => {
    for (const purpose of Object.keys(LLM_REGISTRY) as (keyof typeof LLM_REGISTRY)[]) {
      const entry = resolvePurpose(purpose);
      expect(entry.provider).toBe('anthropic');
      expect(entry.model.length).toBeGreaterThan(0);
    }
  });

  // Week 5 Task 4 (C1) — the regression test this task's own acceptance
  // criteria explicitly ask for: intake-parsing had inherited Week 1's
  // premium-tier default unchanged, never a deliberate choice
  // (KNOWN_ISSUES_AND_BLOCKERS.md). This locks the fix in so the exact same
  // deviation can't silently reappear.
  it('resolves intake-parsing to the cheap/fast tier (claude-haiku-4-5), not the premium tier', () => {
    expect(resolvePurpose('intake-parsing')).toEqual({ provider: 'anthropic', model: 'claude-haiku-4-5' });
  });

  it('keeps script-generation on the premium tier — the one place quality directly drives views', () => {
    expect(resolvePurpose('script-generation')).toEqual({ provider: 'anthropic', model: 'claude-sonnet-5-5' });
    expect(resolvePurpose('video-production-planning')).toEqual({ provider: 'anthropic', model: 'claude-sonnet-5-5' });
  });
});

describe('resolvePricing', () => {
  it('resolves pricing for every model actually used in the registry', () => {
    const modelsInUse = new Set(Object.values(LLM_REGISTRY).map((entry) => entry.model));
    for (const model of modelsInUse) {
      const pricing = resolvePricing(model);
      expect(pricing.inputPerMillionUsd).toBeGreaterThan(0);
      expect(pricing.outputPerMillionUsd).toBeGreaterThan(0);
    }
  });

  it('throws a clear error for an unknown model rather than silently costing $0', () => {
    expect(() => resolvePricing('not-a-real-model')).toThrow(/No pricing entry for model/);
  });
});
