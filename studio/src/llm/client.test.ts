import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

const mocks = vi.hoisted(() => ({ generateText: vi.fn(), streamText: vi.fn() }));
vi.mock('ai', async (orig) => ({ ...(await orig<object>()), generateText: mocks.generateText, streamText: mocks.streamText }));
vi.mock('../config/env', () => ({ env: { ANTHROPIC_API_KEY: 'test-key' } }));

import { APICallError, NoObjectGeneratedError } from 'ai';
import { getStageErrorContext, TransientStageError } from '../run-pipeline/retry-with-backoff';
import { callProviderModel, rewriteThinkingBody } from './client';

const schema = z.object({ scriptText: z.string().min(1) });
const base = {
  provider: 'anthropic' as const,
  model: 'claude-sonnet-5',
  system: 's',
  messages: [{ role: 'user' as const, content: 'hi' }],
  maxOutputTokens: 100,
  reasoning: 'off' as const,
};
const ok = (text: string) => ({ text, finishReason: 'stop', usage: { inputTokens: 10, outputTokens: 5 } });

beforeEach(() => vi.clearAllMocks());

describe('callProviderModel with an output schema (Bugs Task 11)', () => {
  it('sends no structured output when no schema is given (unchanged behaviour)', async () => {
    mocks.generateText.mockResolvedValue(ok('plain'));
    await callProviderModel(base);
    expect(mocks.generateText.mock.calls[0][0]).not.toHaveProperty('output');
  });

  it('asks the provider for schema-constrained output when a schema is given', async () => {
    mocks.generateText.mockResolvedValue(ok('{"scriptText":"x"}'));
    const result = await callProviderModel({ ...base, outputSchema: schema });
    expect(mocks.generateText.mock.calls[0][0]).toHaveProperty('output');
    expect(result.text).toBe('{"scriptText":"x"}');
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
  });

  it('returns a reply the SDK could not turn into the object as ordinary text, with its real usage', async () => {
    mocks.generateText.mockRejectedValue(
      new NoObjectGeneratedError({
        message: 'No object generated',
        text: '{"scriptText":"cut off',
        response: { id: 'r', timestamp: new Date(), modelId: 'm' },
        usage: { inputTokens: 1000, outputTokens: 2048 } as never,
        finishReason: 'length',
      }),
    );
    const result = await callProviderModel({ ...base, outputSchema: schema });
    expect(result.text).toBe('{"scriptText":"cut off');
    expect(result.stopReason).toBe('length');
    expect(result.usage).toEqual({ inputTokens: 1000, outputTokens: 2048 });
    expect(Number(result.costUsd)).toBeGreaterThan(0);
  });

  it('does not swallow that error when no schema was requested', async () => {
    mocks.generateText.mockRejectedValue(
      new NoObjectGeneratedError({
        message: 'No object generated',
        text: 'x',
        response: { id: 'r', timestamp: new Date(), modelId: 'm' },
        usage: { inputTokens: 1, outputTokens: 1 } as never,
        finishReason: 'stop',
      }),
    );
    await expect(callProviderModel(base)).rejects.toThrow();
  });
});

