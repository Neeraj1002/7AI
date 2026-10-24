import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { env } from '../../config/env';
import { runDeterministicChecks } from './index';
import { classifyHardFailure } from './quality-metrics';

// Sprint 5 Task 8 (R3): the shot-length gate reads the rendered scene lengths, which removed a false failure (two
// look-alike stills read as one 10.4 s shot). It must not have become a gate that never fails: a real file with one
// picture held for 10 s, against the 7.5 s limit of a 5 s-per-still long video, still fails Video Review. Real FFmpeg.
const exec = promisify(execFile);
let dir: string;
let video: string;

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'shot-gate-'));
  const image = path.join(dir, 'still.png');
  video = path.join(dir, 'single-shot.mp4');
  const ff = (args: string[]) => exec(env.FFMPEG_PATH, ['-y', '-hide_banner', '-loglevel', 'error', ...args]);
  await ff(['-f', 'lavfi', '-i', 'color=c=0x336699:size=1920x1080:rate=1', '-frames:v', '1', image]);
  // 10 s, 1920x1080 at 30 fps, h264 High yuv420p, aac 48 kHz, levelled to about -14 LUFS like a real render.
  await ff([
    '-loop', '1', '-framerate', '30', '-i', image,
    '-f', 'lavfi', '-i', 'sine=frequency=300:sample_rate=48000:duration=10',
    '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-ar', '48000',
    '-t', '10', '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '192k', '-shortest', video,
  ]);
}, 120_000);

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const checks = (plannedShotSeconds: number[]) => runDeterministicChecks(video, {
  videoKind: 'long', visualSource: 'ai-stills', secondsPerStill: 5, enforceLongShotPacing: true, narrationSeconds: 10, plannedShotSeconds,
});

describe('a real single 10 s shot against the 7.5 s limit', () => {
  it('fails Video Review as a shot-length failure, naming the length and the limit', async () => {
    const result = await checks([10]);
    expect(result.passed).toBe(false);
    if (result.passed) return;
    expect(result.reason).toMatch(/Longest AI still shot is 10\.0s \(pacing limit: 7\.5s\)/);
    expect(classifyHardFailure(result.reason)).toBe('shot_length');
    expect(result.metrics).toMatchObject({ width: 1920, height: 1080, longestShotSeconds: 10, shotCount: 1 });
  }, 120_000);

  it('the same file with its scenes cut at 5 s and 5 s does not fail on shot length', async () => {
    const result = await checks([5, 5]);
    if (!result.passed) expect(classifyHardFailure(result.reason)).not.toBe('shot_length');
  }, 120_000);
});
