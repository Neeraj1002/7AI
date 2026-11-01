import type { Purpose } from './types';

// Where to find the prompt text behind each LLM purpose: the files (relative to src/) that hold the prompt and
// the call site. The registry holds model and limits only; this is the matching "which prompt" list. A test
// fails when a purpose has no entry or a call site is missing from its entry.
export const PROMPT_INDEX: Record<Purpose, string[]> = {
  'intake-parsing': ['run-pipeline/parse-brief.ts'],
  'script-generation': ['agents/script-generation/index.ts', 'agents/script-generation/long-form.ts'],
  'script-review': ['agents/script-review/index.ts', 'agents/script-review/rules.ts'],
  'hard-cap-confirmation': ['agents/script-review/hard-cap-confirmation.ts'],
  'video-intelligence-own-draft': ['agents/video-intelligence/index.ts'],
  'still-check': ['agents/video-generation/still-check.ts'],
  'video-production-planning': ['agents/video-generation/plan.ts', 'agents/video-generation/plan-long.ts'],
  'metadata-generation': ['agents/publishing/index.ts'],
  'packaging-brief': ['packaging/prompts.ts', 'packaging/generate.ts'],
  'packaging-concepts': ['packaging/prompts.ts', 'packaging/generate.ts'],
  'packaging-cold-reader': ['packaging/prompts.ts', 'packaging/generate.ts'],
  'packaging-critic': ['packaging/prompts-vision.ts', 'packaging/vision.ts'],
  'packaging-payoff': ['packaging/prompts-vision.ts', 'packaging/vision.ts'],
  'packaging-defect-check': ['packaging/prompts-vision.ts', 'packaging/vision.ts'],
  'packaging-compare': ['packaging/prompts-vision.ts', 'packaging/vision.ts'],
};