// LLM Registry task (R1/R2): the reasoning setting is always sent explicitly, the reasoning tokens are read
// back, and a large retry limit streams.
describe('callProviderModel: reasoning setting, reasoning tokens, streaming', () => {
  it('sends thinking disabled explicitly for reasoning off, on a model that reasons by default', async () => {
    mocks.generateText.mockResolvedValue(ok('plain'));
    await callProviderModel(base);
    expect(mocks.generateText.mock.calls[0][0]).toMatchObject({
      maxOutputTokens: 100,
      maxRetries: 0,
      providerOptions: { anthropic: { thinking: { type: 'disabled' } } },
    });
  });

  it('sends an explicit budget on a model that takes one', async () => {
    mocks.generateText.mockResolvedValue(ok('plain'));
    await callProviderModel({ ...base, model: 'claude-haiku-4-5', maxOutputTokens: 9000, reasoning: { budgetTokens: 4000 } });
    expect(mocks.generateText.mock.calls[0][0].providerOptions).toEqual({ anthropic: { thinking: { type: 'enabled', budgetTokens: 4000 } } });
  });

  it('refuses a manual budget on a model that reasons adaptively, before any call', async () => {
    await expect(callProviderModel({ ...base, reasoning: { budgetTokens: 4000 } })).rejects.toThrow(/rejects a manual reasoning budget/);
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it('sends reasoning off as disabled for a model that takes disabled, and rewrites it to between_tools on the wire for Sonnet 5.5', () => {
    const body = (model: string) => JSON.stringify({ model, max_tokens: 100, thinking: { type: 'disabled' } });
    expect(rewriteThinkingBody(body('claude-sonnet-5'))).toBe(body('claude-sonnet-5'));
    expect(rewriteThinkingBody(body('claude-haiku-4-5'))).toBe(body('claude-haiku-4-5'));
    expect(JSON.parse(rewriteThinkingBody(body('claude-sonnet-5-5')) as string)).toEqual({ model: 'claude-sonnet-5-5', max_tokens: 100, thinking: { type: 'between_tools' } });
    // anything else passes through untouched
    expect(rewriteThinkingBody('not json')).toBe('not json');
    expect(rewriteThinkingBody(undefined)).toBeUndefined();
    const adaptive = JSON.stringify({ model: 'claude-sonnet-5-5', thinking: { type: 'adaptive' } });
    expect(rewriteThinkingBody(adaptive)).toBe(adaptive);
  });

  it('reads the reasoning tokens from the usage details', async () => {
    mocks.generateText.mockResolvedValue({ text: '', finishReason: 'length', usage: { inputTokens: 10, outputTokens: 100, outputTokenDetails: { reasoningTokens: 100 } } });
    const result = await callProviderModel(base);
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 100, reasoningTokens: 100 });
    expect(result.stopReason).toBe('length');
  });

  it('streams when asked, and returns the same shape', async () => {
    mocks.streamText.mockReturnValue({
      text: Promise.resolve('streamed'),
      usage: Promise.resolve({ inputTokens: 5, outputTokens: 7 }),
      finishReason: Promise.resolve('stop'),
      finalStep: Promise.resolve({
        rawFinishReason: 'end_turn',
        content: [{ type: 'text', text: 'streamed' }],
        response: { id: 'msg_1', modelId: 'claude-sonnet-5', timestamp: new Date('2026-10-19T00:00:00Z'), headers: { 'request-id': 'req_9', cookie: 'secret' } },
        providerMetadata: { anthropic: { cacheCreationInputTokens: 0 } },
      }),
    });
    const result = await callProviderModel({ ...base, maxOutputTokens: 32000, stream: true });
    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(mocks.streamText.mock.calls[0][0]).toMatchObject({ maxOutputTokens: 32000, providerOptions: { anthropic: { thinking: { type: 'disabled' } } } });
    expect(result).toMatchObject({ text: 'streamed', usage: { inputTokens: 5, outputTokens: 7 }, stopReason: 'stop', rawFinishReason: 'end_turn', blocks: 'thinking:0,text:1' });
    // Response metadata for a failed call: ids and a few headers, never the whole header set.
    expect(result.responseMeta).toMatchObject({ id: 'msg_1', modelId: 'claude-sonnet-5', headers: { 'request-id': 'req_9' }, providerMetadata: { anthropic: { cacheCreationInputTokens: 0 } } });
    expect(JSON.stringify(result.responseMeta)).not.toContain('secret');
  });

  it('R6: reports the raw finish reason and the reply part kinds (an empty reply that was all reasoning)', async () => {
    mocks.generateText.mockResolvedValue({
      text: '',
      finishReason: 'length',
      rawFinishReason: 'max_tokens',
      content: [{ type: 'reasoning', text: 'hmm' }],
      response: { id: 'msg_2', modelId: 'claude-sonnet-5', timestamp: new Date('2026-10-19T00:00:00Z'), headers: {} },
      usage: { inputTokens: 10, outputTokens: 100, outputTokenDetails: { reasoningTokens: 100 } },
    });
    const result = await callProviderModel(base);
    expect(result).toMatchObject({ rawFinishReason: 'max_tokens', blocks: 'thinking:1,text:0' });
  });

  it('R6: a structured reply the SDK could not parse still reports what can be known', async () => {
    mocks.generateText.mockRejectedValue(
      new NoObjectGeneratedError({
        message: 'No object generated',
        text: '',
        response: { id: 'r', timestamp: new Date(), modelId: 'm' },
        usage: { inputTokens: 10, outputTokens: 100, outputTokenDetails: { reasoningTokens: 100 } } as never,
        finishReason: 'length',
      }),
    );
    const result = await callProviderModel({ ...base, outputSchema: schema });
    expect(result.blocks).toBe('thinking:1,text:0');
    expect(result.rawFinishReason).toBeNull();
  });

  it('a stream that errors surfaces the provider error, not a generic one', async () => {
    mocks.streamText.mockImplementation((options: { onError: (event: { error: unknown }) => void }) => {
      const providerError = new APICallError({ message: 'HTTP 529', url: 'https://api.example.test', requestBodyValues: {}, statusCode: 529 });
      options.onError({ error: providerError });
      const failed = Promise.reject(new Error('No output generated'));
      failed.catch(() => undefined);
      return { text: failed, usage: failed, finishReason: failed };
    });
    const error = await callProviderModel({ ...base, stream: true }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TransientStageError);
    expect(getStageErrorContext(error)).toMatchObject({ statusCode: 529 });
  });
});
