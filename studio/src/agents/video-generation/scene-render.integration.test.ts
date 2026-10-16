import { expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { env } from '../../config/env';
import { measureQualityMetrics } from '../video-intelligence/quality-metrics';
import { qualityProfileFor } from './quality-spec';
import { allocateFrames, buildSceneTimeline, joinAndMux, renderChapterSegments } from './long-render';
import { renderProfileFor } from './render-profile';

const exec = promisify(execFile);

it('renders mapped chapter boundaries with real FFmpeg and checks the muxed file', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'task3-real-render-'));
  try {
    const red = path.join(dir, 'red.png');
    const blue = path.join(dir, 'blue.png');
    const audio = path.join(dir, 'narration.m4a');
    const outputPath = path.join(dir, 'mapped.mp4');
    for (const [color, p] of [['red', red], ['blue', blue]]) {
      await exec(env.FFMPEG_PATH, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=c=${color}:size=1536x1024:rate=1`, '-frames:v', '1', p]);
    }
    await exec(env.FFMPEG_PATH, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=2', '-c:a', 'aac', '-b:a', '192k', audio]);
    const chapters = [{ text: 'red bridge' }, { text: 'blue river' }];
    const timeline = buildSceneTimeline({
      scenes: [{ chapterIndex: 0, words: 'red bridge', prompt: 'red' }, { chapterIndex: 1, words: 'blue river', prompt: 'blue' }],
      chapters,
      chapterTimings: [{ title: 'red', startSec: 0, endSec: 1 }, { title: 'blue', startSec: 1, endSec: 2 }],
      words: [
        { text: 'red', startMs: 0, endMs: 400 }, { text: 'bridge', startMs: 500, endMs: 900 },
        { text: 'blue', startMs: 1000, endMs: 1400 }, { text: 'river', startMs: 1500, endMs: 1900 },
      ], totalSec: 2,
    });
    expect(timeline.map(t => [t.sceneId, t.startSec, t.endSec])).toEqual([['0:0', 0, 1], ['1:0', 1, 2]]);
    const frames = allocateFrames(timeline.map(t => t.endSec), 30);
    expect(frames).toEqual([30, 30]);
    const chapterPaths = await renderChapterSegments({
      chapters: [{ chapterIndex: 0, scenes: [{ sceneIndex: 0, imagePath: red, frames: 30 }] },
        { chapterIndex: 1, scenes: [{ sceneIndex: 1, imagePath: blue, frames: 30 }] }],
      workDir: path.join(dir, 'segments'), profile: renderProfileFor('long'),
    });
    const mux = await joinAndMux({ chapterPaths, audioPath: audio, workDir: dir, outputPath });
    expect(mux.frameCount).toBe(60);
    for (const [time, expected] of [[0.7, 'red'], [1.3, 'blue']] as const) {
      const raw = path.join(dir, `${expected}.rgb`);
      await exec(env.FFMPEG_PATH, ['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(time), '-i', outputPath,
        '-vf', 'scale=1:1', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', raw]);
      const pixel = await fs.readFile(raw);
      expect(pixel.length).toBe(3);
      if (expected === 'red') expect(pixel[0]).toBeGreaterThan(pixel[2] + 80);
      else expect(pixel[2]).toBeGreaterThan(pixel[0] + 80);
    }
    const qc = await measureQualityMetrics({ videoPath: outputPath, captionsEnabled: false, visualSource: 'ai-stills',
      profile: { ...qualityProfileFor('long'), minDurationSec: null } });
    expect(qc).toMatchObject({ width: 1920, height: 1080, fps: 30, videoCodec: 'h264', pixFmt: 'yuv420p', hasAudio: true, shotCount: 2 });
    expect(qc.rows?.videoCodec?.warn).toBe(false);
    expect(qc.rows?.audioSampleRate?.warn).toBe(false);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}, 120_000);
