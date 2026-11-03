import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

const mocks = vi.hoisted(() => ({ callProviderModel: vi.fn() }));
vi.mock('./client', () => ({ callProviderModel: mocks.callProviderModel }));

import { callLLMJson, JSON_RAW_REPLY_CAP } from './json';
import { CallLedger } from './failure-policy';
import { llmUsageRows } from '../run-pipeline/stage-failure';
import { getStageErrorContext } from '../run-pipeline/retry-with-backoff';

const reply = (text: string) => ({ text, usage: { inputTokens: 1000, outputTokens: 50 }, stopReason: 'stop', costUsd: '0.002000' });
const schema = z.object({ verdict: z.enum(['pass', 'fail']), notes: z.string().min(1) });
const req = {
  purpose: 'video-intelligence-own-draft' as const,
  system: 's',
  messages: [{ role: 'user' as const, content: 'review', attachments: [{ mediaType: 'image/jpeg', dataBase64: 'AAAA' }] }],
  schema,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('callLLMJson', () => {
  it('valid reply: one call, value parsed, schema sent to the provider', async () => {
    mocks.callProviderModel.mockResolvedValueOnce(reply('{"verdict":"pass","notes":"ok"}'));
    const result = await callLLMJson(req);
    expect(result).toMatchObject({ ok: true, value: { verdict: 'pass', notes: 'ok' }, failures: [] });
    expect(mocks.callProviderModel).toHaveBeenCalledTimes(1);
    expect(mocks.callProviderModel.mock.calls[0][0].outputSchema).toBe(schema);
    expect(result.calls.flatMap(llmUsageRows)).toHaveLength(1);
  });

  it('bad then valid: one re-ask that keeps the attachments and names the problem; both calls are booked', async () => {
    mocks.callProviderModel
      .mockResolvedValueOnce(reply('{"verdict":"pass","notes":'))
      .mockResolvedValueOnce(reply('{"verdict":"fail","notes":"blurry"}'));
    const result = await callLLMJson(req);
    expect(result).toMatchObject({ ok: true, value: { verdict: 'fail', notes: 'blurry' } });
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatchObject({ attempt: 1, rawReply: '{"verdict":"pass","notes":' });
    expect(mocks.callProviderModel).toHaveBeenCalledTimes(2);
    const second = mocks.callProviderModel.mock.calls[1][0].messages;
    expect(second).toHaveLength(3);
    expect(second[0].attachments).toHaveLength(1);
    expect(second[1]).toMatchObject({ role: 'assistant' });
    expect(second[2].content).toContain('could not be parsed as JSON');
    expect(result.calls.flatMap(llmUsageRows)).toHaveLength(2);
  });

  it('valid JSON of the wrong shape is also re-asked', async () => {
    mocks.callProviderModel
      .mockResolvedValueOnce(reply('{"verdict":"maybe","notes":"x"}'))
      .mockResolvedValueOnce(reply('{"verdict":"pass","notes":"x"}'));
    const result = await callLLMJson(req);
    expect(result.ok).toBe(true);
    expect(mocks.callProviderModel.mock.calls[1][0].messages[2].content).toContain('did not match the required shape');
  });

  it('bad twice: no throw, ok false, exactly two calls, capped raw reply of the last attempt kept for both', async () => {
    const long = '{"verdict":' + 'x'.repeat(JSON_RAW_REPLY_CAP + 500);
    mocks.callProviderModel.mockResolvedValueOnce(reply('nope')).mockResolvedValueOnce(reply(long));
    const result = await callLLMJson(req);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(mocks.callProviderModel).toHaveBeenCalledTimes(2);
    expect(result.rawReply).toHaveLength(JSON_RAW_REPLY_CAP);
    expect(result.failures.map((f) => f.rawReply.length)).toEqual([4, JSON_RAW_REPLY_CAP]);
    expect(result.failures[1].rawReplyTruncated).toBe(true);
    expect(result.calls.flatMap(llmUsageRows)).toHaveLength(2);
  });

  it('a refused budget throws a spend-limit error that still carries the billed first call; no second call', async () => {
    mocks.callProviderModel.mockResolvedValueOnce(reply('nope'));
    const guard = vi.fn().mockResolvedValue('Run budget is used up.');
    const error = await callLLMJson({ ...req, retryGuard: guard }).catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(guard).toHaveBeenCalledWith(expect.objectContaining({ reason: 'bad-json', unbookedCostUsd: 0.002 }));
    expect(mocks.callProviderModel).toHaveBeenCalledTimes(1);
    expect(getStageErrorContext(error)?.calls).toHaveLength(1);
    expect(getStageErrorContext(error)?.rawReply).toBe('nope');
  });

  it('an exhausted ledger ceiling returns ok false without a second call', async () => {
    mocks.callProviderModel.mockResolvedValueOnce(reply('nope'));
    const result = await callLLMJson({ ...req, ledger: new CallLedger({ maxExtraCalls: 0 }) });
    expect(result.ok).toBe(false);
    expect(mocks.callProviderModel).toHaveBeenCalledTimes(1);
  });

  it('a provider error on the re-ask keeps the first call billed on the error', async () => {
    const { NonTransientStageError } = await import('../run-pipeline/retry-with-backoff');
    mocks.callProviderModel.mockResolvedValueOnce(reply('nope')).mockRejectedValueOnce(new NonTransientStageError('boom'));
    const error = await callLLMJson(req).catch((e) => e);
    expect(getStageErrorContext(error)?.calls).toHaveLength(1);
  });
});
