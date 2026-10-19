// Public surface of the LLM / text-completion layer. Call sites import only
// from here — never from client.ts or registry.ts directly — and declare a
// *purpose*, never a model, provider or output limit. See
// docs/decisions/LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md for the full
// rationale, and AGENT_FLEET_DESIGN.md Section 5.1/8.1 for how this fits the
// broader design.

import { getStageErrorContext, NonTransientStageError, TransientStageError } from '../run-pipeline/retry-with-backoff';
import { callProviderModel } from './client';
import { resolveModelFacts } from './models';
import { assertPurposeConfig, resolvePurpose } from './registry';
import type { LLMMessage, LLMPriorAttempt, LLMRequest, LLMResponse, Purpose, Reasoning } from './types';

export type { Purpose, LLMMessage, LLMResponse, LLMUsage, LLMRequest, LLMPriorAttempt, Reasoning } from './types';
export { extractJsonText, extractJsonObjectText, describeJsonError } from './extract-json';
export { resolvePurpose, resolvePricing } from './registry';

// The most the automatic retry after a cut-off asks for (LLM Registry task, R2), never above the model's maximum.
export const RETRY_OUTPUT_TOKEN_CEILING = 32_000;

// A reply that ended at the output limit. The provider reports 'length'; a structured call the SDK could not
// turn into the object can come back as 'unknown' with the whole limit spent, which is the same thing.
function endedAtLimit(stopReason: string, outputTokens: number, limit: number): boolean {
  return stopReason === 'length' || (stopReason === 'unknown' && outputTokens >= limit);
}

// Thrown when a reply is still cut off after the one automatic retry. `response` is the last call's reply
// (with the first call under priorAttempts) for the caller that has its own recovery, such as the long-form
// planner splitting a batch. The message names the real cause: an empty reply means the output budget went
// to something other than the answer, so "shorten the brief" would be wrong advice.
export class LLMCutOffError extends NonTransientStageError {
  constructor(message: string, context: Record<string, unknown>, readonly response: LLMResponse) {
    super(message, undefined, context);
    this.name = 'LLMCutOffError';
  }
}

function priorAttemptOf(llm: LLMResponse): LLMPriorAttempt {
  return {
    provider: llm.provider,
    model: llm.model,
    usage: llm.usage,
    costUsd: llm.costUsd,
    stopReason: llm.stopReason,
    maxOutputTokens: llm.maxOutputTokens,
    replyLength: llm.text.length,
  };
}

function callRow(c: LLMPriorAttempt) {
  return {
    provider: c.provider,
    model: c.model,
    inputTokens: c.usage.inputTokens,
    outputTokens: c.usage.outputTokens,
    costUsd: c.costUsd,
  };
}

// Re-wraps an error from a later call with the calls already completed, so the stage's failure path books them.
function withPriorCalls(error: unknown, prior: LLMPriorAttempt[]): unknown {
  const context = { ...(getStageErrorContext(error) ?? {}), calls: prior.map(callRow) };
  if (error instanceof TransientStageError) return new TransientStageError(error.message, error.cause, context);
  if (error instanceof NonTransientStageError) return new NonTransientStageError(error.message, error.cause, context);
  return error;
}

function cutOffMessage(label: string, last: LLMResponse, attempts: LLMPriorAttempt[]): string {
  const technical =
    `stopReason=length, maxTokens=${last.maxOutputTokens}, outputTokens=${last.usage.outputTokens}, ` +
    `replyLength=${last.text.length}, attempts=${attempts.length + 1}, firstMaxTokens=${attempts[0]?.maxOutputTokens ?? last.maxOutputTokens}`;
  return last.text.trim().length === 0
    ? `${label}: the model used its whole output budget without writing an answer, twice. Your brief is not the problem. Press Retry this step; if it repeats, send the debug bundle. (${technical})`
    : `${label}: the reply was cut off even after one automatic retry with a larger limit. Press Retry this step; if it repeats, send the debug bundle. (${technical})`;
}

export async function callLLM(req: {
  purpose: Purpose;
  system: string;
  messages: LLMMessage[];
  outputSchema?: LLMRequest['outputSchema'];
}): Promise<LLMResponse> {
  const entry = resolvePurpose(req.purpose);
  assertPurposeConfig(req.purpose, entry);
  const { provider, model } = entry;
  const facts = resolveModelFacts(model);

  const call = async (maxOutputTokens: number, reasoning: Reasoning): Promise<LLMResponse> => {
    const result = await callProviderModel({
      provider,
      model,
      system: req.system,
      messages: req.messages,
      maxOutputTokens,
      reasoning,
      stream: maxOutputTokens > facts.streamingAboveTokens,
      outputSchema: req.outputSchema,
    });
    const stopReason = endedAtLimit(result.stopReason, result.usage.outputTokens, maxOutputTokens) ? 'length' : result.stopReason;
    return { ...result, stopReason, provider, model, maxOutputTokens, priorAttempts: [] };
  };

  const first = await call(entry.maxOutputTokens, entry.reasoning);
  if (first.stopReason !== 'length') return first;

  // R2 — one automatic retry: the limit doubled (at most 32,000 and never above the model's maximum) and
  // reasoning off. Both calls are billed, so the first travels on the reply (or the error) to be booked.
  const retryLimit = Math.min(entry.maxOutputTokens * 2, RETRY_OUTPUT_TOKEN_CEILING, facts.maxOutputTokens);
  console.warn(
    `[llm] ${req.purpose} reply cut off at ${first.maxOutputTokens} output tokens (outputTokens=${first.usage.outputTokens}, reasoningTokens=${first.usage.reasoningTokens ?? 'n/a'}, replyLength=${first.text.length}); retrying once at ${retryLimit} with reasoning off`,
  );
  // The first call was billed even if the retry never completes: keep it on the error that escapes.
  const retry = await call(retryLimit, 'off').catch((error: unknown) => {
    throw withPriorCalls(error, [priorAttemptOf(first)]);
  });
  const attempts = [priorAttemptOf(first)];
  retry.priorAttempts = attempts;
  if (retry.stopReason !== 'length') return retry;

  const message = cutOffMessage(entry.label, retry, attempts);
  console.error(`[llm] ${req.purpose} reply cut off twice: ${message}\n  head: ${retry.text.slice(0, 300)}\n  tail: ${retry.text.slice(-300)}`);
  throw new LLMCutOffError(
    message,
    {
      provider,
      model,
      inputTokens: retry.usage.inputTokens,
      outputTokens: retry.usage.outputTokens,
      costUsd: retry.costUsd,
      stopReason: 'length',
      // Every call, so each is booked as its own usage event.
      calls: [...attempts, priorAttemptOf(retry)].map(callRow),
      replyLength: retry.text.length,
      parseError: `output cap reached (maxTokens ${retry.maxOutputTokens})`,
      rawReply: retry.text,
      attempts: attempts.length + 1,
      reasoningTokens: retry.usage.reasoningTokens ?? null,
      firstReasoningTokens: attempts[0]?.usage.reasoningTokens ?? null,
      maxTokens: retry.maxOutputTokens,
    },
    retry,
  );
}
