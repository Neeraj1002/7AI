import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ callLLM: vi.fn() }));
vi.mock('../../llm', async (orig) => ({ ...(await orig<object>()), callLLM: mocks.callLLM }));

import { generateScript } from './index';
import { LLMCutOffError } from '../../llm';
import { getStageErrorContext, NonTransientStageError, TransientStageError } from '../../run-pipeline/retry-with-backoff';
import { failureUsageEvents } from '../../run-pipeline/stage-failure';

const reply = (text: string, extra: Record<string, unknown> = {}) => ({
  text,
  usage: { inputTokens: 100, outputTokens: 50 },
  stopReason: 'stop',
  costUsd: '0.001000',
  provider: 'anthropic',
  model: 'claude-sonnet-5',
  maxOutputTokens: 16000,
  ...extra,
});
// What callLLM throws after a reply is cut off twice: the last reply on the error, the first call under priorAttempts.
const cutOff = (text: string) => {
  const first = { provider: 'anthropic' as const, model: 'claude-sonnet-5', usage: { inputTokens: 100, outputTokens: 16000 }, costUsd: '0.001000', stopReason: 'length', maxOutputTokens: 16000, replyLength: 0 };
  const last = reply(text, { stopReason: 'length', usage: { inputTokens: 100, outputTokens: 32000 }, maxOutputTokens: 32000, priorAttempts: [first] });
  const row = (c: { usage: { inputTokens: number; outputTokens: number }; costUsd: string }) => ({ provider: 'anthropic', model: 'claude-sonnet-5', inputTokens: c.usage.inputTokens, outputTokens: c.usage.outputTokens, costUsd: c.costUsd });
  return new LLMCutOffError('Script Generation: cut off', { calls: [row(first), row(last)], rawReply: text, stopReason: 'length', replyLength: text.length }, last as never);
};
const GOOD = '{"scriptText":"Hello there.","captions":"Hello there.","hashtags":["a","b"]}';
const params = { topic: 't', constraints: [] as string[] };
const QUOTE_BUG = '{"scriptText":"He said "no" to salt. ' + 'x'.repeat(500) + '","captions":"c","hashtags":[]}';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('generateScript — first call', () => {
  it('parses a clean reply with one call', async () => {
    mocks.callLLM.mockResolvedValueOnce(reply(GOOD));
    const { output, calls } = await generateScript(params);
    expect(output.scriptText).toBe('Hello there.');
    expect(calls).toHaveLength(1);
    expect(mocks.callLLM).toHaveBeenCalledTimes(1);
    // The limit belongs to the registry: the agent passes no number.
    expect(mocks.callLLM.mock.calls[0][0]).not.toHaveProperty('maxTokens');
  });
});

describe('generateScript — Bugs Task 11 R5 mechanical repair needs no retry', () => {
  it('raw newlines inside scriptText are repaired on the first call', async () => {
    mocks.callLLM.mockResolvedValueOnce(
      reply('{"scriptText":"Line one.\nLine two.\tTabbed.","captions":"c","hashtags":[]}'),
    );
    const { output, calls } = await generateScript(params);
    expect(output.scriptText).toBe('Line one.\nLine two.\tTabbed.');
    expect(calls).toHaveLength(1);
  });

  it('a code-fenced reply with prose around it is parsed on the first call', async () => {
    mocks.callLLM.mockResolvedValueOnce(reply('Here you go:\n```json\n' + GOOD + '\n```\nEnjoy.'));
    const { calls } = await generateScript(params);
    expect(calls).toHaveLength(1);
  });
});

