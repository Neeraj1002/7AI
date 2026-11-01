import type { z } from 'zod';
import { type LLMResponse, type Purpose, type RetryGuard } from '../llm';
import { callJson } from '../packaging/generate';
import { failureUsageEvents } from '../run-pipeline/stage-failure';
import { NO_EXTRA_CALLS, worstCaseCostUsd } from './angle-step';
import { PART_B_CAP_USD } from './constants';
import { coldReaderSystem, coldReaderUser, promiseMatchSystem, promiseMatchUser } from './prompts';
import { decideVerdict, scriptHash } from './script-check';
import { ColdReaderReplySchema, PromiseMatchReplySchema, type ColdReaderReply, type PromiseMatchReply, type StoredCall, type StoredScriptCheck } from './schemas';

// R4 to R6, R8. Part B as one function: the cold reader on the finished script, then (when an angle was chosen) one
// promise-match check. At most two calls, no retry, a hard cap checked before each call and the real usage metered after.
// Never throws: whatever goes wrong is recorded and the run goes on. The reader's request holds the script text and the
// persona only (a test asserts it).

export type ScriptStepDeps = {
  meter: (llm: LLMResponse, purpose: Purpose) => Promise<void>;
  bookFailure: (error: unknown, purpose: Purpose) => Promise<void>;
  capUsd?: number;
  call?: <S extends z.ZodType>(p: { purpose: Purpose; system: string; user: string; schema: S; retryGuard: RetryGuard }) => Promise<{ value: z.infer<S>; llm: LLMResponse }>;
};

function describeFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/valid JSON|failed validation|did not return/i.test(message)) return 'the reader returned an unreadable reply';
  return 'the reader could not be reached';
}

const CAP_REASON = 'the budget for this step was reached';

export async function runScriptStep(params: {
  scriptText: string;
  format: 'short' | 'long';
  persona: string | null;
  // The chosen angle, from Part A's record; null when none was chosen (skipped, not run, or the feature off at intake).
  angle: { title: string; promise: string } | null;
  deps: ScriptStepDeps;
}): Promise<StoredScriptCheck> {
  const { deps } = params;
  const cap = deps.capUsd ?? PART_B_CAP_USD;
  const call = deps.call ?? ((p) => callJson(p));
  const calls: StoredCall[] = [];
  let spent = 0;

  const record = (llm: LLMResponse, purpose: StoredCall['purpose']) => {
    const cost = Number(llm.costUsd) + (llm.priorAttempts ?? []).reduce((sum, a) => sum + Number(a.costUsd), 0);
    spent += cost;
    calls.push({ purpose, model: llm.model, inputTokens: llm.usage.inputTokens, outputTokens: llm.usage.outputTokens, costUsd: cost, durationMs: llm.evidence?.durationMs ?? null });
  };
  const withinCap = (purpose: Purpose, system: string, user: string) => spent + worstCaseCostUsd(purpose, system, user) <= cap;

  const base = { version: 1 as const, scriptHash: scriptHash(params.scriptText), format: params.format, promiseUsed: params.angle };
  const noMatch = (note: string) => ({ ran: false, note, about: null, remembered: null });
  const notRun = (reason: string, match: StoredScriptCheck['promiseMatch'] = noMatch('Not compared: the check could not run'), reader: ColdReaderReply | null = null): StoredScriptCheck => ({
    ...base, status: 'not_run', notRunReason: reason, reader, swipeAtPercent: null, verdict: null, reasons: [],
    promiseMatch: match, calls, costUsd: spent, tags: { partB: 'not_run' },
  });

  const system = coldReaderSystem(params.persona);
  const user = coldReaderUser(params.scriptText);
  if (!withinCap('story-cold-reader', system, user)) return notRun(CAP_REASON);
  let reader: ColdReaderReply;
  try {
    const out = await call({ purpose: 'story-cold-reader', system, user, schema: ColdReaderReplySchema, retryGuard: NO_EXTRA_CALLS });
    await deps.meter(out.llm, 'story-cold-reader');
    record(out.llm, 'story-cold-reader');
    reader = out.value;
  } catch (error) {
    for (const row of failureUsageEvents(error)) spent += Number(row.costUsd) || 0;
    await deps.bookFailure(error, 'story-cold-reader').catch(() => undefined);
    return notRun(describeFailure(error));
  }

  // The match check runs only with a chosen angle (decision 6); otherwise it does not run and cannot cause a FAIL.
  let match: PromiseMatchReply | null = null;
  let matchRecord: StoredScriptCheck['promiseMatch'] = noMatch('Not compared: no angle was chosen');
  if (params.angle) {
    const mSystem = promiseMatchSystem();
    const mUser = promiseMatchUser(params.angle.promise, reader.about, reader.remembered);
    if (!withinCap('story-promise-match', mSystem, mUser)) {
      matchRecord = noMatch('Not compared: the budget for this step was reached');
    } else {
      try {
        const out = await call({ purpose: 'story-promise-match', system: mSystem, user: mUser, schema: PromiseMatchReplySchema, retryGuard: NO_EXTRA_CALLS });
        await deps.meter(out.llm, 'story-promise-match');
        record(out.llm, 'story-promise-match');
        match = out.value;
        matchRecord = { ran: true, note: `${out.value.about.note} ${out.value.remembered.note}`.trim(), about: out.value.about, remembered: out.value.remembered };
      } catch (error) {
        for (const row of failureUsageEvents(error)) spent += Number(row.costUsd) || 0;
        await deps.bookFailure(error, 'story-promise-match').catch(() => undefined);
        matchRecord = noMatch('Not compared: the match check could not run');
      }
    }
  }

  const decided = decideVerdict({ scriptText: params.scriptText, format: params.format, reader, match });
  if (!decided.ok) return notRun(decided.reason, matchRecord, reader);
  return {
    ...base, status: 'ran', notRunReason: null, reader,
    swipeAtPercent: decided.swipe.kind === 'found' ? decided.swipe.percent : null,
    verdict: decided.verdict, reasons: decided.reasons, promiseMatch: matchRecord,
    calls, costUsd: spent, tags: { partB: 'ran' },
  };
}

// A step that never started: the same record shape, status not_run.
export function notRunScriptCheck(params: { reason: string; scriptText: string; format: 'short' | 'long' }): StoredScriptCheck {
  return {
    version: 1, status: 'not_run', notRunReason: params.reason, scriptHash: scriptHash(params.scriptText), format: params.format,
    reader: null, swipeAtPercent: null, verdict: null, reasons: [], promiseUsed: null,
    promiseMatch: { ran: false, note: 'Not compared: the check could not run', about: null, remembered: null },
    calls: [], costUsd: 0, tags: { partB: 'not_run' },
  };
}
