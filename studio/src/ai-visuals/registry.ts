import type { AiVisualsProvider, AiVisualsPurpose } from './types';

export type RegistryEntry = {
  provider: AiVisualsProvider;
  model: string;
};

// Purpose -> provider+model, mirroring studio/src/media/registry.ts's shape.
//
// Real provider decision (Sprint 2 Task 2, E1 — flagged here rather than
// silently picked, same treatment Week 5 Task 4's C3 gave "no tool use
// exists"): reused OpenAI's image-generation API instead of adding a new
// vendor. OPENAI_API_KEY is already a real, configured org dependency
// (media/ and llm/ both already depend on it), so this reuses an existing
// credential and this project's own established client.ts boundary pattern
// rather than introducing a Stability AI/Midjourney/other integration this
// project has never touched. Model is `gpt-image-1.5`, not `gpt-image-1` —
// gpt-image-1 is scheduled for deprecation 2026-10-23 (confirmed via a live
// pricing check at implementation time), so picking it now would mean
// shipping an already-sunsetting model. If image quality or cost doesn't
// hold up once this is exercised against real scene prompts at volume, the
// real alternative worth evaluating is a dedicated image-gen vendor
// (Stability AI, Midjourney's API) — not attempted here, since it would add
// a net-new credential/vendor relationship this task's scope doesn't call for.
// Sprint 4 Task 11 (2026-10): the model is now the dated snapshot of `gpt-image-2.5-flare`
// (founder-approved after contact sheets; measurements in reports/task11.md). gpt-image-1.5
// shuts down 2026-12-01. Dated, not the alias, so the look cannot change under a channel.
// The paragraph above records the original provider decision and is history.
export const AI_VISUALS_REGISTRY: Record<AiVisualsPurpose, RegistryEntry> = {
  'still-generation': { provider: 'openai', model: 'gpt-image-2.5-flare-2026-09-08' },
};

export function resolveAiVisualsPurpose(purpose: AiVisualsPurpose): RegistryEntry {
  return AI_VISUALS_REGISTRY[purpose];
}

// Pricing, sitting alongside the registry (same reasoning as
// studio/src/media/registry.ts's TTS_PRICING).
//
// Two shapes (Sprint 4 Task 11, measured 2026-10-11):
// - flat: `perImageUsd` only. `gpt-image-1.5`, 1024x1536 'low' = $0.013/image
//   (matches a real run; its usage object mixes in text tokens, so it is not
//   re-derived from tokens).
// - token-billed: `tokenRates` (USD per million tokens, OpenAI's published
//   gpt-image-2.5 rates) price a still from the response's own `usage`.
//   `perImageUsd` is then the fallback when a response carries no `usage`:
//   the measured cost of a 1024x1536 'low' still (158 image tokens + ~29 text
//   tokens = $0.0049).
export type ImageTokenRates = {
  imageOutputPerMTokUsd: number;
  textInputPerMTokUsd: number;
  imageInputPerMTokUsd: number;
};
export type ImagePricingEntry = { perImageUsd: number; tokenRates?: ImageTokenRates };

const GPT_IMAGE_25_PRICING: ImagePricingEntry = {
  perImageUsd: 0.005,
  tokenRates: { imageOutputPerMTokUsd: 30, textInputPerMTokUsd: 5, imageInputPerMTokUsd: 8 },
};

export const IMAGE_PRICING: Record<string, ImagePricingEntry> = {
  'gpt-image-1.5': { perImageUsd: 0.013 },
  'gpt-image-2.5-flare': GPT_IMAGE_25_PRICING,
  'gpt-image-2.5-flare-2026-09-08': GPT_IMAGE_25_PRICING,
  'gpt-image-2.5-sunburst': GPT_IMAGE_25_PRICING,
};

export function resolveImagePricing(model: string): ImagePricingEntry {
  const entry = IMAGE_PRICING[model];
  if (!entry) {
    throw new Error(`No image pricing entry for model '${model}' — add one to ai-visuals/registry.ts's IMAGE_PRICING.`);
  }
  return entry;
}

// The part of an images response's `usage` this module prices from.
export type ImageUsage = {
  input_tokens?: number;
  input_tokens_details?: { image_tokens?: number; text_tokens?: number };
  output_tokens?: number;
};

// Cost of one still. Token-billed models price the response's usage; a
// response without usable usage (or a flat-priced model) costs perImageUsd.
export function priceStill(pricing: ImagePricingEntry, usage: ImageUsage | null | undefined): number {
  const rates = pricing.tokenRates;
  if (!rates || !usage || typeof usage.output_tokens !== 'number') return pricing.perImageUsd;
  const details = usage.input_tokens_details;
  const textIn = details?.text_tokens ?? usage.input_tokens ?? 0;
  const imageIn = details?.image_tokens ?? 0;
  return (
    (usage.output_tokens * rates.imageOutputPerMTokUsd +
      textIn * rates.textInputPerMTokUsd +
      imageIn * rates.imageInputPerMTokUsd) /
    1_000_000
  );
}
