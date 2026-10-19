import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

const mocks = vi.hoisted(() => ({ callProviderModel: vi.fn() }));
vi.mock('./client', () => ({ callProviderModel: mocks.callProviderModel }));

import { callLLM, CallLedger, LLMCutOffError, type RetryGuard } from './index';
import { failureOutputFromError, failureUsageEvents, llmUsageRows } from '../run-pipeline/stage-failure';
import { getStageErrorContext, NonTransientStageError, TransientStageError, withRetryAndCircuitBreaker, CircuitBreakerTrippedError } from '../run-pipeline/retry-with-backoff';
import { LLM_REGISTRY } from './registry';

// LLM Registry task, Part B (R5 and R6): callLLM applies the failure table. Mocked provider; the budget check and
// the sleeps are injected so nothing waits and nothing touches a database.
const LIMIT = LLM_REGISTRY['script-generation'].maxOutputTokens;
const req = { purpose: 'script-generation' as const, system: 's', messages: [{ role: 'user' as const, content: 'hi' }] };
const reply = (
  text: string,
  extra: { stopReason?: string; outputTokens?: number; reasoningTokens?: number; rawFinishReason?: string; blocks?: string } = {},
) => ({
  text,
  usage: {
    inputTokens: 1000,
    outputTokens: extra.outputTokens ?? 300,
    ...(extra.reasoningTokens !== undefined ? { reasoningTokens: extra.reasoningTokens } : {}),
  },
  stopReason: extra.stopReason ?? 'stop',
  rawFinishReason: extra.rawFinishReason ?? 'end_turn',
  blocks: extra.blocks ?? 'thinking:0,text:1',
  responseMeta: { id: 'msg_1' },
  costUsd: '0.002000',
});
const overloaded = (headers: Record<string, string> = {}) =>
  new TransientStageError('overloaded', undefined, { provider: 'anthropic', model: 'claude-sonnet-5', statusCode: 529, responseHeaders: headers });
const status = (code: number) => new NonTransientStageError(`HTTP ${code}`, undefined, { provider: 'anthropic', model: 'claude-sonnet-5', statusCode: code });
const sleeps: number[] = [];
const ledger = (guard?: RetryGuard) => new CallLedger({ guard, sleep: async (ms) => { sleeps.push(ms); } });

