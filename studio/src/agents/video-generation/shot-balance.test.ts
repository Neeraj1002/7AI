import { describe, it, expect } from 'vitest';
import { addScenesToChapters, rebalanceShotLengths, SHOT_PLANNING_MARGIN } from './shot-balance';
import { validateScenePlan } from './scene-mapping';
import { chapterSceneSlots } from './plan-long';
import { buildStyledScenePrompts } from './scene-prompts';
import { classifyHardFailure, TIMING_FAILURE_CODES } from '../video-intelligence/quality-metrics';
import type { ProductionPlan } from './plan';
import type { TimedScene } from './long-render';

const LIMIT = 7.5;
const scene = (i: number, chapterIndex: number, startSec: number, endSec: number): TimedScene => ({
  sceneIndex: i, sceneId: `${chapterIndex}:${i}`, chapterIndex, startSec, endSec, matchKind: 'exact',
});
const shots = (t: TimedScene[]) => t.map((s) => Number((s.endSec - s.startSec).toFixed(2)));

describe('rebalanceShotLengths (R3: shot-length check on the plan, before any picture)', () => {
  it('replays E2: one 8.3 s scene against the 7.5 s limit is retimed, nothing else moves', () => {
    // Chapter of 6 scenes, 30 s: 8.3 + five scenes of 4.34
    const t = [scene(0, 0, 0, 8.3), scene(1, 0, 8.3, 12.64), scene(2, 0, 12.64, 16.98), scene(3, 0, 16.98, 21.32), scene(4, 0, 21.32, 25.66), scene(5, 0, 25.66, 30)];
    const r = rebalanceShotLengths(t, LIMIT);
    expect(r.splits).toEqual([]);
    expect(r.adjustedChapters).toEqual([0]);
    expect(Math.max(...shots(r.timeline))).toBeLessThanOrEqual(LIMIT * SHOT_PLANNING_MARGIN + 0.01);
    // the chapter still tiles [0, 30] exactly, in order
    expect(r.timeline[0].startSec).toBe(0);
    expect(r.timeline[5].endSec).toBeCloseTo(30, 6);
    r.timeline.slice(1).forEach((s, i) => expect(s.startSec).toBeCloseTo(r.timeline[i].endSec, 6));
  });

  it('leaves a compliant chapter byte-for-byte alone', () => {
    const t = [scene(0, 0, 0, 5), scene(1, 0, 5, 10), scene(2, 1, 10, 16)];
    const r = rebalanceShotLengths(t, LIMIT);
    expect(r.timeline).toEqual(t);
    expect(r.adjustedChapters).toEqual([]);
    expect(r.splits).toEqual([]);
  });

  it('does not touch the neighbouring chapter when it fixes one', () => {
    const t = [scene(0, 0, 0, 9), scene(1, 0, 9, 14), scene(2, 1, 14, 19), scene(3, 1, 19, 24)];
    const r = rebalanceShotLengths(t, LIMIT);
    expect(r.timeline[1].endSec).toBe(14);
    expect(r.timeline[2]).toEqual(t[2]);
    expect(r.timeline[3]).toEqual(t[3]);
  });

  it('asks for more scenes when a chapter cannot meet the limit with the scenes it has', () => {
    const t = [scene(0, 0, 0, 12), scene(1, 0, 12, 22)]; // 22 s in two scenes: needs 4
    const r = rebalanceShotLengths(t, LIMIT);
    expect(r.splits).toEqual([{ chapterIndex: 0, currentCount: 2, neededCount: Math.ceil(22 / (LIMIT * SHOT_PLANNING_MARGIN)) }]);
    expect(r.timeline).toEqual(t); // unchanged until scenes are added
  });
});

describe('addScenesToChapters (R3: only added scenes need a new picture)', () => {
  const text = Array.from({ length: 60 }, (_, i) => `w${i}`).join(' ');
  const chapters = [{ text }, { text }];
  const planFor = (counts: number[]): ProductionPlan => {
    const longScenes: NonNullable<ProductionPlan['longScenes']> = [];
    const meanings: NonNullable<ProductionPlan['sceneMeanings']>['scenes'] = [];
    counts.forEach((n, ci) => chapterSceneSlots(text, n).forEach((slot, k) => {
      longScenes.push({ chapterIndex: ci, words: slot.anchor, prompt: `picture ${ci}-${k}` });
      meanings.push({ sceneId: `${ci}:${k}`, narrationSpan: { chapterIndex: ci, startWord: slot.startWord, endWordExclusive: slot.endWordExclusive }, purpose: 'illustration' });
    }));
    return { visualSource: 'ai-stills', stockFootageQuery: 'x', stillScenePrompts: longScenes.map((s) => s.prompt), longScenes,
      sceneMeanings: { version: 1, scenes: meanings }, captionStyle: 'phrase-grouped', audioLayer: 'calm', pacingNotes: 'p', rationale: 'r' };
  };

  it('adds one scene to one chapter: a valid plan, and exactly one prompt that was not there before', () => {
    const before = planFor([3, 3]);
    const after = addScenesToChapters(before, chapters, [{ chapterIndex: 1, currentCount: 3, neededCount: 4 }]);
    expect(after.longScenes).toHaveLength(7);
    expect(() => validateScenePlan(after, chapters)).not.toThrow();
    const known = new Set(before.stillScenePrompts);
    expect(after.stillScenePrompts!.filter((p) => !known.has(p))).toHaveLength(1);
    // chapter 0 is untouched
    expect(after.longScenes!.slice(0, 3)).toEqual(before.longScenes!.slice(0, 3));
  });

  it('image calls: a retimed chapter makes 0 new calls, one added scene makes 1 (cache key = final prompt text)', () => {
    const before = planFor([3, 3]);
    const style = { stylePrompt: 'documentary', safetyNegatives: true };
    const previousCache = new Set(buildStyledScenePrompts(before.stillScenePrompts!, style));
    const calls = (plan: ProductionPlan) => buildStyledScenePrompts(plan.stillScenePrompts!, style).filter((p) => !previousCache.has(p)).length;
    expect(calls(before)).toBe(0); // timing repair reuses the plan: every picture is cached
    expect(calls(addScenesToChapters(before, chapters, [{ chapterIndex: 0, currentCount: 3, neededCount: 4 }]))).toBe(1);
  });

  it('is a no-op for an empty split list', () => {
    const p = planFor([3, 3]);
    expect(addScenesToChapters(p, chapters, [])).toBe(p);
  });
});

describe('failure codes (R3/R5)', () => {
  it('maps each deterministic message to its stable code', () => {
    expect(classifyHardFailure('Longest AI still shot is 8.3s (pacing limit: 7.5s); redistribute scene starts more evenly across the narration')).toBe('shot_length');
    expect(classifyHardFailure('Duration 90.0s is under the 96s minimum')).toBe('duration');
    expect(classifyHardFailure('Duration 950.0s is over the 918s maximum')).toBe('duration');
    expect(classifyHardFailure('Video length 125.0s differs from the narration (120.0s) by 4.2%, more than 2%')).toBe('narration_gap');
    expect(classifyHardFailure('Loudness -20.0 LUFS is outside the -14 ±3 LUFS band')).toBe('loudness');
    expect(classifyHardFailure('Something new')).toBe('other');
  });

  it('only shot length and narration gap are repaired by re-timing', () => {
    expect([...TIMING_FAILURE_CODES].sort()).toEqual(['narration_gap', 'shot_length']);
  });
});
