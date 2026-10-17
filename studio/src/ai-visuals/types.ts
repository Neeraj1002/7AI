// This project's own AI-visuals request/response types — never the
// underlying provider's. Mirrors studio/src/media/types.ts's shape, per
// Sprint 2 Task 2's instruction to replicate that boundary pattern.

import type { StillSize } from './sizes';

export const AI_VISUALS_PURPOSES = ['still-generation'] as const;
export type AiVisualsPurpose = (typeof AI_VISUALS_PURPOSES)[number];

export const AI_VISUALS_PROVIDERS = ['openai'] as const;
export type AiVisualsProvider = (typeof AI_VISUALS_PROVIDERS)[number];

export type GenerateStillsParams = {
  // One image-generation prompt per still, in on-screen order — this
  // module never decides how many stills to make or how long each stays
  // on screen; that's video-generation/index.ts's job (it has the
  // caption-cue timing this module has no reason to know about).
  scenePrompts: string[];
  // Sprint 4 Task 9 (R5.1): defaults to portrait, today's value. Long-form passes landscape.
  size?: StillSize;
  // Sprint 4 Task 9 (R5.4): when set, a still whose (model, size, quality, prompt) hash is already
  // in this folder is reused at no cost, and each new still is written here as it is paid for.
  cacheDir?: string;
  // Task 5 visual repair may require full decode/dimension validation before
  // reusing an existing cached image. Other call sites retain legacy behavior.
  validateCachedStill?: (filePath: string) => Promise<boolean>;
  // Sprint 4 Task 9 (R5.4/R7.3): called right after each still is paid for (never for a cache hit),
  // before the next one starts, so spend is booked per still. It may throw to stop generation
  // (a spend limit); the still just paid for is already on disk in the cache.
  onStillGenerated?: (info: { index: number; costUsd: number; model: string }) => Promise<void> | void;
  // Sprint 4 Task 12 (R4): called with 0 of N before the first still and again after every still that
  // is finished (generated, taken from the cache, or skipped by the provider's safety system), so the
  // count reaches N. It must not throw; the caller decides how often to store it.
  onProgress?: (progress: { done: number; total: number }) => void;
};

export type GeneratedStillsResult = {
  imagePaths: string[]; // same order as scenePrompts (minus any prompt skipped below)
  // Sprint 4 Task 8 (R6) — prompts the provider's safety system refused
  // (`moderation_blocked`); skipped rather than failing the whole attempt, since
  // the faster default pacing now sends 6-20 prompts per attempt, not 3-6.
  skippedPromptCount?: number;
  // Sprint 4 Task 9: how many of imagePaths came from the per-run cache (not paid for this call).
  cachedCount?: number;
  // For each entry of imagePaths, the index of the scene prompt it illustrates (a skipped prompt
  // leaves a gap), so a caller can keep each still attached to its scene.
  promptIndexes?: number[];
  provider: AiVisualsProvider;
  model: string;
  costUsd: string; // NUMERIC as string, matching UsageEvent.costUsd's DB representation — summed across every still generated
};
