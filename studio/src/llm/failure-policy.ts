// LLM Registry task, Part B (R5): the one place that says what happens when a model call goes wrong.
// The client (llm/index.ts) reads this table; no stage keeps a private rule of its own. For each failure: the
// action, the number of extra provider calls it may use, and the words a person reads.
//
// Ceiling: at most MAX_EXTRA_PROVIDER_CALLS extra provider calls per stage call, across all causes. A stage call
// is one callLLM plus, for Script Generation, its one repair call: they share a CallLedger. Every extra call is
// first checked against the run's remaining budget by the stage's own rule (checkBudget, Sprint 5 Task 8 R8.2),
// through the ledger's guard.
//
// This file imports no provider SDK: client.ts has already turned a provider error into a TransientStageError or
// NonTransientStageError with the HTTP status and response headers on its context.

import {
  getStageErrorContext,
  NonTransientStageError,
  TransientStageError,
  type StageErrorContext,
} from '../run-pipeline/retry-with-backoff';
import type { LLMCallEvidence, LLMMessage, LLMPriorAttempt, LLMResponse, Purpose } from './types';

export const MAX_EXTRA_PROVIDER_CALLS = 2;

export type FailureKind =
  | 'cut-off'
  | 'bad-json'
  | 'refusal'
  | 'transient'
  | 'structured-output-rejected'
  | 'bad-request';

export type FailureAction =
  | 'retry-once-larger-limit-reasoning-off'
  | 'repair-call'
  | 'fail-no-retry'
  | 'backoff-retry'
  | 'fallback-to-plain-text';

export type FailureRule = {
  action: FailureAction;
  // Extra provider calls this failure may spend (its tries). Never above MAX_EXTRA_PROVIDER_CALLS.
  maxExtraCalls: number;
  // What a person (and the debug bundle) reads about this rule.
  summary: string;
};

export const FAILURE_POLICY: Record<FailureKind, FailureRule> = {
  'cut-off': {
    action: 'retry-once-larger-limit-reasoning-off',
    maxExtraCalls: 1,
    summary: 'stopReason length: one retry at double the limit (at most 32,000 and never above the model maximum) with reasoning off; a second cut-off fails with an honest message.',
  },
  'bad-json': {
    action: 'repair-call',
    maxExtraCalls: 1,
    summary: 'reply not valid JSON or failing the schema, and not a cut-off: mechanical repair first, then one more call that tells the model what was wrong (Bugs Task 11 R5, unchanged).',
  },
  refusal: {
    action: 'fail-no-retry',
    maxExtraCalls: 0,
    summary: 'provider refusal or content-filter stop: no retry; a plain message naming the stop reason.',
  },
  transient: {
    action: 'backoff-retry',
    maxExtraCalls: MAX_EXTRA_PROVIDER_CALLS,
    summary: '429, 5xx, 529, timeout, network error: wait (exponential, honouring retry-after) and retry; the SDK itself retries nothing (maxRetries 0).',
  },
  'structured-output-rejected': {
    action: 'fallback-to-plain-text',
    maxExtraCalls: 1,
    summary: '400 or 422 on a request that sent an output schema: one fallback to plain text (Bugs Task 11 R3, unchanged).',
  },
  'bad-request': {
    action: 'fail-no-retry',
    maxExtraCalls: 0,
    summary: '400, 401, 403, 422 and any other error that is not transient: no retry.',
  },
};

// ---- cut-off ----------------------------------------------------------------------------------------------

// The most the automatic retry after a cut-off asks for (R2), never above the model's maximum.
export const RETRY_OUTPUT_TOKEN_CEILING = 32_000;

export function cutOffRetryLimit(limit: number, modelMaxOutputTokens: number): number {
  return Math.min(limit * 2, RETRY_OUTPUT_TOKEN_CEILING, modelMaxOutputTokens);
}

// A reply that ended at the output limit. The provider reports 'length'; a structured call the SDK could not
// turn into the object can come back as 'unknown' with the whole limit spent, which is the same thing.
export function endedAtLimit(stopReason: string, outputTokens: number, limit: number): boolean {
  return stopReason === 'length' || (stopReason === 'unknown' && outputTokens >= limit);
}

// The technical line that follows every message in brackets (R6): enough to tell a cut-off from a refusal from a
// structured-output problem without opening anything else.
export function technicalLine(last: LLMResponse, attempts: number, firstMaxTokens: number): string {
  const e = last.evidence;
  return (
    `stopReason=${last.stopReason}, maxTokens=${last.maxOutputTokens}, outputTokens=${last.usage.outputTokens}, ` +
    `replyLength=${last.text.length}, attempts=${attempts}, firstMaxTokens=${firstMaxTokens}, ` +
    `reasoningTokens=${last.usage.reasoningTokens ?? 'n/a'}, blocks=${e?.blocks ?? last.blocks ?? 'n/a'}, ` +
    `finishReason=${last.rawFinishReason ?? 'n/a'}, limit=${last.maxOutputTokens}`
  );
}

