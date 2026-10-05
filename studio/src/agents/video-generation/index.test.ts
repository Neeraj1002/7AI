import { describe, it, expect } from 'vitest';
import { distributeStillWindows } from './index';
import type { TranscriptSegment } from '../../media';

// Sprint 2 Task 2 (E1/E2) — distributeStillWindows is the pure, DB/I/O-free
// function that decides how long each AI-generated still stays on screen,
// synced to caption-cue boundaries. Same unit-test rigor as
// computeChannelBudgetCeilings (Week 5 Task 4) and resolveVoice (Sprint 2
// Task 1) — both prior "pure function extracted specifically for testability"
// precedents this follows.

function cue(startMs: number, endMs: number): TranscriptSegment {
  return { text: 'cue', startMs, endMs };
}

describe('distributeStillWindows', () => {
  it('gives a lone still the entire duration when there is exactly one caption cue', () => {
    const windows = distributeStillWindows({ captionCues: [cue(0, 3000)], stillCount: 1, totalDurationMs: 3000 });
    expect(windows).toEqual([{ startMs: 0, endMs: 3000 }]);
  });

  it('splits cues evenly across stills when the counts divide cleanly', () => {
    const cues = [cue(0, 1000), cue(1000, 2000), cue(2000, 3000), cue(3000, 4000)];
    const windows = distributeStillWindows({ captionCues: cues, stillCount: 2, totalDurationMs: 4000 });
    expect(windows).toEqual([
      { startMs: 0, endMs: 2000 },
      { startMs: 2000, endMs: 4000 },
    ]);
  });

  it('caps the effective still count at the number of cues when there are more stills than cues', () => {
    const cues = [cue(0, 1000), cue(1000, 2000)];
    const windows = distributeStillWindows({ captionCues: cues, stillCount: 5, totalDurationMs: 2000 });
    // Never more windows than real cues to distribute — an over-generous
    // still count doesn't get sub-cue timing it has no real basis for.
    expect(windows.length).toBeLessThanOrEqual(2);
    expect(windows.length).toBeGreaterThan(0);
  });

  it('the first window always starts at 0 and the last always ends at the real audio duration, even if ASR timestamps are imprecise', () => {
    const cues = [cue(120, 900), cue(900, 1800), cue(1800, 2600)];
    const windows = distributeStillWindows({ captionCues: cues, stillCount: 3, totalDurationMs: 2800 });
    expect(windows[0].startMs).toBe(0);
    expect(windows[windows.length - 1].endMs).toBe(2800);
  });

  it('falls back to equal-duration time slices when there are no caption cues at all', () => {
    const windows = distributeStillWindows({ captionCues: [], stillCount: 4, totalDurationMs: 8000 });
    expect(windows).toEqual([
      { startMs: 0, endMs: 2000 },
      { startMs: 2000, endMs: 4000 },
      { startMs: 4000, endMs: 6000 },
      { startMs: 6000, endMs: 8000 },
    ]);
  });

  it('never produces zero windows, even for a pathological stillCount of 0', () => {
    const windows = distributeStillWindows({ captionCues: [cue(0, 1000)], stillCount: 0, totalDurationMs: 1000 });
    expect(windows.length).toBeGreaterThan(0);
  });
});

describe('distributeStillWindows — time-aware boundaries (Sprint 4 Task 8, R6)', () => {
  it('does not let a slow stretch of speech hold one still far past the equal-time slice', () => {
    // 10 cues: 8 quick ones (1s each) then 2 very slow ones (6s each) = 20s total.
    const quick = Array.from({ length: 8 }, (_, i) => cue(i * 1000, (i + 1) * 1000));
    const slow = [cue(8000, 14000), cue(14000, 20000)];
    const windows = distributeStillWindows({ captionCues: [...quick, ...slow], stillCount: 4, totalDurationMs: 20000 });
    expect(windows).toHaveLength(4);
    // An equal-cue-count split would hand the two slow cues to one still (12s);
    // time-aware boundaries keep every still near the 5s slice.
    const lengths = windows.map((w) => (w.endMs - w.startMs) / 1000);
    expect(Math.max(...lengths)).toBeLessThanOrEqual(8);
    // Still contiguous coverage of the whole audio.
    expect(windows[0].startMs).toBe(0);
    expect(windows[3].endMs).toBe(20000);
  });

  it('every window keeps at least one whole cue and windows never overlap or reorder', () => {
    const cues = Array.from({ length: 12 }, (_, i) => cue(i * 700, (i + 1) * 700));
    const windows = distributeStillWindows({ captionCues: cues, stillCount: 12, totalDurationMs: 8400 });
    expect(windows).toHaveLength(12);
    windows.forEach((w, i) => {
      expect(w.endMs).toBeGreaterThan(w.startMs);
      if (i > 0) expect(w.startMs).toBeGreaterThanOrEqual(windows[i - 1].endMs);
    });
  });
});

describe('distributeStillWindows — contiguous coverage (Sprint 4 Task 8)', () => {
  it('windows tile [0, total] with no gaps, so pauses between cues never shorten the stills video', () => {
    // Word-flash-like cues with a 150ms pause after each word.
    const cues = Array.from({ length: 20 }, (_, i) => cue(i * 650, i * 650 + 500));
    const total = 20 * 650;
    const windows = distributeStillWindows({ captionCues: cues, stillCount: 6, totalDurationMs: total });
    expect(windows[0].startMs).toBe(0);
    expect(windows[windows.length - 1].endMs).toBe(total);
    windows.forEach((w, i) => {
      if (i > 0) expect(w.startMs).toBe(windows[i - 1].endMs);
    });
    const sum = windows.reduce((acc, w) => acc + (w.endMs - w.startMs), 0);
    expect(sum).toBe(total);
  });
});
