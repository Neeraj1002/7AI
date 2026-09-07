import type { Purpose, LLMProvider } from './types';

export type RegistryEntry = {
  provider: LLMProvider;
  model: string;
};

// Purpose -> provider+model, independently configurable per purpose. A typed
// config map, not env vars or a config file — see the "Registry shape"
// rationale in docs/decisions/LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md.
//
// `intake-parsing`/`script-generation` resolve to Anthropic's premium tier,
// matching what Week 1's parse-brief.ts already used — `intake-parsing`'s
// tiering was never a deliberate choice (see Week 2 Task 3's report), but
// `script-generation`'s is correct as-is per AGENT_FLEET_DESIGN.md 8.1
// ("the one place quality directly drives views, don't cost-optimize").
// `script-review` deliberately resolves to the cheap/fast tier
// (`claude-haiku-4-5`) per 8.1's classification/scoring row — Week 2 Task 5's
// first real consumer. Changing a purpose's model or provider is a one-line
// edit here, never a call-site change.
export const LLM_REGISTRY: Record<Purpose, RegistryEntry> = {
  'intake-parsing': { provider: 'anthropic', model: 'claude-sonnet-5' },
  'script-generation': { provider: 'anthropic', model: 'claude-sonnet-5' },
  'script-review': { provider: 'anthropic', model: 'claude-haiku-4-5' },
};

export function resolvePurpose(purpose: Purpose): RegistryEntry {
  return LLM_REGISTRY[purpose];
}

// Per-model pricing, sitting alongside the registry since that's already where
// provider+model gets resolved — see docs/execution/week2/SCHEMA.md's "Where
// costUsd comes from" note. Sourced from Anthropic's own current published
// rates (2026-09). Add an entry here before adding a purpose that resolves to
// a new model — resolvePricing throws rather than silently costing $0.
export type PricingEntry = {
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
};

export const MODEL_PRICING: Record<string, PricingEntry> = {
  'claude-sonnet-5': { inputPerMillionUsd: 2.0, outputPerMillionUsd: 10.0 },
  'claude-haiku-4-5': { inputPerMillionUsd: 1.0, outputPerMillionUsd: 5.0 },
};

export function resolvePricing(model: string): PricingEntry {
  const entry = MODEL_PRICING[model];
  if (!entry) {
    throw new Error(`No pricing entry for model '${model}' — add one to registry.ts's MODEL_PRICING.`);
  }
  return entry;
}
