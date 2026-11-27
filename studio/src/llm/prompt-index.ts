import type { Purpose } from './types';

// Where to find the prompt text behind each LLM purpose: the files (relative to src/) that hold the prompt and
// the call site. The registry holds model and limits only; this is the matching "which prompt" list. A test
// fails when a purpose has no entry or a call site is missing from its entry.
const SYSTEM_PROMPTS = 'prompts/system-prompts.ts';

export const PROMPT_INDEX: Record<Purpose, string[]> = {
  'intake-parsing': [SYSTEM_PROMPTS, 'run-pipeline/parse-brief.ts'],
  'script-generation': [SYSTEM_PROMPTS, 'agents/script-generation/index.ts', 'channel-direction/presets.ts'],
  'script-review': [SYSTEM_PROMPTS, 'agents/script-review/index.ts', 'channel-direction/presets.ts'],
  'hard-cap-confirmation': [SYSTEM_PROMPTS, 'agents/script-review/hard-cap-confirmation.ts'],
  'video-intelligence-own-draft': [SYSTEM_PROMPTS, 'agents/video-intelligence/index.ts', 'channel-direction/presets.ts'],
  'still-check': [SYSTEM_PROMPTS, 'agents/video-generation/still-check.ts', 'channel-direction/presets.ts'],
  'video-production-planning': [SYSTEM_PROMPTS, 'agents/video-generation/plan.ts', 'agents/video-generation/plan-long.ts', 'channel-direction/presets.ts'],
  'metadata-generation': [SYSTEM_PROMPTS, 'agents/publishing/index.ts'],
  'packaging-brief': [SYSTEM_PROMPTS, 'packaging/generate.ts'],
  'packaging-concepts': [SYSTEM_PROMPTS, 'packaging/generate.ts'],
  'packaging-cold-reader': [SYSTEM_PROMPTS, 'packaging/generate.ts'],
  'packaging-critic': [SYSTEM_PROMPTS, 'packaging/vision.ts'],
  'packaging-payoff': [SYSTEM_PROMPTS, 'packaging/vision.ts'],
  'packaging-defect-check': [SYSTEM_PROMPTS, 'packaging/vision.ts'],
  'packaging-compare': [SYSTEM_PROMPTS, 'packaging/vision.ts'],
  'story-angles': [SYSTEM_PROMPTS, 'story-tests/angle-step.ts'],
  'story-pair-reader': [SYSTEM_PROMPTS, 'story-tests/angle-step.ts'],
  'story-cold-reader': [SYSTEM_PROMPTS, 'story-tests/script-step.ts'],
  'story-promise-match': [SYSTEM_PROMPTS, 'story-tests/script-step.ts'],
};
