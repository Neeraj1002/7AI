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
export const AI_VISUALS_REGISTRY: Record<AiVisualsPurpose, RegistryEntry> = {
  'still-generation': { provider: 'openai', model: 'gpt-image-1.5' },
};

export function resolveAiVisualsPurpose(purpose: AiVisualsPurpose): RegistryEntry {
  return AI_VISUALS_REGISTRY[purpose];
}

// Pricing, sitting alongside the registry (same reasoning as
// studio/src/media/registry.ts's TTS_PRICING). Sourced from OpenAI's own
// published rates (2026-09, verified live at implementation time): 1024x1536
// (portrait), 'low' quality — $0.013/image.
export type ImagePricingEntry = { perImageUsd: number };

export const IMAGE_PRICING: Record<string, ImagePricingEntry> = {
  'gpt-image-1.5': { perImageUsd: 0.013 },
};

export function resolveImagePricing(model: string): ImagePricingEntry {
  const entry = IMAGE_PRICING[model];
  if (!entry) {
    throw new Error(`No image pricing entry for model '${model}' — add one to ai-visuals/registry.ts's IMAGE_PRICING.`);
  }
  return entry;
}
