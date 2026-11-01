import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { env } from '../../config/env';
import { audioTimelineProblem, probeAudioTimeline } from './audio-guards';

const run = promisify(execFile);
const ffmpeg = (args: string[]) => run(env.FFMPEG_PATH, ['-hide_banner', '-loglevel', 'error', '-y', ...args]);

describe('audio guard on real files', () => {
  it('passes a clean AAC track and fails the same track with a 3 s timestamp hole', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'audio-guard-'));
    try {
      const clean = path.join(dir, 'clean.mp4');
      await ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=220:duration=12', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', clean]);
      expect(audioTimelineProblem(await probeAudioTimeline(clean))).toBeNull();

      // Packets after 5 s are moved 3 s later (144000 ticks at 1/48000): the shape of the missing-audio fault.
      const holed = path.join(dir, 'holed.mp4');
      await ffmpeg(['-i', clean, '-c', 'copy', '-bsf:a', 'setts=ts=if(gt(PTS\\,240000)\\,PTS+144000\\,PTS)', holed]);
      const problem = audioTimelineProblem(await probeAudioTimeline(holed));
      expect(problem).toMatch(/audio has a hole of 3\.\ds at 5\.\ds: part of the voiceover is missing/);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
    // Three ffmpeg/ffprobe runs: more than vitest's 5 s default when the whole suite is running in parallel.
  }, 30000);
});