export function cutOffMessage(label: string, last: LLMResponse, done: LLMResponse[], retryAvailable = true): string {
  const technical = technicalLine(last, done.length, done[0]?.maxOutputTokens ?? last.maxOutputTokens);
  if (!retryAvailable) {
    return `${label}: the reply was cut off and this step had no automatic retry left (its extra-call allowance was used). Press Retry this step; if it repeats, send the debug bundle. (${technical})`;
  }
  return last.text.trim().length === 0
    ? `${label}: the model used its whole output budget without writing an answer, twice. Your brief is not the problem. Press Retry this step; if it repeats, send the debug bundle. (${technical})`
    : `${label}: the reply was cut off even after one automatic retry with a larger limit. Press Retry this step; if it repeats, send the debug bundle. (${technical})`;
}

// ---- refusal ----------------------------------------------------------------------------------------------

export const REFUSAL_STOP_REASONS: readonly string[] = ['content-filter'];

export function isRefusal(stopReason: string): boolean {
  return REFUSAL_STOP_REASONS.includes(stopReason);
}

export function refusalMessage(label: string, last: LLMResponse): string {
  const raw = last.rawFinishReason ? `, the provider's own reason: ${last.rawFinishReason}` : '';
  return `${label}: the model declined to answer this request (stop reason: ${last.stopReason}${raw}). It was not retried. Change the brief and press Retry this step; if it repeats, send the debug bundle. (${technicalLine(last, 1, last.maxOutputTokens)})`;
}

// ---- budget -----------------------------------------------------------------------------------------------

export const SPEND_LIMIT_BEFORE_RETRY = 'Spend limit reached before the retry';

export function spendLimitBeforeRetryMessage(label: string, detail: string): string {
  return `${SPEND_LIMIT_BEFORE_RETRY}: ${label} was not tried again. ${detail} Everything finished so far is kept; raise the limit and Retry this step to continue.`;
}

// ---- classifying an error from the client -------------------------------------------------------------------

// A 400 or 422 from a call that sent an outputSchema is the provider refusing the structured-output request
// (invalid request / unprocessable schema). Any other status (401, 429, 5xx, ...) is a different problem and must
// not fall back.
export const STRUCTURED_OUTPUT_FALLBACK_STATUSES: readonly number[] = [400, 422];

export function classifyCallError(error: unknown, sentSchema: boolean): FailureKind {
  const context = getStageErrorContext(error);
  const status = context?.statusCode;
  if (error instanceof TransientStageError) return 'transient';
  if (sentSchema && typeof status === 'number' && STRUCTURED_OUTPUT_FALLBACK_STATUSES.includes(status)) {
    return 'structured-output-rejected';
  }
  return 'bad-request';
}

// ---- transient: backoff ----------------------------------------------------------------------------------

export const TRANSIENT_BASE_DELAY_MS = 1_000;
export const TRANSIENT_MAX_DELAY_MS = 30_000;
// A retry-after longer than this is not waited out inside a stage call: the stage fails and Retry does the waiting.
export const TRANSIENT_MAX_RETRY_AFTER_MS = 60_000;

export function retryAfterMs(error: unknown, now: Date = new Date()): number | undefined {
  const headers = getStageErrorContext(error)?.responseHeaders as Record<string, string> | undefined;
  if (!headers) return undefined;
  const get = (name: string) => headers[name] ?? headers[name.toLowerCase()];
  const ms = get('retry-after-ms');
  if (ms !== undefined && Number.isFinite(Number(ms))) return Math.max(0, Number(ms));
  const value = get('retry-after');
  if (value === undefined) return undefined;
  if (Number.isFinite(Number(value))) return Math.max(0, Number(value) * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now.getTime());
}

// The wait before the nth transient retry (1-based): exponential from one second, never less than retry-after,
// capped. null when the provider asks for longer than we are willing to wait inside a stage call.
export function transientDelayMs(error: unknown, retryNumber: number, now: Date = new Date()): number | null {
  const requested = retryAfterMs(error, now);
  if (requested !== undefined && requested > TRANSIENT_MAX_RETRY_AFTER_MS) return null;
  const backoff = Math.min(TRANSIENT_BASE_DELAY_MS * 2 ** (retryNumber - 1), TRANSIENT_MAX_DELAY_MS);
  return Math.max(backoff, requested ?? 0);
}

// A timeout or a dropped connection that did not reach the SDK as an APICallError.
export function isTimeoutLike(error: unknown): boolean {
  const names = new Set<string>();
  const codes = new Set<string>();
  for (let e: unknown = error, depth = 0; e && typeof e === 'object' && depth < 4; e = (e as { cause?: unknown }).cause, depth += 1) {
    const x = e as { name?: unknown; code?: unknown };
    if (typeof x.name === 'string') names.add(x.name);
    if (typeof x.code === 'string') codes.add(x.code);
  }
  return (
    names.has('TimeoutError') || names.has('AbortError') ||
    [...codes].some((c) => /^(ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|UND_ERR_(HEADERS|BODY|CONNECT)_TIMEOUT|UND_ERR_SOCKET)$/.test(c))
  );
}

