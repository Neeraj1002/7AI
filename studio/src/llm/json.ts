// Sprint 6 Task 1 (PR 1): the one place an LLM call that must return JSON gets a strict schema, one capped re-ask
// and a kept raw reply. It sits over callLLM and changes none of callLLM's own rules (cut-off retry, transient
// backoff, structured-output fallback); it adds only the 'bad-json' row of the failure table.
//
// The caller books `calls` with llmUsageRows (one usage event per billed call) and stores `failures` in the
// stage output. A reply that stays unusable after the re-ask is a result ({ ok: false }), never a throw, so the
// caller decides what that means. Provider failures, cut-offs and a refused budget still throw, as in callLLM.
//
// Import this file directly (`../../llm/json`), not through llm/index.ts: it reads run-pipeline/stage-failure,
// which itself imports the index.

import type { ZodType } from 'zod';
import { getStageErrorContext, NonTransientStageError, TransientStageError } from '../run-pipeline/retry-with-backoff';
import { FAILED_STAGE_RAW_REPLY_CAP, llmCallsContext } from '../run-pipeline/stage-failure';
import { callLLM, describeJsonError, extractJsonText, type LLMMessage, type LLMResponse, type Purpose } from './index';
import { buildJsonRepairMessages, CallLedger, spendLimitBeforeRetryError, type RetryGuard } from './failure-policy';

export const JSON_RAW_REPLY_CAP = FAILED_STAGE_RAW_REPLY_CAP;

export type JsonAttemptFailure = {
  // 1-based call number inside this helper.
  attempt: number;
  // Why the reply was unusable: 'did not return valid JSON (...)' or 'did not match the required shape (...)'.
  reason: string;
  // The reply, capped at JSON_RAW_REPLY_CAP characters.
  rawReply: string;
  rawReplyTruncated: boolean;
  stopReason: string;
};

export type CallLLMJsonResult<T> =
  | { ok: true; value: T; calls: LLMResponse[]; failures: JsonAttemptFailure[] }
  | { ok: false; reason: string; rawReply: string; calls: LLMResponse[]; failures: JsonAttemptFailure[] };

function parseReply<T>(text: string, schema: ZodType<T>): { ok: true; value: T } | { ok: false; what: string; detail: string } {
  let json: unknown;
  try {
    json = JSON.parse(extractJsonText(text));
  } catch (error) {
    return { ok: false, what: 'did not return valid JSON', detail: describeJsonError(error) };
  }
  const parsed = schema.safeParse(json);
  if (parsed.success) return { ok: true, value: parsed.data };
  return { ok: false, what: 'did not match the required shape', detail: parsed.error.message };
}

export async function callLLMJson<T>(req: {
  purpose: Purpose;
  system: string;
  messages: LLMMessage[];
  // Sent to the provider as the output schema and used again to validate the reply.
  schema: ZodType<T>;
  // Shared with the caller's other extra calls; the re-ask takes its place in the ceiling first.
  ledger?: CallLedger;
  retryGuard?: RetryGuard;
}): Promise<CallLLMJsonResult<T>> {
  const ledger = req.ledger ?? new CallLedger({ guard: req.retryGuard });
  const calls: LLMResponse[] = [];
  const failures: JsonAttemptFailure[] = [];
  let messages = req.messages;

  // At most two iterations: the first call, and one re-ask. There is no other loop.
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    let llm: LLMResponse;
    try {
      llm = await callLLM({ purpose: req.purpose, system: req.system, messages, outputSchema: req.schema, ledger });
    } catch (error) {
      if (calls.length === 0) throw error;
      // The first call was billed: keep it on the error so the stage books it.
      const failed = getStageErrorContext(error);
      const context = { ...failed, calls: [...(llmCallsContext(calls).calls as unknown[]), ...(Array.isArray(failed?.calls) ? failed.calls : [])] };
      if (error instanceof TransientStageError) throw new TransientStageError(error.message, error, context);
      throw new NonTransientStageError(error instanceof Error ? error.message : String(error), error, context);
    }
    calls.push(llm);

    const parsed = parseReply(llm.text, req.schema);
    if (parsed.ok) return { ok: true, value: parsed.value, calls, failures };

    const reason = `${parsed.what} (${parsed.detail.slice(0, 500)})`;
    failures.push({
      attempt,
      reason,
      rawReply: llm.text.slice(0, JSON_RAW_REPLY_CAP),
      rawReplyTruncated: llm.text.length > JSON_RAW_REPLY_CAP,
      stopReason: llm.stopReason,
    });
    if (attempt === 2) return { ok: false, reason, rawReply: llm.text.slice(0, JSON_RAW_REPLY_CAP), calls, failures };

    // The budget is asked before the extra call, through the ledger's guard.
    const taken = await ledger.take(req.purpose, 'bad-json');
    if (!taken.ok) {
      if (taken.why === 'budget') {
        throw spendLimitBeforeRetryError(req.purpose, taken.detail, { ...llmCallsContext(calls), rawReply: llm.text.slice(0, JSON_RAW_REPLY_CAP), stopReason: llm.stopReason });
      }
      // The ceiling is used up (other extra calls took it): no re-ask, the reply stays unusable.
      return { ok: false, reason, rawReply: llm.text.slice(0, JSON_RAW_REPLY_CAP), calls, failures };
    }
    // buildJsonRepairMessages echoes a single user message first; the original messages (with any attachments) stay.
    messages = [...req.messages, ...buildJsonRepairMessages('', { what: parsed.what, parseError: parsed.detail }, llm.text).slice(1)];
  }
  /* c8 ignore next */
  throw new Error('callLLMJson: unreachable');
}
