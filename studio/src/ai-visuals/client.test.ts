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
