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
  maxTokens: number;
  // Bugs Task 11 (R3) — ask the provider for schema-constrained JSON output, so the
  // reply is valid JSON by construction (quotes and newlines escaped by the
  // decoder, not left to the model). The reply is still returned as text and
  // still parsed and validated by the caller.
  outputSchema?: ZodType;
};

export type LLMUsage = {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens?: number;
};

// What client.ts returns — provider/model aren't included here since the
// caller (client.ts) already received them as params; index.ts attaches them
// to form the public LLMResponse below.
export type ProviderCallResult = {
  text: string;
  usage: LLMUsage;
  stopReason: string;
  rawStopReason?: string;
  responseModel?: string;
  // NUMERIC as string, matching UsageEvent.costUsd's DB representation —
  // computed in client.ts from token counts and registry.ts's pricing table,
  // per docs/execution/week2/SCHEMA.md's "Where costUsd comes from" note.
  costUsd: string;
};

// Public response shape from callLLM — includes which provider+model actually
// resolved for this purpose, so call sites can write a UsageEvent row without
// importing registry.ts directly (only index.ts/client.ts may).
export type LLMResponse = ProviderCallResult & {
  provider: LLMProvider;
  model: string;
};
