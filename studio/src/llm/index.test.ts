import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

const mocks = vi.hoisted(() => ({ callProviderModel: vi.fn() }));
vi.mock('./client', () => ({ callProviderModel: mocks.callProviderModel }));

import { callLLM, LLMCutOffError, RETRY_OUTPUT_TOKEN_CEILING } from './index';
import { failureUsageEvents, llmUsageRows } from '../run-pipeline/stage-failure';
import { getStageErrorContext, NonTransientStageError } from '../run-pipeline/retry-with-backoff';
import { LLM_REGISTRY } from './registry';

const result = (text: string, extra: { stopReason?: string; outputTokens?: number; reasoningTokens?: number } = {}) => ({
  text,
  usage: {
    inputTokens: 1000,
    outputTokens: extra.outputTokens ?? 300,
    ...(extra.reasoningTokens !== undefined ? { reasoningTokens: extra.reasoningTokens } : {}),
  },
  stopReason: extra.stopReason ?? 'stop',
  costUsd: '0.002000',
});
const req = { purpose: 'script-generation' as const, system: 's', messages: [{ role: 'user' as const, content: 'hi' }] };
const LIMIT = LLM_REGISTRY['script-generation'].maxOutputTokens;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('callLLM: the registry owns the limit and the reasoning setting', () => {
  it('sends the registry limit, reasoning off, no streaming, and returns a normal reply untouched', async () => {
    mocks.callProviderModel.mockResolvedValueOnce(result('{"a":"b"}'));
    const llm = await callLLM(req);
    expect(mocks.callProviderModel).toHaveBeenCalledTimes(1);
    expect(mocks.callProviderModel.mock.calls[0][0]).toMatchObject({ model: 'claude-sonnet-5-5', maxOutputTokens: LIMIT, reasoning: 'off', stream: false });
    expect(llm.maxOutputTokens).toBe(LIMIT);
    expect(llm.priorAttempts).toEqual([]);
    expect(llm.text).toBe('{"a":"b"}');
  });

  it('passes the output schema through', async () => {
    const outputSchema = z.object({ a: z.string() });
    mocks.callProviderModel.mockResolvedValueOnce(result('{"a":"b"}'));
    await callLLM({ ...req, outputSchema });
    expect(mocks.callProviderModel.mock.calls[0][0].outputSchema).toBe(outputSchema);
  });
});

