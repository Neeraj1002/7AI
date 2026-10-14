import { describe, it, expect, vi, beforeEach } from 'vitest';

// Sprint 2 Task 2 (E1) — mocked-client test, same rigor as media/client.test.ts's
// TTS-voice test: asserts the exact object passed to the real OpenAI SDK
// call, not just that this module's own wrapper returns without throwing.

const imagesGenerateMock = vi.fn();

vi.mock('openai', () => {
  class MockAPIError extends Error {}
  class MockOpenAI {
    images = { generate: imagesGenerateMock };
  }
  return { default: Object.assign(MockOpenAI, { APIError: MockAPIError }) };
});

import OpenAI from 'openai';
import { generateStillsViaProvider, rateLimitWaitMs } from './client';

describe('generateStillsViaProvider (Sprint 2 Task 2, E1)', () => {
  beforeEach(() => {
    imagesGenerateMock.mockReset();
    imagesGenerateMock.mockResolvedValue({ data: [{ b64_json: Buffer.from('fake png bytes').toString('base64') }] });
  });

  it('issues one real request per scene prompt, each carrying that exact prompt', async () => {
    await generateStillsViaProvider({
      scenePrompts: ['a lighthouse at dawn', 'a lighthouse at dusk'],
      model: 'gpt-image-1.5',
    });
    expect(imagesGenerateMock).toHaveBeenCalledTimes(2);
    expect(imagesGenerateMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ model: 'gpt-image-1.5', prompt: 'a lighthouse at dawn', n: 1 }),
    );
    expect(imagesGenerateMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ model: 'gpt-image-1.5', prompt: 'a lighthouse at dusk', n: 1 }),
    );
  });

  it('returns one image path per scene prompt, in order, with a real aggregated cost', async () => {
    const result = await generateStillsViaProvider({
      scenePrompts: ['scene one', 'scene two', 'scene three'],
      model: 'gpt-image-1.5',
    });
    expect(result.imagePaths).toHaveLength(3);
    expect(Number(result.costUsd)).toBeCloseTo(0.013 * 3, 6);
  });

  it('throws a NonTransientStageError if a response carries no usable image data', async () => {
    imagesGenerateMock.mockResolvedValueOnce({ data: [] });
    await expect(
      generateStillsViaProvider({ scenePrompts: ['a scene with no image back'], model: 'gpt-image-1.5' }),
    ).rejects.toThrow(/no usable image data/);
  });

  it('books token-billed cost from the response usage (Sprint 4 Task 11)', async () => {
    imagesGenerateMock.mockResolvedValue({
      data: [{ b64_json: Buffer.from('x').toString('base64') }],
      usage: { input_tokens: 29, input_tokens_details: { image_tokens: 0, text_tokens: 29 }, output_tokens: 158 },
    });
    const result = await generateStillsViaProvider({ scenePrompts: ['a', 'b'], model: 'gpt-image-2.5-flare' });
    expect(Number(result.costUsd)).toBeCloseTo(2 * 0.004885, 6);
  });

  it('falls back to the flat price when a token-billed response has no usage', async () => {
    const result = await generateStillsViaProvider({ scenePrompts: ['a', 'b'], model: 'gpt-image-2.5-flare' });
    expect(Number(result.costUsd)).toBeCloseTo(0.01, 6);
  });

  it('throws for a model with no pricing entry, before any request', async () => {
    await expect(generateStillsViaProvider({ scenePrompts: ['a'], model: 'gpt-image-9' })).rejects.toThrow(/No image pricing entry/);
    expect(imagesGenerateMock).not.toHaveBeenCalled();
  });

  it('waits out a 429 and retries the same still', async () => {
    const waits: number[] = [];
    const timeout = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) => {
      waits.push(ms ?? 0);
      fn();
      return 0 as unknown as NodeJS.Timeout;
    }) as unknown as typeof setTimeout);
    try {
      const rateLimit = Object.assign(new (OpenAI as unknown as { APIError: new (m: string) => Error }).APIError(
        'Rate limit reached. Please try again in 3s.',
      ), { status: 429 });
      imagesGenerateMock.mockRejectedValueOnce(rateLimit);
      const result = await generateStillsViaProvider({ scenePrompts: ['a'], model: 'gpt-image-1.5' });
      expect(waits).toEqual([4_000]);
      expect(imagesGenerateMock).toHaveBeenCalledTimes(2);
      expect(result.imagePaths).toHaveLength(1);
    } finally {
      timeout.mockRestore();
    }
  });

  it('skips a moderation-blocked prompt and keeps the rest, unbilled', async () => {
    const blocked = Object.assign(new (OpenAI as unknown as { APIError: new (m: string) => Error }).APIError('blocked'), {
      code: 'moderation_blocked',
    });
    imagesGenerateMock.mockRejectedValueOnce(blocked);
    const result = await generateStillsViaProvider({ scenePrompts: ['bad', 'good'], model: 'gpt-image-1.5' });
    expect(result.skippedPromptCount).toBe(1);
    expect(result.imagePaths).toHaveLength(1);
    expect(Number(result.costUsd)).toBeCloseTo(0.013, 6);
  });
});

describe('rateLimitWaitMs (Sprint 4 Task 8, R6)', () => {
  it("honours the provider's own retry hint, plus 1s of slack", () => {
    expect(rateLimitWaitMs('Rate limit reached ... on input-images per min: Limit 5, Used 5, Requested 1. Please try again in 12s. Visit ...')).toBe(13_000);
    expect(rateLimitWaitMs('Please try again in 6.5s.')).toBe(7_500);
    expect(rateLimitWaitMs('Please try again in 800ms.')).toBe(1_800);
  });

  it('falls back to a fixed wait when there is no hint', () => {
    expect(rateLimitWaitMs('Rate limit reached')).toBe(15_000);
  });
});

describe('confirmed image quota exhaustion', () => {
  it('stops without entering per-still backoff', async () => {
    imagesGenerateMock.mockReset();
    const error = new OpenAI.APIError(undefined, undefined, 'insufficient quota', undefined);
    Object.assign(error, { status: 429, code: 'insufficient_quota' });
    imagesGenerateMock.mockRejectedValue(error);
    const failure = await generateStillsViaProvider({ scenePrompts: ['scene'], model: 'gpt-image-1.5' }).catch((e: unknown) => e);
    expect(imagesGenerateMock).toHaveBeenCalledTimes(1);
    expect(failure).toMatchObject({ context: { recoveryKind: 'provider_capacity', statusCode: 429, providerErrorCode: 'insufficient_quota' } });
  });
});
