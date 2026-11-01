import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const mocks = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock('../../stock-footage', () => ({ searchStockFootage: mocks.search }));
vi.mock('./quality-spec', () => ({
  QUALITY_SPEC: { video: { width: 360, height: 640, fps: 30, trackTimescale: 15360, pixFmt: 'yuv420p' } },
}));

import { env } from '../../config/env';
import { buildStockShotList } from './stock-shotlist';

const run = promisify(execFile);

describe('stock footage assembly frame clock', () => {
  it('joins clips with mixed source frame rates into a continuous 30 fps stream', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'stock-cfr-'));
    try {
      const rates = ['24', '30000/1001', '60'];
      const clips = await Promise.all(rates.map(async (rate, i) => {
        const clipPath = path.join(dir, `source-${i}.mp4`);
        await run(env.FFMPEG_PATH, [
          '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi',
          '-i', `testsrc2=size=360x640:rate=${rate}:duration=2`,
          ...(i === 1 ? ['-vf', 'setpts=PTS+0.5/TB'] : []),
          '-an', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', clipPath,
        ]);
        return clipPath;
      }));
      let next = 0;
      mocks.search.mockImplementation(async () => ({
        sourceId: String(next), clipPath: clips[next++], durationSeconds: 2,
      }));
      const outputPath = path.join(dir, 'joined.mp4');
      await buildStockShotList({
        queries: ['first', 'second', 'third'],
        windows: [{ startMs: 0, endMs: 1400 }, { startMs: 1400, endMs: 2700 }, { startMs: 2700, endMs: 4000 }],
        totalDurationMs: 4000,
        outputPath,
      });

      const { stdout: metaText } = await run(env.FFPROBE_PATH, [
        '-v', 'error', '-select_streams', 'v:0',
        '-show_entries', 'stream=r_frame_rate,avg_frame_rate,time_base,duration',
        '-of', 'json', outputPath,
      ]);
      const stream = (JSON.parse(metaText) as { streams: Array<Record<string, string>> }).streams[0];
      expect(stream.r_frame_rate).toBe('30/1');
      expect(stream.time_base).toBe('1/15360');
      expect(Number(stream.duration)).toBeGreaterThanOrEqual(4);

      const { stdout: frameText } = await run(env.FFPROBE_PATH, [
        '-v', 'error', '-select_streams', 'v:0', '-show_frames',
        '-show_entries', 'frame=best_effort_timestamp_time', '-of', 'csv=p=0', outputPath,
      ]);
      const times = frameText.split(/\r?\n/).filter((line) => line.trim() !== '')
        .map((line) => Number(line.split(',')[0])).filter(Number.isFinite);
      expect(times.length).toBeGreaterThan(120);
      const gaps = times.slice(1).map((time, i) => time - times[i]);
      expect(Math.max(...gaps)).toBeLessThan(0.034);
      expect(Math.min(...gaps)).toBeGreaterThan(0.032);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
