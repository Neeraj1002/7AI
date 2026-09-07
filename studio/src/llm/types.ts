// This project's own LLM request/response/purpose types — never the underlying
// library's. See docs/decisions/LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md.

// Seeded with the two purposes that exist or are about to (Intake parsing, and
// Script Generation coming later this week) — not the full set the decision
// doc names as eventually coming (script-review, video-intelligence-own-draft).
// Add a purpose here, plus a registry.ts entry, when its call site actually exists.
export const PURPOSES = ['intake-parsing', 'script-generation'] as const;
export type Purpose = (typeof PURPOSES)[number];

export const LLM_PROVIDERS = ['anthropic'] as const;
export type LLMProvider = (typeof LLM_PROVIDERS)[number];

export type LLMMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type LLMRequest = {
  purpose: Purpose;
  system: string;
  messages: LLMMessage[];
  maxTokens: number;
};

export type LLMUsage = {
  inputTokens: number;
  outputTokens: number;
};

export type LLMResponse = {
  text: string;
  usage: LLMUsage;
  stopReason: string;
};