describe('callLLM: one automatic retry on a cut-off', () => {
  it('cut off with text, then complete: the retry has the limit doubled, reasoning off and streams; both calls are booked', async () => {
    mocks.callProviderModel
      .mockResolvedValueOnce(result('{"scriptText":"cut', { stopReason: 'length', outputTokens: LIMIT }))
      .mockResolvedValueOnce(result('{"a":"b"}', { outputTokens: 900 }));
    const llm = await callLLM(req);
    expect(mocks.callProviderModel).toHaveBeenCalledTimes(2);
    expect(mocks.callProviderModel.mock.calls[1][0]).toMatchObject({ maxOutputTokens: LIMIT * 2, reasoning: 'off', stream: true });
    expect(llm.text).toBe('{"a":"b"}');
    expect(llm.stopReason).toBe('stop');
    expect(llm.maxOutputTokens).toBe(LIMIT * 2);
    expect(llm.priorAttempts).toHaveLength(1);
    expect(llm.priorAttempts![0]).toMatchObject({ stopReason: 'length', maxOutputTokens: LIMIT, usage: { outputTokens: LIMIT } });
    expect(llmUsageRows(llm).map((row) => row.outputTokens)).toEqual([LIMIT, 900]);
  });

  it('an empty reply that spent its whole budget on reasoning recovers on the retry', async () => {
    mocks.callProviderModel
      .mockResolvedValueOnce(result('', { stopReason: 'length', outputTokens: LIMIT, reasoningTokens: LIMIT }))
      .mockResolvedValueOnce(result('{"a":"b"}'));
    const llm = await callLLM(req);
    expect(llm.text).toBe('{"a":"b"}');
    expect(llm.priorAttempts![0].usage.reasoningTokens).toBe(LIMIT);
  });

  it('a structured call that came back unknown with the whole limit spent counts as a cut-off', async () => {
    mocks.callProviderModel
      .mockResolvedValueOnce(result('{"scenes":[', { stopReason: 'unknown', outputTokens: LIMIT }))
      .mockResolvedValueOnce(result('{"a":"b"}'));
    const llm = await callLLM(req);
    expect(mocks.callProviderModel).toHaveBeenCalledTimes(2);
    expect(llm.priorAttempts).toHaveLength(1);
    expect(llm.priorAttempts![0].stopReason).toBe('length');
  });

  it('an unknown stop reason below the limit is not a cut-off', async () => {
    mocks.callProviderModel.mockResolvedValueOnce(result('x', { stopReason: 'unknown', outputTokens: 10 }));
    const llm = await callLLM(req);
    expect(mocks.callProviderModel).toHaveBeenCalledTimes(1);
    expect(llm.stopReason).toBe('unknown');
  });

  it('never asks for more than the ceiling on the retry', async () => {
    expect(RETRY_OUTPUT_TOKEN_CEILING).toBe(32_000);
    mocks.callProviderModel
      .mockResolvedValueOnce(result('x', { stopReason: 'length', outputTokens: LIMIT }))
      .mockResolvedValueOnce(result('y'));
    await callLLM({ ...req, purpose: 'script-review' });
    expect(mocks.callProviderModel.mock.calls[1][0].maxOutputTokens).toBeLessThanOrEqual(32_000);
  });

  it('cut off twice with text: fails with the "even after one automatic retry" message and books both calls', async () => {
    mocks.callProviderModel
      .mockResolvedValueOnce(result('{"scriptText":"cut', { stopReason: 'length', outputTokens: LIMIT }))
      .mockResolvedValueOnce(result('{"scriptText":"cut again', { stopReason: 'length', outputTokens: LIMIT * 2 }));
    const error = await callLLM(req).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LLMCutOffError);
    expect(error).toBeInstanceOf(NonTransientStageError);
    const message = (error as Error).message;
    expect(
      message.startsWith(
        'Script Generation: the reply was cut off even after one automatic retry with a larger limit. Press Retry this step; if it repeats, send the debug bundle.',
      ),
    ).toBe(true);
    expect(message).toContain(`maxTokens=${LIMIT * 2}`);
    expect(message).toContain('attempts=2');
    expect(message).not.toMatch(/shorten the brief|lower the target length/);
    expect(mocks.callProviderModel).toHaveBeenCalledTimes(2);
    expect(failureUsageEvents(error).map((row) => row.outputTokens)).toEqual([LIMIT, LIMIT * 2]);
    expect(getStageErrorContext(error)).toMatchObject({ rawReply: '{"scriptText":"cut again', stopReason: 'length', attempts: 2 });
    expect((error as LLMCutOffError).response.priorAttempts).toHaveLength(1);
  });

  it('cut off twice with an empty reply: fails with the "whole output budget" message that does not blame the brief', async () => {
    mocks.callProviderModel
      .mockResolvedValueOnce(result('', { stopReason: 'length', outputTokens: LIMIT, reasoningTokens: LIMIT }))
      .mockResolvedValueOnce(result('', { stopReason: 'length', outputTokens: LIMIT * 2 }));
    const error = await callLLM(req).catch((e: unknown) => e);
    const message = (error as Error).message;
    expect(
      message.startsWith(
        'Script Generation: the model used its whole output budget without writing an answer, twice. Your brief is not the problem. Press Retry this step; if it repeats, send the debug bundle.',
      ),
    ).toBe(true);
    expect(message).toContain('replyLength=0');
    expect(message).not.toMatch(/shorten the brief|lower the target length/);
  });

  it('the stage name in the message comes from the registry', async () => {
    mocks.callProviderModel.mockResolvedValue(result('x', { stopReason: 'length', outputTokens: 4000 }));
    const error = await callLLM({ ...req, purpose: 'video-production-planning' }).catch((e: unknown) => e);
    expect((error as Error).message.startsWith('Video Planning: ')).toBe(true);
  });

  it('a provider error on the retry keeps the first call booked (a non-retryable one, so nothing else is tried)', async () => {
    mocks.callProviderModel
      .mockResolvedValueOnce(result('x', { stopReason: 'length', outputTokens: LIMIT }))
      .mockRejectedValueOnce(new NonTransientStageError('unauthorized', undefined, { provider: 'anthropic', model: 'claude-sonnet-5', statusCode: 401 }));
    const error = await callLLM(req).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NonTransientStageError);
    expect(getStageErrorContext(error)).toMatchObject({ statusCode: 401 });
    expect(failureUsageEvents(error)).toEqual([expect.objectContaining({ outputTokens: LIMIT, costUsd: '0.002000' })]);
  });

  it('a provider error on the first call makes no retry', async () => {
    const failure = new NonTransientStageError('bad request', undefined, { statusCode: 403 });
    mocks.callProviderModel.mockRejectedValueOnce(failure);
    const error = await callLLM(req).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NonTransientStageError);
    expect((error as Error).message).toBe('bad request');
    expect(mocks.callProviderModel).toHaveBeenCalledTimes(1);
  });
});
