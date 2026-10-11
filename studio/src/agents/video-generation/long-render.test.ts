import { describe, it, expect } from 'vitest';
import {
  allocateFrames,
  buildSceneTimeline,
  kenBurnsFilter,
  locateSceneStarts,
  moveForScene,
  planBedChain,
  videoEncodeArgs,
} from './long-render';
import { RENDER_PROFILES, renderProfileFor } from './render-profile';
import { QUALITY_SPEC } from './quality-spec';
import { allocateStillsToChapters, longStillCount } from './plan-long';

describe('render profiles', () => {
  it('short is exactly the values Shorts have always used', () => {
    expect(RENDER_PROFILES.short).toEqual({ width: 1080, height: 1920, fps: 30, burnCaptions: true });
    expect(RENDER_PROFILES.short.width).toBe(QUALITY_SPEC.video.width);
    expect(RENDER_PROFILES.short.height).toBe(QUALITY_SPEC.video.height);
  });
  it('long is 1920x1080 at 30 fps, no burned captions, 8M/16M', () => {
    expect(renderProfileFor('long')).toMatchObject({ width: 1920, height: 1080, fps: 30, burnCaptions: false, maxrateKbps: 8000, bufsizeKbps: 16000 });
    const args = videoEncodeArgs(renderProfileFor('long'));
    expect(args).toContain('-maxrate');
    expect(args[args.indexOf('-maxrate') + 1]).toBe('8000k');
    expect(args[args.indexOf('-bufsize') + 1]).toBe('16000k');
    expect(videoEncodeArgs(RENDER_PROFILES.short)).not.toContain('-maxrate');
  });
});

describe('Ken Burns', () => {
  it('never repeats a move twice in a row, alternating push-in and pan', () => {
    const moves = Array.from({ length: 40 }, (_, i) => moveForScene(i));
    for (let i = 1; i < moves.length; i += 1) expect(moves[i]).not.toBe(moves[i - 1]);
    expect(moves.filter((m) => m === 'push-in')).toHaveLength(20);
    expect(new Set(moves)).toEqual(new Set(['push-in', 'pan-right', 'pan-left']));
  });

  it('uses one multiplication: d equals the frames and there is no input -t / loop count', () => {
    const f = kenBurnsFilter({ move: 'push-in', frames: 150, profile: renderProfileFor('long') });
    expect(f).toContain('d=150');
    expect(f).toContain('s=1920x1080');
    expect(f).toContain('fps=30');
    expect(f).toContain('on/150');
    expect(f.match(/zoompan=/g)).toHaveLength(1);
  });

  it('pans use a constant zoom and move x across the frame in either direction', () => {
    const right = kenBurnsFilter({ move: 'pan-right', frames: 100, profile: renderProfileFor('long') });
    const left = kenBurnsFilter({ move: 'pan-left', frames: 100, profile: renderProfileFor('long') });
    expect(right).toContain("x='(iw-iw/zoom)*on/100'");
    expect(left).toContain("x='(iw-iw/zoom)*(1-on/100)'");
  });
});

describe('allocateFrames', () => {
  it('sums to exactly round(total x fps) however many scenes there are', () => {
    // 120 scenes of 5.013 s: per-scene rounding would drift by tens of frames.
    const ends = Array.from({ length: 120 }, (_, i) => (i + 1) * 5.013);
    const frames = allocateFrames(ends, 30);
    expect(frames.reduce((a, b) => a + b, 0)).toBe(Math.round(ends[119] * 30));
    expect(Math.min(...frames)).toBeGreaterThanOrEqual(1);
  });
});

