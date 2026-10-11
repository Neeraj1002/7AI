import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

const mocks = vi.hoisted(() => ({ generateText: vi.fn() }));
vi.mock('ai', async (orig) => ({ ...(await orig<object>()), generateText: mocks.generateText }));
vi.mock('../config/env', () => ({ env: { ANTHROPIC_API_KEY: 'test-key' } }));

import { APICallError } from 'ai';
import { callProviderModel } from './client';
import { getStageErrorContext, NonTransientStageError, TransientStageError } from '../run-pipeline/retry-with-backoff';

const base = {
  provider: 'anthropic' as const,
  model: 'claude-sonnet-5',
  system: 's',
  messages: [{ role: 'user' as const, content: 'hi' }],
  maxTokens: 100,
  outputSchema: z.object({ a: z.string() }),
};
const apiError = (statusCode: number) =>
  new APICallError({ message: `HTTP ${statusCode}`, url: 'https://api.example.test', requestBodyValues: {}, statusCode });

beforeEach(() => vi.clearAllMocks());

describe('callProviderModel attaches the HTTP status to the error context (Bugs Task 11 R3)', () => {
  it('a 429 is a transient error carrying statusCode 429', async () => {
    mocks.generateText.mockRejectedValue(apiError(429));
    const error = await callProviderModel(base).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TransientStageError);
    expect(getStageErrorContext(error)).toMatchObject({ statusCode: 429 });
  });

  it.each([400, 422])('a %i is a non-transient error carrying statusCode', async (status) => {
    mocks.generateText.mockRejectedValue(apiError(status));
    const error = await callProviderModel(base).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NonTransientStageError);
    expect(getStageErrorContext(error)).toMatchObject({ provider: 'anthropic', model: 'claude-sonnet-5', statusCode: status });
  });

  it('a 500 is a transient error carrying statusCode 500', async () => {
    mocks.generateText.mockRejectedValue(apiError(500));
    const error = await callProviderModel(base).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TransientStageError);
    expect(getStageErrorContext(error)).toMatchObject({ statusCode: 500 });
  });

  it('an error that is not an API error carries no statusCode', async () => {
    mocks.generateText.mockRejectedValue(new Error('socket hang up'));
    const error = await callProviderModel(base).catch((e: unknown) => e);
    expect(getStageErrorContext(error)).not.toHaveProperty('statusCode');
  });
});
