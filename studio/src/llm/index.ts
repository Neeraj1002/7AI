// Public surface of the LLM / text-completion layer. Call sites import only
// from here — never from client.ts or registry.ts directly — and declare a
// *purpose*, never a model, provider or output limit. See
// docs/decisions/LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md for the full
// rationale, and AGENT_FLEET_DESIGN.md Section 5.1/8.1 for how this fits the
// broader design.

import { getStageErrorContext, NonTransientStageError, TransientStageError } from '../run-pipeline/retry-with-backoff';
import { callProviderModel } from './client';
import {
  CallLedger,
  classifyCallError,
  cutOffMessage,
  cutOffRetryLimit,
  endedAtLimit,
  isNearMiss,
  isRefusal,
  percentUsed,
  priorAttemptOf,
  refusalMessage,
  spendLimitBeforeRetryError,
  transientDelayMs,
  usageMetadata,
} from './failure-policy';
import { resolveModelFacts } from './models';
import { assertPurposeConfig, resolvePurpose } from './registry';
import type { LLMCallEvidence, LLMMessage, LLMRequest, LLMResponse, Purpose, Reasoning } from './types';
import type { RetryGuard } from './failure-policy';

export type { Purpose, LLMMessage, LLMResponse, LLMUsage, LLMRequest, LLMPriorAttempt, LLMCallEvidence, Reasoning } from './types';
export { extractJsonText, extractJsonObjectText, describeJsonError } from './extract-json';
export { resolvePurpose, resolvePricing } from './registry';
export {
  CallLedger,
  FAILURE_POLICY,
  MAX_EXTRA_PROVIDER_CALLS,
  RETRY_OUTPUT_TOKEN_CEILING,
  STRUCTURED_OUTPUT_FALLBACK_STATUSES,
  buildJsonRepairMessages,
  spendLimitBeforeRetryError,
  usageMetadata,
  type ExtraCallDecision,
  type ExtraCallReason,
  type FailureKind,
  type RetryGuard,
} from './failure-policy';

// Thrown when a reply is still cut off after the one automatic retry. `response` is the last call's reply
// (with the earlier cut-off calls under priorAttempts) for the caller that has its own recovery, such as the
// long-form planner splitting a batch. The message names the real cause: an empty reply means the output budget
// went to something other than the answer, so "shorten the brief" would be wrong advice.
export class LLMCutOffError extends NonTransientStageError {
  constructor(message: string, context: Record<string, unknown>, readonly response: LLMResponse) {
    super(message, undefined, context);
    this.name = 'LLMCutOffError';
  }
}

function callRow(c: ReturnType<typeof priorAttemptOf>) {
  const metadata = usageMetadata(c.evidence);
  return {
    provider: c.provider,
    model: c.model,
    inputTokens: c.usage.inputTokens,
    outputTokens: c.usage.outputTokens,
    costUsd: c.costUsd,
    ...(metadata ? { metadata } : {}),
  };
}

// Re-wraps an error from a later call with extra context, keeping its kind (transient or not).
function withContext(error: unknown, extra: Record<string, unknown>): unknown {
  const context = { ...(getStageErrorContext(error) ?? {}), ...extra };
  if (error instanceof TransientStageError) return new TransientStageError(error.message, error.cause, context);
  if (error instanceof NonTransientStageError) return new NonTransientStageError(error.message, error.cause, context);
  return error;
}

