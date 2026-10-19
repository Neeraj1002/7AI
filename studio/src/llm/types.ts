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
  text: string;
  usage: LLMUsage;
  stopReason: string;
  // LLM Registry task (R6): the provider's own finish reason, unmapped ('max_tokens', 'refusal', ...), the kinds
  // of reply parts it returned with counts ('thinking:1,text:0'), and the response metadata worth keeping for a
  // failed call (ids, model, a few headers, provider metadata; never the prompt and never the reply body).
  rawFinishReason?: string | null;
  blocks?: string;
  responseMeta?: Record<string, unknown>;
  // NUMERIC as string, matching UsageEvent.costUsd's DB representation —
  // computed in client.ts from token counts and registry.ts's pricing table,
  // per docs/execution/week2/SCHEMA.md's "Where costUsd comes from" note.
  costUsd: string;
};

// LLM Registry task (R6): what one provider call used against what it was allowed. Stored on its usage event
// (usage_events.metadata.llm), carried on a failure's error and shown in the technical line of a message.
export type LLMCallEvidence = {
  purpose: Purpose;
  model: string;
  // 1-based count of provider calls inside the callLLM that made it (a retry is attempt 2).
  attempt: number;
  kind: 'first' | 'cut-off-retry' | 'transient-retry' | 'structured-fallback';
  limit: number;
  outputTokens: number;
  reasoningTokens: number | null;
  // outputTokens as a percent of the limit, one decimal.
  percentUsed: number;
  // True at 60% of the limit or more.
  nearMiss: boolean;
  // callLLM's normalized stop reason ('stop', 'length', ...) and the provider's raw one.
  stopReason: string;
  finishReason: string | null;
  blocks: string;
  // What was sent: 'off', or the reasoning budget.
  reasoning: 'off' | number;
};

// One model call that ended at the output limit before the reply that finally came back (LLM Registry
// task, R2). Each is billed, so each is booked as its own usage event.
export type LLMPriorAttempt = {
  evidence?: LLMCallEvidence;
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
  // R6: set by callLLM on every reply.
  evidence?: LLMCallEvidence;
  // R5: true when the provider rejected the structured-output request (400 or 422) and this reply came from
  // the plain-text fallback. A caller that makes more calls should stop sending the schema too.
  structuredOutputFallback?: boolean;
  provider: LLMProvider;
  model: string;
  // The output limit of the call that produced this reply (the registry's, or its retry's).
  maxOutputTokens: number;
  // Calls made earlier inside the same callLLM that were cut off, oldest first. Absent or empty for a normal reply.
  priorAttempts?: LLMPriorAttempt[];
};
