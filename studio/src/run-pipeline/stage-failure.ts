import { getStageErrorContext, NonTransientStageError, recoverableFailureKind, type StageErrorContext } from './retry-with-backoff';
import { usageMetadata, type LLMResponse } from '../llm';

// Bugs Task 11 (R1) — what a failed stage row keeps beyond its one-line
// `error`: the raw model reply, for the failures where a reply existed but
// could not be used (an unparseable script). Absent for every other failure,
// so a failed row's `output` stays null exactly as before for them.
export const FAILED_STAGE_RAW_REPLY_CAP = 8000;

export function failureOutputFromError(error: unknown): Record<string, unknown> | undefined {
  const context = getStageErrorContext(error);
  const recoveryKind = recoverableFailureKind(error);
  const hasCallEvidence = Array.isArray(context?.callEvidence) && context.callEvidence.length > 0;
  if (!context || (typeof context.rawReply !== 'string' && !recoveryKind && !hasCallEvidence)) return undefined;
  const replyCap = context.contractVersion === 3 ? 32000 : FAILED_STAGE_RAW_REPLY_CAP;
  return {
    ...(context.contractVersion === 3 ? { plannerContractVersion: 3, failureKind: context.failureKind, chapterIndex: context.chapterIndex, sceneOffset: context.sceneOffset, sceneCount: context.sceneCount, requestHash: context.requestHash, requestKind: context.requestKind, recoveryStrategy: context.recoveryStrategy, maxTokens: context.maxTokens, reusedSceneCount: context.reusedSceneCount } : {}),
    // LLM Registry task (R6): what each provider call used against its limit, and the provider's response
    // metadata for the failed call (never the prompt).
    ...(hasCallEvidence
      ? {
          llm: {
            calls: context.callEvidence,
            providerCalls: context.providerCalls ?? null,
            ...(context.responseMeta ? { responseMeta: context.responseMeta } : {}),
            ...(context.statusCode !== undefined ? { statusCode: context.statusCode } : {}),
          },
        }
      : {}),
    ...(recoveryKind
      ? {
          recovery: {
            kind: recoveryKind,
            message: error instanceof Error ? error.message : String(error),
            providerErrorMessage: context.providerErrorMessage ?? null,
            providerResponseBody: typeof context.providerResponseBody === 'string' ? context.providerResponseBody.slice(0, FAILED_STAGE_RAW_REPLY_CAP) : null,
            provider: typeof context.provider === 'string' ? context.provider : null,
            model: typeof context.model === 'string' ? context.model : null,
            statusCode: typeof context.statusCode === 'number' ? context.statusCode : null,
            providerErrorCode: typeof context.providerErrorCode === 'string' ? context.providerErrorCode : null,
          },
        }
      : {}),
    ...(typeof context.rawReply === 'string'
      ? {
          rawReply: context.rawReply.slice(0, replyCap),
          rawReplyTruncated: context.rawReply.length > replyCap,
          ...(context.contractVersion === 3 && context.rawReply.length > replyCap ? { rawReplyTail: context.rawReply.slice(-4000) } : {}),
          stopReason: context.stopReason ?? null,
          replyLength: context.replyLength ?? null,
          parseError: context.parseError ?? null,
          ...(context.failureKind === 'output_token_exhaustion'
            ? { failureKind: context.failureKind, sceneOffset: context.sceneOffset, sceneCount: context.sceneCount }
            : {}),
          ...(typeof context.firstRawReply === 'string'
            ? {
                attempts: context.attempts ?? null,
                firstParseError: context.firstParseError ?? null,
                ...(context.contractVersion === 3 ? { firstReplyLength: context.firstReplyLength, firstRawReplyTruncated: context.firstRawReply.length > replyCap, ...(context.firstRawReply.length > replyCap ? { firstRawReplyTail: context.firstRawReply.slice(-4000) } : {}) } : {}),
                firstStopReason: context.firstStopReason ?? null,
                firstRawReply: context.firstRawReply.slice(0, replyCap),
              }
            : {}),
        }
      : {}),
  };
}