// One stage call. What happens when it goes wrong is the table in failure-policy.ts; this function is the
// mechanism that applies it. Every provider call, success or failure, ends with evidence (R6) on its reply or on
// the error that escapes.
export async function callLLM(req: {
  purpose: Purpose;
  system: string;
  messages: LLMMessage[];
  outputSchema?: LLMRequest['outputSchema'];
  // R5: the extra provider calls this stage call has used so far, shared with the caller's own repair call, and the
  // stage's budget check for each of them. Without one, callLLM keeps its own and checks no budget.
  ledger?: CallLedger;
  // Shortcut for a caller with no ledger of its own: the stage's budget check, asked before every extra call.
  retryGuard?: RetryGuard;
}): Promise<LLMResponse> {
  const entry = resolvePurpose(req.purpose);
  assertPurposeConfig(req.purpose, entry);
  const { provider, model } = entry;
  const facts = resolveModelFacts(model);
  if (req.outputSchema && !facts.supportsStructuredOutput) {
    throw new NonTransientStageError(`${entry.label}: ${model} does not support structured output, but this purpose asked for it.`);
  }
  const ledger = req.ledger ?? new CallLedger({ guard: req.retryGuard });

  let schema = req.outputSchema;
  let limit = entry.maxOutputTokens;
  let reasoning: Reasoning = entry.reasoning;
  let kind: LLMCallEvidence['kind'] = 'first';
  let providerCalls = 0;
  let transientRetries = 0;
  let structuredFallback = false;
  let cutOffRetried = false;
  // Billed calls so far (each is booked as its own usage event): the cut-off replies, then the final one.
  const done: LLMResponse[] = [];
  const evidenceOf: LLMCallEvidence[] = [];

  // What every failure out of here carries so the stage books the calls already paid for and the failed stage's
  // output keeps the evidence (R6).
  const failureContext = (): Record<string, unknown> => ({
    calls: done.map((d) => callRow(priorAttemptOf(d))),
    callEvidence: evidenceOf,
    providerCalls,
  });

  for (;;) {
    providerCalls += 1;
    const callLimit = limit;
    const callReasoning = reasoning;
    let result;
    try {
      result = await callProviderModel({
        provider,
        model,
        system: req.system,
        messages: req.messages,
        maxOutputTokens: callLimit,
        reasoning: callReasoning,
        stream: callLimit > facts.streamingAboveTokens,
        outputSchema: schema,
      });
    } catch (error) {
      const failure = classifyCallError(error, Boolean(schema));
      if (failure === 'structured-output-rejected' && done.length === 0 && !structuredFallback) {
        const taken = await ledger.take(req.purpose, 'structured-output-rejected');
        if (taken.ok) {
          console.error(
            `[llm] ${req.purpose}: provider returned ${String(getStageErrorContext(error)?.statusCode)} for the structured-output request, falling back to plain text: ${error instanceof Error ? error.message : String(error)}`,
          );
          schema = undefined;
          structuredFallback = true;
          kind = 'structured-fallback';
          continue;
        }
        if (taken.why === 'budget') throw spendLimitBeforeRetryError(entry.label, taken.detail, failureContext());
      }
      if (failure === 'transient') {
        transientRetries += 1;
        const delay = transientDelayMs(error, transientRetries);
        if (delay !== null) {
          const taken = await ledger.take(req.purpose, 'transient');
          if (taken.ok) {
            console.warn(`[llm] ${req.purpose}: transient provider error, retrying in ${delay} ms (retry ${transientRetries}): ${error instanceof Error ? error.message : String(error)}`);
            await ledger.sleep(delay);
            kind = 'transient-retry';
            continue;
          }
          if (taken.why === 'budget') throw spendLimitBeforeRetryError(entry.label, taken.detail, failureContext());
        }
        // The stage wrapper must not run the whole stage again on top of the retries spent here.
        throw withContext(error, { ...failureContext(), llmRetriesSpent: true });
      }
      throw withContext(error, failureContext());
    }

    const stopReason = endedAtLimit(result.stopReason, result.usage.outputTokens, callLimit) ? 'length' : result.stopReason;
    const evidence: LLMCallEvidence = {
      purpose: req.purpose,
      model,
      attempt: providerCalls,
      kind,
      limit: callLimit,
      outputTokens: result.usage.outputTokens,
      reasoningTokens: result.usage.reasoningTokens ?? null,
      percentUsed: percentUsed(result.usage.outputTokens, callLimit),
      nearMiss: isNearMiss(result.usage.outputTokens, callLimit),
      stopReason,
      finishReason: result.rawFinishReason ?? null,
      blocks: result.blocks ?? 'n/a',
      reasoning: callReasoning === 'off' ? 'off' : callReasoning.budgetTokens,
    };
    evidenceOf.push(evidence);
    const response: LLMResponse = {
      ...result,
      stopReason,
      provider,
      model,
      maxOutputTokens: callLimit,
      priorAttempts: [],
      evidence,
      ...(structuredFallback ? { structuredOutputFallback: true } : {}),
    };
    done.push(response);
    ledger.noteSpend(response.costUsd);
    if (evidence.nearMiss) {
      console.warn(`[llm] llm.near-miss purpose=${req.purpose} used=${evidence.outputTokens}/${callLimit} (${evidence.percentUsed}%) reasoningTokens=${evidence.reasoningTokens ?? 'n/a'} stopReason=${stopReason}`);
    }

    if (isRefusal(stopReason)) {
      const message = refusalMessage(entry.label, response);
      console.error(`[llm] ${req.purpose} refused: ${message}`);
      throw new NonTransientStageError(message, undefined, {
        provider,
        model,
        ...failureContext(),
        stopReason,
        replyLength: response.text.length,
        rawReply: response.text,
        parseError: `provider refusal (${stopReason})`,
        responseMeta: response.responseMeta ?? null,
      });
    }

    if (stopReason !== 'length') {
      response.priorAttempts = done.slice(0, -1).map(priorAttemptOf);
      return response;
    }

    // R2 - one automatic retry: the limit doubled (at most 32,000 and never above the model's maximum) and
    // reasoning off. Both calls are billed, so the first travels on the reply (or the error) to be booked.
    if (!cutOffRetried) {
      cutOffRetried = true;
      const taken = await ledger.take(req.purpose, 'cut-off');
      if (taken.ok) {
        limit = cutOffRetryLimit(entry.maxOutputTokens, facts.maxOutputTokens);
        reasoning = 'off';
        kind = 'cut-off-retry';
        console.warn(
          `[llm] ${req.purpose} reply cut off at ${callLimit} output tokens (outputTokens=${response.usage.outputTokens}, reasoningTokens=${response.usage.reasoningTokens ?? 'n/a'}, blocks=${evidence.blocks}, replyLength=${response.text.length}); retrying once at ${limit} with reasoning off`,
        );
        continue;
      }
      if (taken.why === 'budget') throw spendLimitBeforeRetryError(entry.label, taken.detail, failureContext());
    }

    const retried = done.length > 1;
    const message = cutOffMessage(entry.label, response, done, retried);
    response.priorAttempts = done.slice(0, -1).map(priorAttemptOf);
    console.error(`[llm] ${req.purpose} reply cut off${retried ? ' twice' : ''}: ${message}\n  head: ${response.text.slice(0, 300)}\n  tail: ${response.text.slice(-300)}`);
    throw new LLMCutOffError(
      message,
      {
        provider,
        model,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        costUsd: response.costUsd,
        stopReason: 'length',
        ...failureContext(),
        replyLength: response.text.length,
        parseError: `output cap reached (maxTokens ${callLimit})`,
        rawReply: response.text,
        attempts: done.length,
        reasoningTokens: response.usage.reasoningTokens ?? null,
        firstReasoningTokens: done[0]?.usage.reasoningTokens ?? null,
        maxTokens: callLimit,
        responseMeta: response.responseMeta ?? null,
      },
      response,
    );
  }
}
