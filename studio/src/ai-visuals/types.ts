// This project's own AI-visuals request/response types — never the
// underlying provider's. Mirrors studio/src/media/types.ts's shape, per
// Sprint 2 Task 2's instruction to replicate that boundary pattern.

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
};

export type GeneratedStillsResult = {
  imagePaths: string[]; // same order as scenePrompts (minus any prompt skipped below)
  // Sprint 4 Task 8 (R6) — prompts the provider's safety system refused
  // (`moderation_blocked`); skipped rather than failing the whole attempt, since
  // the faster default pacing now sends 6-20 prompts per attempt, not 3-6.
  skippedPromptCount?: number;
  provider: AiVisualsProvider;
  model: string;
  costUsd: string; // NUMERIC as string, matching UsageEvent.costUsd's DB representation — summed across every still generated
};