describe('scene timeline', () => {
  const chapterTimings = [
    { title: 'A', startSec: 0, endSec: 10 },
    { title: 'B', startSec: 10.25, endSec: 20 },
  ];
  const speak = (text: string, startSec: number) =>
    text.split(' ').map((w, i) => ({ text: w, startMs: Math.round((startSec + i * 0.4) * 1000), endMs: Math.round((startSec + i * 0.4 + 0.35) * 1000) }));
  const words = [
    ...speak('why does the bridge stand today because the stone remembers every load', 0),
    ...speak('what about the quarry it sits north of the river and the stone is hard', 10.25),
  ];
  const scenes = [
    { chapterIndex: 0, words: 'why does the bridge', prompt: 'p0' },
    { chapterIndex: 0, words: 'because the stone remembers', prompt: 'p1' },
    { chapterIndex: 1, words: 'what about the quarry', prompt: 'p2' },
    { chapterIndex: 1, words: 'the river and the stone', prompt: 'p3' },
  ];

  it('places each scene where its opening words are spoken', () => {
    const starts = locateSceneStarts({ scenes, chapterTimings, words });
    expect(starts[0]).toBe(0);
    expect(starts[1]).toBeCloseTo(2.4, 1); // the 7th word, at 0.4 s each
    expect(starts[2]).toBe(10.25);
    expect(starts[3]).toBeCloseTo(10.25 + 0.4 * 8, 1);
  });

  it('spaces a scene whose words are not found evenly, and keeps order and spacing', () => {
    const lost = scenes.map((s, i) => (i === 1 ? { ...s, words: 'nothing like this was said' } : s));
    const starts = locateSceneStarts({ scenes: lost, chapterTimings, words });
    expect(starts[1]).toBeGreaterThan(starts[0]);
    expect(starts[1]).toBeLessThan(10);
  });

  it('tiles [0, total] in order with each chapter starting its first scene', () => {
    const timeline = buildSceneTimeline({ scenes, chapterTimings, words, totalSec: 20.7 });
    expect(timeline[0].startSec).toBe(0);
    expect(timeline.at(-1)!.endSec).toBe(20.7);
    for (let i = 1; i < timeline.length; i += 1) {
      expect(timeline[i].startSec).toBe(timeline[i - 1].endSec);
      expect(timeline[i].endSec).toBeGreaterThan(timeline[i].startSec);
    }
    // chapter B's first scene starts when B's narration starts, so the picture changes with the chapter
    expect(timeline[2].startSec).toBe(10.25);
  });
});

describe('music bed chain', () => {
  it('uses a single long-enough track once', () => {
    expect(planBedChain([300], 200)).toEqual([0]);
  });
  it('chains tracks in order, then loops the last one, losing 3 s per join', () => {
    // 100 + 100 + 100 - 2x3 crossfade = 294 covers 290.
    expect(planBedChain([100, 100], 290)).toEqual([0, 1, 1]);
    // 3 tracks of 100 cover 294; 400 needs the last one twice more (97 s each).
    expect(planBedChain([100, 100, 100], 400)).toEqual([0, 1, 2, 2, 2]);
  });
  it('stops adding tracks once the video is covered', () => {
    expect(planBedChain([100, 100, 100], 150)).toEqual([0, 1]);
  });
});

describe('still counts', () => {
  it('is ceil(seconds / secondsPerStill) clamped to 12..200, default 5 s', () => {
    expect(longStillCount(600, null)).toBe(120);
    expect(longStillCount(120, 5)).toBe(24);
    expect(longStillCount(120, 10)).toBe(12);
    expect(longStillCount(900, 1)).toBe(200);
    expect(longStillCount(600, 6)).toBe(100);
  });

  it('splits the total across chapters by narration length, exactly, at least 2 each', () => {
    const chapters = [
      { title: 'a', text: Array(400).fill('w').join(' ') },
      { title: 'b', text: Array(100).fill('w').join(' ') },
      { title: 'c', text: Array(30).fill('w').join(' ') },
    ];
    const counts = allocateStillsToChapters(chapters, 120);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(120);
    expect(counts[0]).toBeGreaterThan(counts[1]);
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(2);
  });
});

describe('chapter segments resume after a crash (Sprint 4 Task 9, R6.3)', () => {
  it('a finished chapter is reused; only a missing one is rendered again', async () => {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const fsp = await import('node:fs/promises');
    const os = await import('node:os');
    const path = await import('node:path');
    const { renderChapterSegments } = await import('./long-render');
    const { env } = await import('../../config/env');
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'segments-'));
    try {
      const img = path.join(dir, 'a.png');
      await promisify(execFile)(env.FFMPEG_PATH, ['-y', '-f', 'lavfi', '-i', 'color=c=0x336699:size=1536x1024:rate=1', '-frames:v', '1', img]);
      const chapters = [0, 1].map((chapterIndex) => ({ chapterIndex, scenes: [{ sceneIndex: chapterIndex, imagePath: img, frames: 6 }] }));
      const events: string[] = [];
      const run = () =>
        renderChapterSegments({
          chapters,
          workDir: path.join(dir, 'seg'),
          profile: renderProfileFor('long'),
          onChapterDone: (ci, resumed) => events.push(`${ci}:${resumed ? 'resumed' : 'rendered'}`),
        });
      const first = await run();
      expect(events).toEqual(['0:rendered', '1:rendered']);
      // The process "crashes" after chapter 0: chapter 1's file is gone.
      await fsp.rm(first[1]);
      events.length = 0;
      const second = await run();
      expect(events).toEqual(['0:resumed', '1:rendered']);
      expect(second).toEqual(first);
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
