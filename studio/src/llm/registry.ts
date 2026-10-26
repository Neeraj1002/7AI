import { resolveModelFacts } from "./models";
import type { LLMProvider, Purpose, Reasoning } from "./types";

// What a reasoning budget plus the visible answer needs at minimum, so a purpose that turns reasoning on
// cannot be declared with a limit the reasoning alone would spend.
export const MIN_ANSWER_TOKENS_WITH_REASONING = 2_000;

export type RegistryEntry = {
  provider: LLMProvider;
  model: string;
  // The stage name the failure messages start with.
  label: string;
  // A runaway guard, not a size guess: you pay for tokens written, not for the limit. Required, with no
  // default in code, so a new purpose cannot leave it out. Hidden reasoning counts against it.
  maxOutputTokens: number;
  // Required for the same reason. 'off' is sent to the provider explicitly, never left to its default
  // (Claude Sonnet 5 reasons by default and spent a whole 4,096-token cap before writing a word).
  reasoning: Reasoning;
};

// Purpose -> provider+model+output limit+reasoning, independently configurable per purpose. A typed
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
//
// Output limits (LLM Registry task, R1): 16,000 for script generation, video planning and script
// review; 4,000 for the small structured replies. Every one sits well above that stage's real peak,
// and a cut-off retries once at double the limit with reasoning off (llm/index.ts). Reasoning stays
// off everywhere; turning it on for one purpose is one line here.
export const LLM_REGISTRY: Record<Purpose, RegistryEntry> = {
  "intake-parsing": {
    provider: "anthropic",
    model: "claude-haiku-4-5",
    label: "Intake parsing",
    maxOutputTokens: 4_000,
    reasoning: "off",
  },

  // The Storyteller: Handles narrative weight, dramatic loops, and pacing cues
  "script-generation": {
    provider: "anthropic",
    model: "claude-sonnet-5-5",
    label: "Script Generation",
    maxOutputTokens: 16_000,
    reasoning: "off",
  },

  "script-review": {
    provider: "anthropic",
    model: "claude-sonnet-5-5",
    label: "Script Review",
    maxOutputTokens: 16_000,
    reasoning: "off",
  },

  "video-intelligence-own-draft": {
    provider: "anthropic",
    model: "claude-haiku-4-5",
    label: "Video Intelligence",
    maxOutputTokens: 4_000,
    reasoning: "off",
  },

  // ⭐️ UPGRADED: The Visual Director. Takes Sonnet's script and creates
  // hyper-realistic, dark, cinematic prompts for the video generation API.
  "video-production-planning": {
    provider: "anthropic",
    model: "claude-sonnet-5-5",
    label: "Video Planning",
    maxOutputTokens: 16_000,
    reasoning: "off",
  },

  "metadata-generation": {
    provider: "anthropic",
    model: "claude-haiku-4-5",
    label: "Publishing metadata",
    maxOutputTokens: 4_000,
    reasoning: "off",
  },

  // Sprint 6 Task 1 (R1, R2): curiosity packaging. The brief and the six concepts are the creative step where
  // quality drives clicks, so they take Script Generation's tier; the cold reader only ranks short texts. Sizes
  // measured on the spike (reports/task1-spike.md): six concepts about 3,000 output tokens, a brief about 600.
  "packaging-brief": {
    provider: "anthropic",
    model: "claude-sonnet-5-5",
    label: "Packaging brief",
    maxOutputTokens: 4_000,
    reasoning: "off",
  },

  "packaging-concepts": {
    provider: "anthropic",
    model: "claude-sonnet-5-5",
    label: "Packaging concepts",
    maxOutputTokens: 8_000,
    reasoning: "off",
  },

  "packaging-cold-reader": {
    provider: "anthropic",
    model: "claude-haiku-4-5",
    label: "Packaging cold reader",
    maxOutputTokens: 4_000,
    reasoning: "off",
  },

  // Sprint 6 Task 1 PR B (R4). All four read a picture. The critic, the defect check and the head-to-head are short
  // structured answers on Haiku 4.5 (its image input is already used by Video Intelligence); the payoff check is the
  // hard gate (a scene the script lacks drops a package), so it takes Sonnet 5.5 where the real image check
  // (scripts/packaging-vision-check.ts) showed it reads images.
  "packaging-critic": {
    provider: "anthropic",
    model: "claude-haiku-4-5",
    label: "Packaging critic",
    maxOutputTokens: 3_000,
    reasoning: "off",
  },

  "packaging-payoff": {
    provider: "anthropic",
    model: "claude-sonnet-5-5",
    label: "Packaging payoff check",
    maxOutputTokens: 4_000,
    reasoning: "off",
  },

  // The defect check also gives face and subject boxes; the first real check showed Haiku missing lettering over a
  // face, so this one is on Sonnet 5.5 as well.
  "packaging-defect-check": {
    provider: "anthropic",
    model: "claude-sonnet-5-5",
    label: "Packaging defect check",
    maxOutputTokens: 2_000,
    reasoning: "off",
  },

  "packaging-compare": {
    provider: "anthropic",
    model: "claude-haiku-4-5",
    label: "Packaging compare",
    maxOutputTokens: 2_000,
    reasoning: "off",
  },
};

export function resolvePurpose(purpose: Purpose): RegistryEntry {
  return LLM_REGISTRY[purpose];
}

// The client refuses to build a call from an entry that cannot work: a limit above the model's maximum,
// reasoning requested on a model that rejects the manual budget, or a reasoning budget that leaves no room
// for the answer. Used by callLLM before every call and by the registry test, so a bad entry fails in CI.
export function assertPurposeConfig(purpose: Purpose, entry: RegistryEntry = LLM_REGISTRY[purpose]): void {
  const facts = resolveModelFacts(entry.model);
  if (!Number.isInteger(entry.maxOutputTokens) || entry.maxOutputTokens <= 0) {
    throw new Error(`LLM purpose '${purpose}' needs a positive integer maxOutputTokens.`);
  }
  if (entry.maxOutputTokens > facts.maxOutputTokens) {
    throw new Error(
      `LLM purpose '${purpose}' asks for ${entry.maxOutputTokens} output tokens but ${entry.model} allows at most ${facts.maxOutputTokens}.`,
    );
  }
  if (entry.reasoning !== "off") {
    if (facts.thinking !== "extended") {
      throw new Error(
        `LLM purpose '${purpose}' sets a reasoning budget but ${entry.model} rejects a manual thinking budget (it reasons adaptively).`,
      );
    }
    if (!Number.isInteger(entry.reasoning.budgetTokens) || entry.reasoning.budgetTokens < 1_024) {
      throw new Error(`LLM purpose '${purpose}' needs a reasoning budget of at least 1,024 tokens.`);
    }
    if (entry.maxOutputTokens < entry.reasoning.budgetTokens + MIN_ANSWER_TOKENS_WITH_REASONING) {
      throw new Error(
        `LLM purpose '${purpose}' has maxOutputTokens ${entry.maxOutputTokens}, below its reasoning budget ${entry.reasoning.budgetTokens} plus ${MIN_ANSWER_TOKENS_WITH_REASONING} for the answer.`,
      );
    }
  }
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
  "claude-sonnet-5": { inputPerMillionUsd: 2.0, outputPerMillionUsd: 10.0 },
  // $2 / $10 per MTok, platform.claude.com/docs/en/models/overview, 2026-10-19. No purpose uses it on this
  // branch; the row lets a purpose move to it (and the real check call it) without a pricing error.
  "claude-sonnet-5-5": { inputPerMillionUsd: 2.0, outputPerMillionUsd: 10.0 },
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