describe('generateScript — Bugs Task 11 R5 fallback retry', () => {
  it('an unescaped quote fails the first call, the parse error is fed back, and the corrected reply is used', async () => {
    mocks.callLLM.mockResolvedValueOnce(reply(QUOTE_BUG)).mockResolvedValueOnce(reply(GOOD, { costUsd: '0.002000' }));
    const { output, calls, llm } = await generateScript(params);
    expect(output.scriptText).toBe('Hello there.');
    expect(mocks.callLLM).toHaveBeenCalledTimes(2);
    expect(calls).toHaveLength(2);
    expect(llm.costUsd).toBe('0.002000');
    const retry = mocks.callLLM.mock.calls[1][0];
    expect(retry).not.toHaveProperty('maxTokens');
    expect(retry.messages).toHaveLength(3);
    expect(retry.messages[1]).toEqual({ role: 'assistant', content: QUOTE_BUG });
    expect(retry.messages[2].content).toMatch(/could not be parsed as JSON \(.*position \d+/);
  });

  it('a schema failure is retried with the validation message fed back', async () => {
    mocks.callLLM.mockResolvedValueOnce(reply('{"scriptText":""}')).mockResolvedValueOnce(reply(GOOD));
    await generateScript(params);
    expect(mocks.callLLM.mock.calls[1][0].messages[2].content).toContain('did not match the required shape');
  });

  it('a reply cut off even after the client retry fails the stage with the cut-off text, is not retried here, and books both calls', async () => {
    mocks.callLLM.mockRejectedValueOnce(cutOff('{"scriptText":"cut off mid'));
    const error = await generateScript(params).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NonTransientStageError);
    expect((error as Error).message).toContain('cut off');
    expect((error as Error).message).not.toContain('valid JSON');
    expect(mocks.callLLM).toHaveBeenCalledTimes(1);
    const context = getStageErrorContext(error)!;
    expect(context.rawReply).toBe('{"scriptText":"cut off mid');
    expect(context.stopReason).toBe('length');
    // both billed calls are booked as their own usage rows
    expect(failureUsageEvents(error)).toEqual([
      expect.objectContaining({ outputTokens: 16000 }),
      expect.objectContaining({ outputTokens: 32000 }),
    ]);
  });

  it('the request carries no output limit, and the prompt tells the model to use curly quotes', async () => {
    mocks.callLLM.mockResolvedValueOnce(reply(GOOD));
    await generateScript(params);
    const request = mocks.callLLM.mock.calls[0][0];
    expect(request).not.toHaveProperty('maxTokens');
    expect(request.system).toContain('Never use the straight double-quote character');
    expect(request.system).toContain('curly quotes');
  });

  it('fails with the non-transient error only after the second call also fails, and never makes a third', async () => {
    mocks.callLLM.mockResolvedValueOnce(reply(QUOTE_BUG)).mockResolvedValueOnce(reply('still not json'));
    const error = await generateScript(params).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NonTransientStageError);
    expect(mocks.callLLM).toHaveBeenCalledTimes(2);
    const message = (error as Error).message;
    expect(message).toContain('did not return valid JSON');
    expect(message).toContain('Retried once after');
    const context = getStageErrorContext(error)!;
    expect(context.attempts).toBe(2);
    expect(context.rawReply).toBe('still not json');
    expect(context.firstRawReply).toBe(QUOTE_BUG);
    // both calls are listed so each is booked as spend
    expect(failureUsageEvents(error)).toHaveLength(2);
    expect(failureUsageEvents(error)[0]).toMatchObject({ provider: 'anthropic', inputTokens: 100, outputTokens: 50, costUsd: '0.001000' });
  });

  it('a provider error on the retry call keeps the first call in the error so its spend is still booked', async () => {
    mocks.callLLM
      .mockResolvedValueOnce(reply(QUOTE_BUG))
      .mockRejectedValueOnce(new TransientStageError('overloaded', undefined, { provider: 'anthropic', model: 'claude-sonnet-5' }));
    const error = await generateScript(params).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TransientStageError);
    expect((error as Error).message).toBe('overloaded');
    expect(failureUsageEvents(error)).toHaveLength(1);
  });

  it('a provider error on the first call is passed through untouched', async () => {
    const original = new NonTransientStageError('bad key', undefined, { provider: 'anthropic', model: 'm' });
    mocks.callLLM.mockRejectedValueOnce(original);
    const error = await generateScript(params).catch((e: unknown) => e);
    expect(error).toBe(original);
    expect(mocks.callLLM).toHaveBeenCalledTimes(1);
  });
});

describe('generateScript — Bugs Task 11 R1 diagnostics', () => {
  it('the final error carries the parser message with position, stopReason, length and the raw reply', async () => {
    mocks.callLLM.mockResolvedValue(reply(QUOTE_BUG));
    const error = await generateScript(params).catch((e: unknown) => e);
    const message = (error as Error).message;
    expect(message).toContain('stopReason=stop');
    expect(message).toContain(`replyLength=${QUOTE_BUG.length}`);
    expect(message).toMatch(/position \d+/);
    const context = getStageErrorContext(error)!;
    expect(context.rawReply).toBe(QUOTE_BUG);
    expect(context.stopReason).toBe('stop');
    expect(context.replyLength).toBe(QUOTE_BUG.length);
    expect(typeof context.parseError).toBe('string');
  });

  it('logs the first and last 300 characters of an unusable reply', async () => {
    const bad = 'A'.repeat(300) + 'MIDDLE'.repeat(100) + 'Z'.repeat(300) + ' not json';
    mocks.callLLM.mockResolvedValue(reply(bad));
    await generateScript(params).catch(() => undefined);
    const logged = (console.error as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('A'.repeat(300));
    expect(logged).toContain('Z'.repeat(290));
    expect(logged).not.toContain('MIDDLE'.repeat(100));
  });
});
