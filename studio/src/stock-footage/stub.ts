import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { env } from '../config/env';
import type { SearchClipParams, StockClip } from './types';
import { DATA_DIR } from '../config/paths';

// Testing-only stand-in for the real Pexels-backed search+download, used
// only when STOCK_FOOTAGE_STUB=1 — no PEXELS_API_KEY has been available in
// any session so far. Same reasoning as media/stub.ts: a moving, colorful
// generated pattern (not a static solid color) so the assembly step and any
// visual comparison between attempt 1/attempt 2 has genuinely different,
// non-trivial footage to work with, not a flat placeholder indistinguishable
// from the pre-Task-1 solid-color background.

const execFileAsync = promisify(execFile);
const STOCK_FOOTAGE_TMP_DIR = path.resolve(DATA_DIR, 'stock-footage-tmp');
const STUB_CLIP_DURATION_SECONDS = 8;

async function ensureTmpDir(): Promise<void> {
  await fs.mkdir(STOCK_FOOTAGE_TMP_DIR, { recursive: true });
}

function uniqueStubSourceId(base: string, used: string[]): string {
  let candidate = base;
  for (let n = 2; used.includes(candidate); n += 1) candidate = `${base}-${n}`;
  return candidate;
}

export async function stubSearchAndDownloadClip(params: SearchClipParams): Promise<StockClip> {
  await ensureTmpDir();
  const clipPath = path.join(STOCK_FOOTAGE_TMP_DIR, `${randomUUID()}.mp4`);

  // testsrc2 renders a moving color-bar/animation pattern — deliberately not
  // a flat color, so this stub is visually distinguishable from the
  // pre-Task-1 solid-color background it replaces.
  await execFileAsync(env.FFMPEG_PATH, [
    '-y',
    '-f',
    'lavfi',
    '-i',
    `testsrc2=size=1080x1920:rate=30:duration=${STUB_CLIP_DURATION_SECONDS}`,
    '-pix_fmt',
    'yuv420p',
    clipPath,
  ]);

  return {
    clipPath,
    durationSeconds: STUB_CLIP_DURATION_SECONDS,
    // Honours excludeSourceIds the way the real client does, so a shot list of
    // repeated queries still yields distinct IDs under test.
    sourceId: uniqueStubSourceId(`stub-${params.query.replace(/\s+/g, '-')}`, params.excludeSourceIds ?? []),
    sourceUrl: 'stub://stock-footage',
    costUsd: '0.000000',
  };
}
