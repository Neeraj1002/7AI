import { describe, it, expect, vi, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';

const mocks = vi.hoisted(() => ({
  synthesizeSpeech: vi.fn(),
  transcribe: vi.fn(),
  generateStills: vi.fn(),
}));
vi.mock('../../media', async (orig) => ({
  ...(await orig<object>()),
  synthesizeSpeech: mocks.synthesizeSpeech,
  transcribe: mocks.transcribe,
}));
vi.mock('../../ai-visuals', () => ({ generateStills: mocks.generateStills }));

import { generateVideo } from './index';
import { buildAudioFilterGraph } from './audio-mix';
import { buildAss } from './captions-ass';
import { emptyVideoSpend, failedRenderUsage } from './spend';
import { END_TAIL_SECONDS } from './quality-spec';
import { NonTransientStageError } from '../../run-pipeline/retry-with-backoff';
import { DATA_DIR } from '../../config/paths';

// Bugs Closure 2 (P5): the cost of a render that fails part-way is kept.
// (P8): the end tail in the audio graph and the captions.

const STUBS = { media: true, stockFootage: false, aiVisuals: false };

describe('failedRenderUsage', () => {
  it('is null when nothing was spent yet', () => {
    expect(failedRenderUsage(emptyVideoSpend(STUBS), new Error('x'))).toBeNull();
  });

  it('books the real total, model list, characters and the stub flags', () => {
    const spend = emptyVideoSpend(STUBS);
    Object.assign(spend, {
      ttsModel: 'tts-1-hd', ttsCharacters: 500, ttsCostUsd: 0.015,
      transcriptionModel: 'whisper-1', transcriptionSeconds: 30, transcriptionCostUsd: 0.003,
      stillsModel: 'gpt-image-1.5', stillsCount: 3, stillsCostUsd: 0.039,
    });
    const usage = failedRenderUsage(spend, new Error('ffmpeg exploded'))!;
    expect(usage.provider).toBe('openai');
    expect(usage.model).toBe('tts-1-hd+whisper-1+gpt-image-1.5');
    expect(Number(usage.costUsd)).toBeCloseTo(0.057, 6);
    expect(usage.characterCount).toBe(500);
    expect(usage.metadata).toMatchObject({ failedRender: true, aiVisualsStillCount: 3, stubFlags: STUBS });
  });
});

const createdRuns: string[] = [];
afterAll(async () => {
  for (const id of createdRuns) await fs.rm(path.resolve(DATA_DIR, 'videos', id), { recursive: true, force: true });
});

const plan = {
  visualSource: 'ai-stills', stockFootageQuery: 'q', stillScenePrompts: ['a', 'b'], captionStyle: 'phrase-grouped',
  audioLayer: 'none', pacingNotes: 'p', rationale: 'r',
} as never;
const base = (runId: string, spend: ReturnType<typeof emptyVideoSpend>) => {
  createdRuns.push(runId);
  return { pipelineRunId: runId, attemptNumber: 1, scriptText: 'Hello there world.', brandAssets: { captionsEnabled: false }, plan, spend };
};

describe('generateVideo records spend before a failure', () => {
  it('keeps the TTS cost when transcription fails', async () => {
    mocks.synthesizeSpeech.mockResolvedValue({ audioPath: '/tmp/x.mp3', characterCount: 18, costUsd: '0.000540' });
    mocks.transcribe.mockRejectedValue(new Error('whisper down'));
    const spend = emptyVideoSpend(STUBS);
    await expect(generateVideo(base('closure2-tts', spend))).rejects.toThrow('whisper down');
    expect(spend.ttsCharacters).toBe(18);
    expect(spend.ttsCostUsd).toBeCloseTo(0.00054, 6);
    expect(spend.transcriptionCostUsd).toBe(0);
    expect(failedRenderUsage(spend, new Error('x'))?.costUsd).toBe('0.000540');
  });

  it('keeps TTS + transcription + the stills already generated when image generation fails part-way', async () => {
    mocks.synthesizeSpeech.mockResolvedValue({ audioPath: '/tmp/x.mp3', characterCount: 18, costUsd: '0.000540' });
    mocks.transcribe.mockResolvedValue({ segments: [{ text: 'Hello', startMs: 0, endMs: 500 }], audioDurationSeconds: 2, costUsd: '0.000200' });
    mocks.generateStills.mockRejectedValue(
      new NonTransientStageError('image 3 failed', undefined, { provider: 'openai', model: 'gpt-image-1.5', partialStillCount: 2, partialCostUsd: '0.026000' }),
    );
    const spend = emptyVideoSpend(STUBS);
    await expect(generateVideo(base('closure2-stills', spend))).rejects.toThrow('image 3 failed');
    expect(spend.stillsCount).toBe(2);
    expect(spend.stillsModel).toBe('gpt-image-1.5');
    const usage = failedRenderUsage(spend, new Error('x'))!;
    expect(Number(usage.costUsd)).toBeCloseTo(0.00054 + 0.0002 + 0.026, 6);
  });
});

describe('end tail (P8)', () => {
  it('defaults to a short hold well under a second', () => {
    expect(END_TAIL_SECONDS).toBeGreaterThan(0);
    expect(END_TAIL_SECONDS).toBeLessThan(1);
  });

  it('with no tail the graph is exactly the old one', () => {
    const withZero = buildAudioFilterGraph({ voiceInputIndex: 1, bedInputIndex: 2, bedGainDb: -10, tailSeconds: 0, voiceDurationSeconds: 30 });
    const without = buildAudioFilterGraph({ voiceInputIndex: 1, bedInputIndex: 2, bedGainDb: -10 });
    expect(withZero).toBe(without);
    expect(without).not.toContain('apad');
    expect(without).not.toContain('afade');
  });

  it('pads the voice and fades the bed across the tail, starting where the voice ends', () => {
    const g = buildAudioFilterGraph({ voiceInputIndex: 1, bedInputIndex: 2, bedGainDb: -10, tailSeconds: 0.7, voiceDurationSeconds: 30 });
    expect(g).toContain('[1:a]aformat=channel_layouts=stereo,apad=pad_dur=0.700,asplit=2[voice][key]');
    expect(g).toContain('[ducked]afade=t=out:st=30.000:d=0.700[duckedf]');
    expect(g).toContain('[voice][duckedf]amix=inputs=2:duration=first:normalize=0[mix]');
  });

  it('without a bed the tail is plain silence: padded, never faded', () => {
    const g = buildAudioFilterGraph({ voiceInputIndex: 1, tailSeconds: 0.7, voiceDurationSeconds: 30 });
    expect(g).toContain('apad=pad_dur=0.700');
    expect(g).not.toContain('afade');
  });

  it('the measuring pass sees the same tail', () => {
    const g = buildAudioFilterGraph({ voiceInputIndex: 0, measureOnly: true, tailSeconds: 0.7, voiceDurationSeconds: 30 });
    expect(g).toContain('apad=pad_dur=0.700');
    expect(g).toContain('print_format=json');
  });

  it('keeps the last caption up for the hold, and only the last one', () => {
    const words = [
      { text: 'Hello', startMs: 0, endMs: 500 },
      { text: 'world', startMs: 600, endMs: 1100 },
    ];
    const held = buildAss({ words, style: 'sentence-grouped', holdLastCueMs: 700 }).ass;
    const plain = buildAss({ words, style: 'sentence-grouped' }).ass;
    const endOf = (ass: string) => /Dialogue: 0,[^,]*,([^,]*),/.exec(ass)![1];
    expect(endOf(held)).not.toBe(endOf(plain));
    expect(buildAss({ words, style: 'sentence-grouped', holdLastCueMs: 0 }).ass).toBe(plain);
  });
  it('names the duration-priced model and books its cost (usage-event fields, not the DB write)', () => {
    const spend = emptyVideoSpend(STUBS);
    Object.assign(spend, { ttsModel: 'gpt-4o-mini-tts', ttsCharacters: 354, ttsCostUsd: 0.006458,
      transcriptionModel: 'whisper-1', transcriptionSeconds: 25.84, transcriptionCostUsd: 0.002584 });
    const usage = failedRenderUsage(spend, new Error('x'))!;
    expect(usage.model).toBe('gpt-4o-mini-tts+whisper-1');
    expect(Number(usage.costUsd)).toBeCloseTo(0.009042, 6);
  });
});

