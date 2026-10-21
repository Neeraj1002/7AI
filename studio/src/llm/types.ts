// This project's own LLM request/response/purpose types — never the underlying
// library's. See docs/decisions/LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md.

import type { ZodType } from 'zod';

// Seeded with the purposes that exist so far. Add a purpose here, plus a
// registry.ts entry, when its call site actually exists.
export const PURPOSES = [
  'intake-parsing',
  'script-generation',
  'script-review',
  'video-intelligence-own-draft',
  'video-production-planning',
  'metadata-generation',
] as const;
export type Purpose = (typeof PURPOSES)[number];

export const LLM_PROVIDERS = ['anthropic'] as const;
export type LLMProvider = (typeof LLM_PROVIDERS)[number];

// Hidden reasoning for a purpose: 'off' (sent to the provider explicitly), or a token budget on the models
// that accept one. Reasoning tokens are billed as output and count against the output limit.
export type Reasoning = 'off' | { budgetTokens: number };

// A media attachment alongside a message's text — Week 3 Task 3's multimodal
// extension (a frame image, for Video Intelligence's own-draft check). Kept
// deliberately minimal (base64 data + media type only) rather than a second,
// speculative multimodal contract — see
// docs/decisions/LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md's reasoning for
// why media generation stayed out of this layer; media *analysis* is shaped
// exactly like a normal chat completion; it just needs one more input part.
export type LLMAttachment = {
  mediaType: string; // IANA media type, e.g. 'image/jpeg'
  dataBase64: string;
};

export type LLMMessage = {
  role: 'user' | 'assistant';
  content: string;
  attachments?: LLMAttachment[];
};

export type LLMRequest = {
  purpose: Purpose;
  system: string;
  messages: LLMMessage[];
  // Bugs Task 11 (R3) — ask the provider for schema-constrained JSON output, so the
  // reply is valid JSON by construction (quotes and newlines escaped by the
  // decoder, not left to the model). The reply is still returned as text and
  // still parsed and validated by the caller.
  outputSchema?: ZodType;
};

export type LLMUsage = {
  inputTokens: number;
  outputTokens: number;
  // Hidden reasoning tokens inside outputTokens, when the provider reports them.
  reasoningTokens?: number;
};

// What client.ts returns — provider/model aren't included here since the
// caller (client.ts) already received them as params; index.ts attaches them
// to form the public LLMResponse below.
export type ProviderCallResult = {
  responseModel?: string;
  rawStopReason?: string;
  text: string;
  usage: LLMUsage;
  stopReason: string;
  // NUMERIC as string, matching UsageEvent.costUsd's DB representation —
  // computed in client.ts from token counts and registry.ts's pricing table,
  // per docs/execution/week2/SCHEMA.md's "Where costUsd comes from" note.
  costUsd: string;
};

// One model call that ended at the output limit before the reply that finally came back (LLM Registry
// task, R2). Each is billed, so each is booked as its own usage event.
export type LLMPriorAttempt = {
  provider: LLMProvider;
  model: string;
  usage: LLMUsage;
  costUsd: string;
  stopReason: string;
  maxOutputTokens: number;
  replyLength: number;
};

// Public response shape from callLLM — includes which provider+model actually
// resolved for this purpose, so call sites can write a UsageEvent row without
// importing registry.ts directly (only index.ts/client.ts may).
export type LLMResponse = ProviderCallResult & {
  provider: LLMProvider;
  model: string;
  // The output limit of the call that produced this reply (the registry's, or its retry's).
  maxOutputTokens: number;
  // Calls made earlier inside the same callLLM that were cut off, oldest first. Absent or empty for a normal reply.
  priorAttempts?: LLMPriorAttempt[];
};
