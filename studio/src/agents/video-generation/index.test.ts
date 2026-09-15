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
