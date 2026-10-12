import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const imagesGenerateMock = vi.fn();

vi.mock('openai', () => {
  class MockAPIError extends Error {}
  class MockOpenAI {
    images = { generate: imagesGenerateMock };
  }
  return { default: Object.assign(MockOpenAI, { APIError: MockAPIError }) };
});

import { generateStillsViaProvider } from './client';
import { stillCacheKey } from './cache';
import { NonTransientStageError } from '../run-pipeline/retry-with-backoff';
import { STILL_SIZE_LANDSCAPE, STILL_SIZE_PORTRAIT } from './sizes';

describe('stills disk cache (Sprint 4 Task 9, R5.4)', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'stills-cache-'));
    imagesGenerateMock.mockReset();
    imagesGenerateMock.mockResolvedValue({ data: [{ b64_json: Buffer.from('png').toString('base64') }] });
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('a miss generates, writes the cache file, and reports the spend per still', async () => {
    const paid: number[] = [];
    const res = await generateStillsViaProvider({
      scenePrompts: ['a', 'b'],
      model: 'gpt-image-1.5',
      size: STILL_SIZE_LANDSCAPE,
      cacheDir: dir,
      onStillGenerated: ({ index, costUsd }) => {
        paid.push(index, costUsd);
      },
    });
    expect(imagesGenerateMock).toHaveBeenCalledTimes(2);
    expect(imagesGenerateMock).toHaveBeenCalledWith(expect.objectContaining({ size: '1536x1024' }));
    expect(paid).toEqual([0, 0.013, 1, 0.013]);
    expect((await fs.readdir(dir)).length).toBe(2);
    expect(res.cachedCount).toBe(0);
    expect(Number(res.costUsd)).toBeCloseTo(0.026, 6);
  });

  it('a second call (a retry or a restart) reads the cache and pays for nothing', async () => {
    const args = { scenePrompts: ['a', 'b'], model: 'gpt-image-1.5', size: STILL_SIZE_LANDSCAPE, cacheDir: dir } as const;
    const first = await generateStillsViaProvider({ ...args, scenePrompts: [...args.scenePrompts] });
    imagesGenerateMock.mockClear();
    const onPaid = vi.fn();
    const second = await generateStillsViaProvider({ ...args, scenePrompts: [...args.scenePrompts], onStillGenerated: onPaid });
    expect(imagesGenerateMock).not.toHaveBeenCalled();
    expect(onPaid).not.toHaveBeenCalled();
    expect(second.cachedCount).toBe(2);
    expect(second.costUsd).toBe('0.000000');
    expect(second.imagePaths).toEqual(first.imagePaths);
  });

  it('after a crash mid-way only the missing stills are generated', async () => {
    let calls = 0;
    imagesGenerateMock.mockImplementation(async () => {
      calls += 1;
      if (calls === 3) throw new Error('process died');
      return { data: [{ b64_json: Buffer.from('png').toString('base64') }] };
    });
    const prompts = ['a', 'b', 'c', 'd'];
    await expect(
      generateStillsViaProvider({ scenePrompts: prompts, model: 'gpt-image-1.5', size: STILL_SIZE_LANDSCAPE, cacheDir: dir }),
    ).rejects.toThrow();
    imagesGenerateMock.mockReset();
    imagesGenerateMock.mockResolvedValue({ data: [{ b64_json: Buffer.from('png').toString('base64') }] });
    const res = await generateStillsViaProvider({ scenePrompts: prompts, model: 'gpt-image-1.5', size: STILL_SIZE_LANDSCAPE, cacheDir: dir });
    expect(imagesGenerateMock).toHaveBeenCalledTimes(2);
    expect(res.cachedCount).toBe(2);
    expect(res.imagePaths).toHaveLength(4);
  });

  it('a spend-limit stop in onStillGenerated keeps the still just paid for', async () => {
    await expect(
      generateStillsViaProvider({
        scenePrompts: ['a', 'b', 'c'],
        model: 'gpt-image-1.5',
        size: STILL_SIZE_LANDSCAPE,
        cacheDir: dir,
        onStillGenerated: ({ index }) => {
          if (index === 1) throw new NonTransientStageError('limit');
        },
      }),
    ).rejects.toThrow('limit');
    expect(imagesGenerateMock).toHaveBeenCalledTimes(2);
    expect((await fs.readdir(dir)).length).toBe(2);
  });

  it('the key changes with model, size, quality and prompt', () => {
    const base = { model: 'm', size: STILL_SIZE_LANDSCAPE, quality: 'low', prompt: 'p' };
    const keys = new Set([
      stillCacheKey(base),
      stillCacheKey({ ...base, model: 'm2' }),
      stillCacheKey({ ...base, size: STILL_SIZE_PORTRAIT }),
      stillCacheKey({ ...base, quality: 'high' }),
      stillCacheKey({ ...base, prompt: 'q' }),
    ]);
    expect(keys.size).toBe(5);
  });

  it('without a cacheDir nothing changes: portrait by default, no cache fields', async () => {
    const res = await generateStillsViaProvider({ scenePrompts: ['a'], model: 'gpt-image-1.5' });
    expect(imagesGenerateMock).toHaveBeenCalledWith(expect.objectContaining({ size: '1024x1536' }));
    expect(res.cachedCount).toBeUndefined();
    expect(res.promptIndexes).toBeUndefined();
  });
});
