import type { Purpose, LLMProvider } from './types';

export type RegistryEntry = {
  provider: LLMProvider;
  model: string;
};

// Purpose -> provider+model, independently configurable per purpose. A typed
// config map, not env vars or a config file — see the "Registry shape"
// rationale in docs/decisions/LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md.
//
// Both purposes resolve to Anthropic for now, matching what Week 1's
// parse-brief.ts already used — not yet a deliberate model-tiering decision
// per AGENT_FLEET_DESIGN.md Section 8.1 (see Week 2 Task 3's report for that
// discussion). Changing a purpose's model or provider is a one-line edit here,
// never a call-site change.
export const LLM_REGISTRY: Record<Purpose, RegistryEntry> = {
  'intake-parsing': { provider: 'anthropic', model: 'claude-sonnet-5' },
  'script-generation': { provider: 'anthropic', model: 'claude-sonnet-5' },
};

export function resolvePurpose(purpose: Purpose): RegistryEntry {
  return LLM_REGISTRY[purpose];
}