// ---- bad JSON: the repair request (moved here unchanged from Script Generation) ------------------------------

export const FEEDBACK_ERROR_CHARS = 500;
export const FEEDBACK_REPLY_CHARS = 8000;

// Bugs Task 11 (R5) - the repair call says what was wrong, instead of re-rolling blind.
export function buildJsonRepairMessages(
  userMessage: string,
  // `retryMessage` is a ready-made instruction for a problem the generic wording cannot name (a chapter-count
  // miss); when present it replaces the generic sentence.
  failure: { what: string; parseError: string; retryMessage?: string },
  replyText: string,
): LLMMessage[] {
  if (failure.retryMessage) {
    return [
      { role: 'user', content: userMessage },
      { role: 'assistant', content: replyText.slice(0, FEEDBACK_REPLY_CHARS) },
      { role: 'user', content: failure.retryMessage },
    ];
  }
  const detail = failure.parseError.slice(0, FEEDBACK_ERROR_CHARS);
  const problem =
    failure.what === 'did not return valid JSON'
      ? `could not be parsed as JSON (${detail})`
      : `did not match the required shape (${detail})`;
  return [
    { role: 'user', content: userMessage },
    { role: 'assistant', content: replyText.slice(0, FEEDBACK_REPLY_CHARS) },
    {
      role: 'user',
      content: `Your previous reply ${problem}. Reply again with ONLY the corrected JSON object. Escape every double quote inside a string value as \\" and write line breaks inside a string as \\n. No code fences, no commentary.`,
    },
  ];
}

// ---- the ceiling: extra provider calls per stage call -------------------------------------------------------

export type ExtraCallReason = 'cut-off' | 'bad-json' | 'transient' | 'structured-output-rejected';

// Asked before every extra provider call. Returns the reason to refuse (words for a person), or null to allow.
// `unbookedCostUsd` is what this stage call has already spent but not yet booked as usage events, which the
// budget tables cannot see yet.
export type RetryGuard = (info: { purpose: Purpose; reason: ExtraCallReason; unbookedCostUsd: number }) => Promise<string | null>;

export type ExtraCallDecision = { ok: true } | { ok: false; why: 'ceiling' } | { ok: false; why: 'budget'; detail: string };

export class CallLedger {
  private used = 0;
  private unbookedUsd = 0;
  readonly sleep: (ms: number) => Promise<void>;
  private readonly guard?: RetryGuard;
  private readonly maxExtra: number;

  constructor(options: { guard?: RetryGuard; maxExtraCalls?: number; sleep?: (ms: number) => Promise<void> } = {}) {
    this.guard = options.guard;
    this.maxExtra = Math.min(options.maxExtraCalls ?? MAX_EXTRA_PROVIDER_CALLS, MAX_EXTRA_PROVIDER_CALLS);
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  get extraCallsUsed(): number {
    return this.used;
  }

  get unbookedCostUsd(): number {
    return this.unbookedUsd;
  }

  // A billed call finished: remember its cost for the budget check of the next extra call.
  noteSpend(costUsd: string | number): void {
    this.unbookedUsd += Number(costUsd);
  }

  // Take one extra provider call, or say why not. The allowance is spent only when the call is allowed.
  async take(purpose: Purpose, reason: ExtraCallReason): Promise<ExtraCallDecision> {
    if (this.used >= this.maxExtra) return { ok: false, why: 'ceiling' };
    const refusal = await this.guard?.({ purpose, reason, unbookedCostUsd: this.unbookedUsd });
    if (refusal) return { ok: false, why: 'budget', detail: refusal };
    this.used += 1;
    return { ok: true };
  }
}

// The error to throw when the stage's budget refused an extra call. `context` carries the calls already billed.
export function spendLimitBeforeRetryError(label: string, detail: string, context: StageErrorContext): NonTransientStageError {
  return new NonTransientStageError(spendLimitBeforeRetryMessage(label, detail), undefined, { ...context, recoveryKind: 'spend_limit' });
}

// ---- helpers shared with the client ---------------------------------------------------------------------------

export function percentUsed(outputTokens: number, limit: number): number {
  return limit > 0 ? Math.round((outputTokens / limit) * 1000) / 10 : 0;
}

// R6.3: a call that used this share of its limit or more is flagged and logged.
export const NEAR_MISS_FRACTION = 0.6;

export function isNearMiss(outputTokens: number, limit: number): boolean {
  return limit > 0 && outputTokens >= limit * NEAR_MISS_FRACTION;
}

export function priorAttemptOf(llm: LLMResponse): LLMPriorAttempt {
  return {
    provider: llm.provider,
    model: llm.model,
    usage: llm.usage,
    costUsd: llm.costUsd,
    stopReason: llm.stopReason,
    maxOutputTokens: llm.maxOutputTokens,
    replyLength: llm.text.length,
    ...(llm.evidence ? { evidence: llm.evidence } : {}),
  };
}

export function usageMetadata(evidence: LLMCallEvidence | undefined): Record<string, unknown> | undefined {
  return evidence ? { llm: evidence } : undefined;
}
