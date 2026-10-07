import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

const mocks = vi.hoisted(() => ({ generateText: vi.fn() }));
vi.mock('ai', async (orig) => ({ ...(await orig<object>()), generateText: mocks.generateText }));
vi.mock('../config/env', () => ({ env: { ANTHROPIC_API_KEY: 'test-key' } }));

import { NoObjectGeneratedError } from 'ai';
import { callProviderModel } from './client';

const schema = z.object({ scriptText: z.string().min(1) });
const base = {
  provider: 'anthropic' as const,
  model: 'claude-sonnet-5',
  system: 's',
  messages: [{ role: 'user' as const, content: 'hi' }],
  maxTokens: 100,
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
