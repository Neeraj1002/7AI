import { getStageErrorContext, NonTransientStageError, recoverableFailureKind, type StageErrorContext } from './retry-with-backoff';
import type { LLMResponse } from '../llm';

// Bugs Task 11 (R1) — what a failed stage row keeps beyond its one-line
// `error`: the raw model reply, for the failures where a reply existed but
// could not be used (an unparseable script). Absent for every other failure,
// so a failed row's `output` stays null exactly as before for them.
export const FAILED_STAGE_RAW_REPLY_CAP = 8000;

export function failureOutputFromError(error: unknown): Record<string, unknown> | undefined {
  const context = getStageErrorContext(error);
  const recoveryKind = recoverableFailureKind(error);
  if (!context || (typeof context.rawReply !== 'string' && !recoveryKind)) return undefined;
  return {
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
          rawReply: context.rawReply.slice(0, FAILED_STAGE_RAW_REPLY_CAP),
          rawReplyTruncated: context.rawReply.length > FAILED_STAGE_RAW_REPLY_CAP,
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
                firstStopReason: context.firstStopReason ?? null,
                firstRawReply: context.firstRawReply.slice(0, FAILED_STAGE_RAW_REPLY_CAP),
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
  };
}

export type FailureUsageFields = {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: string;
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
  };
}

// Bugs Task 11 (R3) — a stage that made several model calls in one attempt
// (script generation's one retry) lists them all, so each is booked as its own
// UsageEvent and the retry counts against the budget.
export function llmCallsContext(calls: LLMResponse[]): StageErrorContext {
  return {
    calls: calls.map((llm) => ({
      provider: llm.provider,
      model: llm.model,
      inputTokens: llm.usage.inputTokens,
      outputTokens: llm.usage.outputTokens,
      costUsd: llm.costUsd,
    })),
  };
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
