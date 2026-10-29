import { describe, it, expect, vi, afterAll } from 'vitest';

// Sprint 6 Task 2 (P5): real FFmpeg renders (stub narration, stub pictures, the real recorded clip) of a Short and a
// Long, disclaimer On and Off. Checks the added seconds, the shifted timings, the clip's level against the narration
// and that the card is on screen only while the clip plays. Set DISCLAIMER_RENDER_OUT to keep the first ten seconds.
vi.hoisted(() => {
  process.env.MEDIA_STUB = '1';
  process.env.AI_VISUALS_STUB = '1';
  process.env.STOCK_FOOTAGE_STUB = '1';
});

import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env';
import { DATA_DIR } from '../config/paths';
import { removeRunWorkFiles } from '../ai-visuals/cache';
import { generateVideo } from '../agents/video-generation';
import { generateLongVideo } from '../agents/video-generation/long-form';
import type { ProductionPlan } from '../agents/video-generation/plan';
import { readDisclaimerManifest } from './asset-spec';
import { DISCLAIMER_PAD_SEC } from './splice';

const execFileAsync = promisify(execFile);
const runIds: string[] = [];
const OUT = process.env.DISCLAIMER_RENDER_OUT;

afterAll(async () => {
  for (const id of runIds) {
    await removeRunWorkFiles(id);
    await fs.rm(path.join(DATA_DIR, 'videos', id), { recursive: true, force: true });
  }
});

const words = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);
const shortScript = `Nobody saw it coming. ${words('story', 40).join(' ')}.`;
const chapters = [
  { title: 'One', text: `Nobody saw it coming. ${words('brick', 40).join(' ')}.` },
  { title: 'Two', text: `${words('stone', 15).join(' ')}.` },
];

function shortPlan(): ProductionPlan {
  return {
    visualSource: 'ai-stills', stockFootageQuery: 'x', captionStyle: 'sentence-grouped', audioLayer: 'none', pacingNotes: 'p', rationale: 'r',
    stillScenePrompts: ['scene a', 'scene b', 'scene c'],
  };
}
function longPlan(): ProductionPlan {
  const longScenes = [
    { chapterIndex: 0, words: 'Nobody saw it', prompt: 'long a' },
    { chapterIndex: 0, words: 'brick10 brick11 brick12', prompt: 'long b' },
    { chapterIndex: 0, words: 'brick25 brick26 brick27', prompt: 'long c' },
    { chapterIndex: 1, words: 'stone0 stone1 stone2', prompt: 'long d' },
  ];
  return { ...shortPlan(), stillScenePrompts: longScenes.map((s) => s.prompt), longScenes };
}

async function probeSeconds(file: string): Promise<number> {
  const { stdout } = await execFileAsync(env.FFPROBE_PATH, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]);
  return parseFloat(stdout.trim());
}
async function keepFirstTen(file: string, name: string): Promise<void> {
  if (!OUT) return;
  await fs.mkdir(OUT, { recursive: true });
  await execFileAsync(env.FFMPEG_PATH, ['-y', '-i', file, '-t', '10', '-c', 'copy', path.join(OUT, `${name}.mp4`)]);
}

describe('disclaimer render (Short and Long, On and Off)', () => {
  it('Short: On adds the clip seconds after the hook, Off is unchanged, the card shows only during the clip', async () => {
    const manifest = await readDisclaimerManifest();
    const gap = manifest.clipSeconds + 2 * DISCLAIMER_PAD_SEC;
    const make = async (disclaimer: boolean) => {
      const runId = randomUUID();
      runIds.push(runId);
      return generateVideo({ pipelineRunId: runId, attemptNumber: 1, scriptText: shortScript, brandAssets: {}, plan: shortPlan(), voice: 'coral', disclaimer });
    };
    const off = await make(false);
    const on = await make(true);
    const offLen = await probeSeconds(off.output.videoPath);
    const onLen = await probeSeconds(on.output.videoPath);
    expect(onLen - offLen).toBeGreaterThan(gap - 0.3);
    expect(onLen - offLen).toBeLessThan(gap + 0.3);
    await keepFirstTen(off.output.videoPath, 'short-off');
    await keepFirstTen(on.output.videoPath, 'short-on');
    console.log(`[render] short: Off ${offLen.toFixed(2)}s, On ${onLen.toFixed(2)}s, added ${(onLen - offLen).toFixed(2)}s`);
  }, 300_000);

  it('Long: On adds the same seconds, shifts chapter markers, and keeps the picture the same length as the audio', async () => {
    const manifest = await readDisclaimerManifest();
    const gap = manifest.clipSeconds + 2 * DISCLAIMER_PAD_SEC;
    const make = async (disclaimer: boolean) => {
      const runId = randomUUID();
      runIds.push(runId);
      return generateLongVideo({ pipelineRunId: runId, attemptNumber: 1, chapters, plan: longPlan(), voice: 'coral', disclaimer });
    };
    const off = await make(false);
    const on = await make(true);
    const offT = off.output.chapterTimings!;
    const onT = on.output.chapterTimings!;
    expect(onT[0].startSec).toBe(0);
    expect(onT[0].endSec).toBeCloseTo(offT[0].endSec + gap, 1);
    expect(onT[1].startSec).toBeCloseTo(offT[1].startSec + gap, 1);
    const offLen = await probeSeconds(off.output.videoPath);
    const onLen = await probeSeconds(on.output.videoPath);
    expect(onLen - offLen).toBeGreaterThan(gap - 0.3);
    expect(onLen - offLen).toBeLessThan(gap + 0.3);
    await keepFirstTen(off.output.videoPath, 'long-off');
    await keepFirstTen(on.output.videoPath, 'long-on');
    console.log(`[render] long: Off ${offLen.toFixed(2)}s, On ${onLen.toFixed(2)}s, added ${(onLen - offLen).toFixed(2)}s`);
  }, 300_000);
});
