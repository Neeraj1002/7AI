import type { LLMProvider, Purpose } from "./types";

export type RegistryEntry = {
  provider: LLMProvider;
  model: string;
};

// Purpose -> provider+model, independently configurable per purpose. A typed
// config map, not env vars or a config file — see the "Registry shape"
// rationale in docs/decisions/LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md.
//
// `script-generation` resolves to Anthropic's premium tier per
// AGENT_FLEET_DESIGN.md 8.1 ("the one place quality directly drives views,
// don't cost-optimize"). `intake-parsing`, `script-review`, and
// `video-intelligence-own-draft` deliberately resolve to the cheap/fast
// tier (`claude-haiku-4-5`, which supports image input) per 8.1's
// classification/scoring row — `intake-parsing` was fixed onto this tier in
// Week 5 Task 4 (it had inherited Week 1's premium default unchanged and
// never gotten a deliberate tiering decision until then; see
// `docs/execution/KNOWN_ISSUES_AND_BLOCKERS.md`). Changing a purpose's model
// or provider is a one-line edit here, never a call-site change.
//
// `video-production-planning` (Week 4 Task 1) and `metadata-generation`
// (Week 4 Task 2) are both "reasoning/explanation"-shaped per 8.1's table
// (read by the assembler/founder, not the end viewer) — nominally mid-tier,
// not cheap/fast classification and not Script Generation's premium
// creative-generation tier. But 8.1's own mid-tier example ("Script Review's
// revision notes") already resolves to `claude-haiku-4-5` in this registry —
// no distinct mid-tier model has ever actually been added. Rather than
// introduce a third pricing tier unprompted, both follow that same existing
// precedent. Flagged in both tasks' reports as a judgment call, same
// treatment as `intake-parsing`'s tier before it.
export const LLM_REGISTRY: Record<Purpose, RegistryEntry> = {
  "intake-parsing": { provider: "anthropic", model: "claude-haiku-4-5" },

  // The Storyteller: Handles narrative weight, dramatic loops, and pacing cues
  "script-generation": { provider: "anthropic", model: "claude-sonnet-5" },

  "script-review": { provider: "anthropic", model: "claude-haiku-4-5" },

  "video-intelligence-own-draft": {
    provider: "anthropic",
    model: "claude-haiku-4-5",
  },

  // ⭐️ UPGRADED: The Visual Director. Takes Sonnet's script and creates
  // hyper-realistic, dark, cinematic prompts for the video generation API.
  "video-production-planning": {
    provider: "anthropic",
    model: "claude-sonnet-5",
  },

  "metadata-generation": { provider: "anthropic", model: "claude-haiku-4-5" },
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
  // Evaluation-only, owner authorized; official Sonnet 5.5 overview verified 2026-10-18. No purpose rerouting.
  "claude-sonnet-5-5": { inputPerMillionUsd: 2.0, outputPerMillionUsd: 10.0 },
  "claude-sonnet-5": { inputPerMillionUsd: 2.0, outputPerMillionUsd: 10.0 },
  "claude-haiku-4-5": { inputPerMillionUsd: 1.0, outputPerMillionUsd: 5.0 },
};

export function resolvePricing(model: string): PricingEntry {
  const entry = MODEL_PRICING[model];
  if (!entry) {
    throw new Error(
      `No pricing entry for model '${model}' — add one to registry.ts's MODEL_PRICING.`,
    );
  }
  return entry;
}