beforeEach(() => {
  vi.clearAllMocks();
  sleeps.length = 0;
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('R5: structured-output fallback (moved here from Script Generation, unchanged)', () => {
  const outputSchema = z.object({ a: z.string() });

  it.each([400, 422])('a %i on the schema request falls back to plain text once and says so on the reply', async (code) => {
    mocks.callProviderModel.mockRejectedValueOnce(status(code)).mockResolvedValueOnce(reply('{"a":"b"}'));
    const llm = await callLLM({ ...req, outputSchema, ledger: ledger() });
    expect(mocks.callProviderModel).toHaveBeenCalledTimes(2);
    expect(mocks.callProviderModel.mock.calls[0][0].outputSchema).toBe(outputSchema);
    expect(mocks.callProviderModel.mock.calls[1][0].outputSchema).toBeUndefined();
    expect(llm.structuredOutputFallback).toBe(true);
    expect(llm.evidence).toMatchObject({ kind: 'structured-fallback', attempt: 2 });
    const logged = (console.error as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain(`provider returned ${code} for the structured-output request`);
  });

  it('falls back only once: a second 400 (now on the plain-text call) is raised', async () => {
    mocks.callProviderModel.mockRejectedValueOnce(status(400)).mockRejectedValueOnce(status(400));
    const error = await callLLM({ ...req, outputSchema, ledger: ledger() }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NonTransientStageError);
    expect(getStageErrorContext(error)).toMatchObject({ statusCode: 400 });
    expect(mocks.callProviderModel).toHaveBeenCalledTimes(2);
  });

  it.each([401, 403])('a %i does not fall back: one call, then the error', async (code) => {
    mocks.callProviderModel.mockRejectedValueOnce(status(code));
    const error = await callLLM({ ...req, outputSchema, ledger: ledger() }).catch((e: unknown) => e);
    expect(getStageErrorContext(error)).toMatchObject({ statusCode: code });
    expect(mocks.callProviderModel).toHaveBeenCalledTimes(1);
  });

  it('a 400 with no schema sent is not a fallback case either', async () => {
    mocks.callProviderModel.mockRejectedValueOnce(status(400));
    await callLLM({ ...req, ledger: ledger() }).catch(() => undefined);
    expect(mocks.callProviderModel).toHaveBeenCalledTimes(1);
  });

  it('an error with no status (a message that mentions the schema) does not fall back', async () => {
    mocks.callProviderModel.mockRejectedValueOnce(new NonTransientStageError('LLM provider call failed: invalid output_format schema', undefined, { provider: 'anthropic' }));
    await callLLM({ ...req, outputSchema, ledger: ledger() }).catch(() => undefined);
    expect(mocks.callProviderModel).toHaveBeenCalledTimes(1);
  });
});

describe('R5: overloaded, rate-limited, timeout and network errors wait and retry', () => {
  it('a 529 then a good reply: waits 1s, the second call is a transient retry, attempt 2', async () => {
    mocks.callProviderModel.mockRejectedValueOnce(overloaded()).mockResolvedValueOnce(reply('{"a":"b"}'));
    const llm = await callLLM({ ...req, ledger: ledger() });
    expect(sleeps).toEqual([1000]);
    expect(llm.text).toBe('{"a":"b"}');
    expect(llm.evidence).toMatchObject({ attempt: 2, kind: 'transient-retry' });
    expect(llm.priorAttempts).toEqual([]); // the failed call billed nothing
  });

  it('honours retry-after (seconds) when it is longer than the backoff', async () => {
    mocks.callProviderModel.mockRejectedValueOnce(overloaded({ 'retry-after': '7' })).mockResolvedValueOnce(reply('ok'));
    await callLLM({ ...req, ledger: ledger() });
    expect(sleeps).toEqual([7000]);
  });

  it('two failures then success uses both extra calls: waits 1s then 2s', async () => {
    mocks.callProviderModel.mockRejectedValueOnce(overloaded()).mockRejectedValueOnce(overloaded()).mockResolvedValueOnce(reply('ok'));
    const l = ledger();
    await callLLM({ ...req, ledger: l });
    expect(sleeps).toEqual([1000, 2000]);
    expect(l.extraCallsUsed).toBe(2);
  });

  it('three failures: the ceiling holds at three provider calls, and the error tells the stage wrapper not to run the stage again', async () => {
    mocks.callProviderModel.mockRejectedValue(overloaded());
    const error = await callLLM({ ...req, ledger: ledger() }).catch((e: unknown) => e);
    expect(mocks.callProviderModel).toHaveBeenCalledTimes(3);
    expect(error).toBeInstanceOf(TransientStageError);
    expect(getStageErrorContext(error)).toMatchObject({ llmRetriesSpent: true, statusCode: 529, providerCalls: 3 });
  });

  it('a retry-after over a minute is not waited out: one call, the stage fails', async () => {
    mocks.callProviderModel.mockRejectedValue(overloaded({ 'retry-after': '120' }));
    const error = await callLLM({ ...req, ledger: ledger() }).catch((e: unknown) => e);
    expect(mocks.callProviderModel).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([]);
    expect(getStageErrorContext(error)).toMatchObject({ llmRetriesSpent: true });
  });

  it('the stage wrapper does not run the stage again on top of the retries already spent here', async () => {
    mocks.callProviderModel.mockRejectedValue(overloaded());
    const stage = vi.fn(() => callLLM({ ...req, ledger: ledger() }));
    const error = await withRetryAndCircuitBreaker(stage, { baseDelayMs: 1 }).catch((e: unknown) => e);
    expect(stage).toHaveBeenCalledTimes(1);
    expect(error).toBeInstanceOf(CircuitBreakerTrippedError);
    expect(getStageErrorContext(error)).toMatchObject({ statusCode: 529 });
  });

  it('the wrapper still retries a transient error that did not come from callLLM', async () => {
    const stage = vi.fn(async () => { throw new TransientStageError('disk hiccup'); });
    await withRetryAndCircuitBreaker(stage, { baseDelayMs: 1 }).catch(() => undefined);
    expect(stage).toHaveBeenCalledTimes(3);
  });
});

describe('R5: the ceiling is two extra provider calls per stage call, across all causes', () => {
  it('a cut-off retry plus a transient retry use the two; a third transient failure ends it', async () => {
    mocks.callProviderModel
      .mockResolvedValueOnce(reply('cut', { stopReason: 'length', outputTokens: LIMIT }))
      .mockRejectedValueOnce(overloaded())
      .mockRejectedValueOnce(overloaded());
    const error = await callLLM({ ...req, ledger: ledger() }).catch((e: unknown) => e);
    expect(mocks.callProviderModel).toHaveBeenCalledTimes(3);
    // The cut-off first call is still booked.
    expect(failureUsageEvents(error)).toHaveLength(1);
    expect(getStageErrorContext(error)).toMatchObject({ llmRetriesSpent: true });
  });

  it('with the allowance already used up a cut-off is not retried and says so', async () => {
    const used = ledger();
    await used.take('script-generation', 'transient');
    await used.take('script-generation', 'bad-json');
    mocks.callProviderModel.mockResolvedValueOnce(reply('{"scriptText":"cut', { stopReason: 'length', outputTokens: LIMIT }));
    const error = await callLLM({ ...req, ledger: used }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LLMCutOffError);
    expect((error as Error).message).toContain('no automatic retry left');
    expect(mocks.callProviderModel).toHaveBeenCalledTimes(1);
  });

  it('a second failure of a different kind keeps the first call booked: cut off, then a 401 on the retry', async () => {
    mocks.callProviderModel
      .mockResolvedValueOnce(reply('cut', { stopReason: 'length', outputTokens: LIMIT, reasoningTokens: LIMIT }))
      .mockRejectedValueOnce(status(401));
    const error = await callLLM({ ...req, ledger: ledger() }).catch((e: unknown) => e);
    expect(getStageErrorContext(error)).toMatchObject({ statusCode: 401 });
    const booked = failureUsageEvents(error);
    expect(booked).toEqual([expect.objectContaining({ outputTokens: LIMIT, costUsd: '0.002000', metadata: { llm: expect.objectContaining({ attempt: 1, stopReason: 'length', reasoningTokens: LIMIT }) } })]);
  });
});

describe('R5: every extra call is checked against the stage budget', () => {
  it('a cut-off retry refused by the budget: "Spend limit reached before the retry", the first call booked, a spend_limit recovery', async () => {
    mocks.callProviderModel.mockResolvedValueOnce(reply('cut', { stopReason: 'length', outputTokens: LIMIT }));
    const guard = vi.fn(async () => 'Account spend limit reached: $10.00 used of $10.00 this week. Resets Monday 00:00 UTC.');
    const error = await callLLM({ ...req, ledger: ledger(guard) }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NonTransientStageError);
    expect((error as Error).message.startsWith('Spend limit reached before the retry')).toBe(true);
    expect((error as Error).message).toContain('Script Generation');
    expect(getStageErrorContext(error)).toMatchObject({ recoveryKind: 'spend_limit' });
    expect(mocks.callProviderModel).toHaveBeenCalledTimes(1);
    expect(failureUsageEvents(error)).toHaveLength(1);
    // The guard was told what this stage call has spent but not booked yet.
    expect(guard).toHaveBeenCalledWith({ purpose: 'script-generation', reason: 'cut-off', unbookedCostUsd: 0.002 });
  });

  it('a transient retry refused by the budget fails with the same message and no sleep', async () => {
    mocks.callProviderModel.mockRejectedValueOnce(overloaded());
    const error = await callLLM({ ...req, ledger: ledger(async () => 'Limit for channel "X" reached') }).catch((e: unknown) => e);
    expect((error as Error).message.startsWith('Spend limit reached before the retry')).toBe(true);
    expect(sleeps).toEqual([]);
    expect(mocks.callProviderModel).toHaveBeenCalledTimes(1);
  });

  it('the structured-output fallback is refused too', async () => {
    mocks.callProviderModel.mockRejectedValueOnce(status(400));
    const error = await callLLM({ ...req, outputSchema: z.object({ a: z.string() }), ledger: ledger(async () => 'over') }).catch((e: unknown) => e);
    expect((error as Error).message.startsWith('Spend limit reached before the retry')).toBe(true);
    expect(mocks.callProviderModel).toHaveBeenCalledTimes(1);
  });

  it('a retryGuard passed instead of a ledger is used the same way', async () => {
    mocks.callProviderModel.mockResolvedValueOnce(reply('cut', { stopReason: 'length', outputTokens: LIMIT }));
    const error = await callLLM({ ...req, retryGuard: async () => 'over' }).catch((e: unknown) => e);
    expect((error as Error).message.startsWith('Spend limit reached before the retry')).toBe(true);
  });

  it('the first call is never checked here: that is the stage gate', async () => {
    mocks.callProviderModel.mockResolvedValueOnce(reply('ok'));
    const guard = vi.fn(async () => 'over');
    await callLLM({ ...req, ledger: ledger(guard) });
    expect(guard).not.toHaveBeenCalled();
  });
});

describe('R5: a refusal is not retried', () => {
  it('names the stop reason, books the call, keeps the evidence', async () => {
    mocks.callProviderModel.mockResolvedValueOnce(reply('', { stopReason: 'content-filter', rawFinishReason: 'refusal', outputTokens: 12, blocks: 'thinking:0,text:0' }));
    const error = await callLLM({ ...req, ledger: ledger() }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NonTransientStageError);
    const message = (error as Error).message;
    expect(message.startsWith('Script Generation: the model declined to answer this request (stop reason: content-filter')).toBe(true);
    expect(message).toContain('finishReason=refusal');
    expect(mocks.callProviderModel).toHaveBeenCalledTimes(1);
    expect(failureUsageEvents(error)).toHaveLength(1);
  });
});

describe('R6: evidence on every call', () => {
  it('a normal reply carries purpose, attempt, limit, tokens, percent, finish reason and blocks', async () => {
    mocks.callProviderModel.mockResolvedValueOnce(reply('{"a":"b"}', { outputTokens: 556, reasoningTokens: 0 }));
    const llm = await callLLM({ ...req, ledger: ledger() });
    expect(llm.evidence).toEqual({
      purpose: 'script-generation',
      model: 'claude-sonnet-5',
      attempt: 1,
      kind: 'first',
      limit: LIMIT,
      outputTokens: 556,
      reasoningTokens: 0,
      percentUsed: 3.5,
      nearMiss: false,
      stopReason: 'stop',
      finishReason: 'end_turn',
      blocks: 'thinking:0,text:1',
      reasoning: 'off',
    });
    expect(llmUsageRows(llm)[0].metadata).toEqual({ llm: llm.evidence });
  });

  it('a forced cut-off yields all of it: the technical line, every usage row, the failed stage output', async () => {
    mocks.callProviderModel
      .mockResolvedValueOnce(reply('', { stopReason: 'length', outputTokens: LIMIT, reasoningTokens: LIMIT - 1, rawFinishReason: 'max_tokens', blocks: 'thinking:1,text:0' }))
      .mockResolvedValueOnce(reply('', { stopReason: 'length', outputTokens: LIMIT * 2, rawFinishReason: 'max_tokens', blocks: 'thinking:0,text:0' }));
    const error = await callLLM({ ...req, ledger: ledger() }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LLMCutOffError);
    const message = (error as Error).message;
    expect(message).toContain(`reasoningTokens=`);
    expect(message).toContain('blocks=thinking:0,text:0');
    expect(message).toContain('finishReason=max_tokens');
    expect(message).toContain(`limit=${LIMIT * 2}`);
    expect(message).toContain('attempts=2');
    const rows = failureUsageEvents(error);
    expect(rows.map((r) => r.metadata)).toEqual([
      { llm: expect.objectContaining({ attempt: 1, kind: 'first', limit: LIMIT, outputTokens: LIMIT, reasoningTokens: LIMIT - 1, percentUsed: 100, nearMiss: true, finishReason: 'max_tokens', blocks: 'thinking:1,text:0' }) },
      { llm: expect.objectContaining({ attempt: 2, kind: 'cut-off-retry', limit: LIMIT * 2, outputTokens: LIMIT * 2, percentUsed: 100, nearMiss: true, reasoning: 'off' }) },
    ]);
    // The failed stage row keeps the evidence and the provider's response metadata (never the prompt).
    const output = failureOutputFromError(error);
    expect(output?.llm).toMatchObject({ calls: [expect.objectContaining({ attempt: 1 }), expect.objectContaining({ attempt: 2 })], providerCalls: 2, responseMeta: { id: 'msg_1' } });
  });

  it('flags and logs a call at 60% of its limit, and only then', async () => {
    mocks.callProviderModel.mockResolvedValueOnce(reply('ok', { outputTokens: Math.ceil(LIMIT * 0.6) }));
    const near = await callLLM({ ...req, ledger: ledger() });
    expect(near.evidence?.nearMiss).toBe(true);
    const logged = (console.warn as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain(`llm.near-miss purpose=script-generation used=${Math.ceil(LIMIT * 0.6)}/${LIMIT}`);

    (console.warn as unknown as ReturnType<typeof vi.fn>).mockClear();
    mocks.callProviderModel.mockResolvedValueOnce(reply('ok', { outputTokens: Math.floor(LIMIT * 0.6) - 1 }));
    const fine = await callLLM({ ...req, ledger: ledger() });
    expect(fine.evidence?.nearMiss).toBe(false);
    expect((console.warn as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0])).join('\n')).not.toContain('near-miss');
  });

  it('a cut-off then success: each usage row carries its own call, the retry is attempt 2 at the doubled limit', async () => {
    mocks.callProviderModel
      .mockResolvedValueOnce(reply('cut', { stopReason: 'length', outputTokens: LIMIT, rawFinishReason: 'max_tokens' }))
      .mockResolvedValueOnce(reply('{"a":"b"}', { outputTokens: 900 }));
    const llm = await callLLM({ ...req, ledger: ledger() });
    const metas = llmUsageRows(llm).map((r) => (r.metadata as { llm: { attempt: number; limit: number; kind: string } }).llm);
    expect(metas.map((m) => [m.attempt, m.limit, m.kind])).toEqual([[1, LIMIT, 'first'], [2, LIMIT * 2, 'cut-off-retry']]);
  });
});