// Bugs Task 11 (R2) — a stage whose model call completed but whose reply was
// then rejected (unparseable, failed schema validation) threw an error with no
// trace of that call, so every stage's failure-path usage event booked
// provider/model 'unknown', tokens 0 and cost $0 for a call that was really
// made and really billed (run 248fae8a: a Sonnet call recorded as $0).
// Throwers now attach the finished call's usage to the error's context, and
// the catch paths read it back here.
export function llmUsageContext(llm: LLMResponse): StageErrorContext {
  return {
    provider: llm.provider,
    model: llm.model,
    inputTokens: llm.usage.inputTokens,
    outputTokens: llm.usage.outputTokens,
    costUsd: llm.costUsd,
    stopReason: llm.stopReason,
    // A reply that came back after an automatic cut-off retry cost two calls: the failure path books each.
    ...((llm.priorAttempts?.length ?? 0) > 0 ? { calls: llmUsageRows(llm) } : {}),
    ...(llm.evidence ? { callEvidence: [...(llm.priorAttempts ?? []).flatMap((a) => (a.evidence ? [a.evidence] : [])), llm.evidence], responseMeta: llm.responseMeta ?? null } : {}),
  };
}

export type FailureUsageFields = {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: string;
  // R6: usage_events.metadata.llm, the evidence for this call. Absent for a call that has none.
  metadata?: Record<string, unknown>;
};

// What a failed attempt's UsageEvent should record. An error with no attached
// usage (the provider call itself failed, or a non-LLM failure) keeps the
// previous behaviour: the provider/model client.ts attached when it has them,
// otherwise 'unknown', with zero tokens and cost.
export function failureUsageFields(error: unknown): FailureUsageFields {
  const context = getStageErrorContext(error);
  return {
    provider: typeof context?.provider === 'string' ? context.provider : 'unknown',
    model: typeof context?.model === 'string' ? context.model : 'unknown',
    inputTokens: typeof context?.inputTokens === 'number' ? context.inputTokens : 0,
    outputTokens: typeof context?.outputTokens === 'number' ? context.outputTokens : 0,
    costUsd: typeof context?.costUsd === 'string' ? context.costUsd : '0.000000',
    ...(context?.metadata && typeof context.metadata === 'object' ? { metadata: context.metadata as Record<string, unknown> } : {}),
  };
}

// LLM Registry task (R2) — every billed call behind one reply: the calls callLLM made before it (cut off at
// the output limit, then retried) followed by the reply itself. Each row is booked as its own UsageEvent.
export function llmUsageRows(llm: LLMResponse): FailureUsageFields[] {
  return [
    ...(llm.priorAttempts ?? []).map((attempt) => ({
      provider: attempt.provider,
      model: attempt.model,
      inputTokens: attempt.usage.inputTokens,
      outputTokens: attempt.usage.outputTokens,
      costUsd: attempt.costUsd,
      ...metaOf(attempt.evidence),
    })),
    {
      provider: llm.provider,
      model: llm.model,
      inputTokens: llm.usage.inputTokens,
      outputTokens: llm.usage.outputTokens,
      costUsd: llm.costUsd,
      ...metaOf(llm.evidence),
    },
  ];
}

function metaOf(evidence: LLMResponse['evidence']): { metadata?: Record<string, unknown> } {
  const metadata = usageMetadata(evidence);
  return metadata ? { metadata } : {};
}

// Bugs Task 11 (R3) — a stage that made several model calls in one attempt
// (script generation's one retry) lists them all, so each is booked as its own
// UsageEvent and the retry counts against the budget.
export function llmCallsContext(calls: LLMResponse[]): StageErrorContext {
  return { calls: calls.flatMap(llmUsageRows) };
}

// One entry per model call that completed before the failure, or the single
// failureUsageFields entry when the error lists none.
export function failureUsageEvents(error: unknown): FailureUsageFields[] {
  const calls = getStageErrorContext(error)?.calls;
  if (Array.isArray(calls) && calls.length > 0) {
    return calls.map((call) => failureUsageFields(new NonTransientStageError('', undefined, call as StageErrorContext)));
  }
  return [failureUsageFields(error)];
}
