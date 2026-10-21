import { chapterSceneSlots } from './plan-long';
import type { ProductionPlan } from './plan';
import type { TimedScene } from './long-render';

// Sprint 5 Task 8 (R3): the scene timeline is known from the plan and the narration timing before any
// picture is paid for, so the shot-length limit is checked there, not after the render. A scene that
// is too long is fixed by moving scene starts (free); only when a chapter has too few scenes for its
// narration is a scene added, and then only the added scene needs a new picture.

// The measured longest shot can come out a hair longer than planned (scene detection works on the
// rendered frames), so plan to a little under the limit.
export const SHOT_PLANNING_MARGIN = 0.97;

export type ChapterSplit = { chapterIndex: number; currentCount: number; neededCount: number };

export type ShotBalanceResult = {
  timeline: TimedScene[];
  // Chapters whose scene starts were moved.
  adjustedChapters: number[];
  // Chapters that cannot meet the limit with their present scene count.
  splits: ChapterSplit[];
  longestShotSec: number;
};

const EPS = 1e-6;

// Pure. Moves scene starts inside each chapter so no scene runs past `maxShotSec`, keeping every
// chapter's first start and last end where they are. Excess time goes to the scenes with room, in
// proportion to their room.
export function rebalanceShotLengths(timeline: TimedScene[], maxShotSec: number): ShotBalanceResult {
  const limit = maxShotSec * SHOT_PLANNING_MARGIN;
  const out = timeline.map((scene) => ({ ...scene }));
  const adjusted = new Set<number>();
  const splits: ChapterSplit[] = [];
  const chapters = [...new Set(out.map((s) => s.chapterIndex))];

  for (const ci of chapters) {
    const idx = out.map((s, i) => (s.chapterIndex === ci ? i : -1)).filter((i) => i >= 0);
    const start = out[idx[0]].startSec;
    const end = out[idx[idx.length - 1]].endSec;
    const total = end - start;
    const durations = idx.map((i) => out[i].endSec - out[i].startSec);
    if (durations.every((d) => d <= limit + EPS)) continue;
    if (idx.length * limit + EPS < total) {
      splits.push({ chapterIndex: ci, currentCount: idx.length, neededCount: Math.ceil(total / limit) });
      continue;
    }
    for (let guard = 0; guard < idx.length + 2; guard += 1) {
      let excess = 0;
      durations.forEach((d, k) => {
        if (d > limit + EPS) {
          excess += d - limit;
          durations[k] = limit;
        }
      });
      if (excess <= EPS) break;
      const room = durations.map((d) => Math.max(0, limit - d));
      const roomTotal = room.reduce((a, b) => a + b, 0);
      if (roomTotal <= EPS) break;
      durations.forEach((_, k) => {
        durations[k] += excess * (room[k] / roomTotal);
      });
    }
    let cursor = start;
    idx.forEach((i, k) => {
      out[i].startSec = cursor;
      cursor += durations[k];
      out[i].endSec = cursor;
    });
    out[idx[idx.length - 1]].endSec = end;
    adjusted.add(ci);
  }
  return {
    timeline: out,
    adjustedChapters: [...adjusted],
    splits,
    longestShotSec: Math.max(...out.map((s) => s.endSec - s.startSec)),
  };
}

const VARIANT_SUFFIX = ' A different moment of the same story: another camera angle and a closer detail, not a repeat of the previous picture.';

// Pure. Gives each named chapter more scenes. The chapter's slots are recomputed for the new count
// (the same rule the planner used); each slot keeps the prompt of the old scene it overlaps most, and
// a second slot over the same old scene gets that prompt plus a "different angle" line, so only the
// added scenes need a new picture.
export function addScenesToChapters(
  plan: ProductionPlan,
  chapters: Array<{ text: string }>,
  splits: ChapterSplit[],
): ProductionPlan {
  if (!plan.longScenes || splits.length === 0) return plan;
  const wanted = new Map(splits.map((s) => [s.chapterIndex, s.neededCount]));
  const nextScenes: NonNullable<ProductionPlan['longScenes']> = [];
  const nextMeanings: NonNullable<ProductionPlan['sceneMeanings']>['scenes'] = [];

  for (let ci = 0; ci < chapters.length; ci += 1) {
    const oldIdx = plan.longScenes.map((s, i) => (s.chapterIndex === ci ? i : -1)).filter((i) => i >= 0);
    const oldMeanings = plan.sceneMeanings ? oldIdx.map((i) => plan.sceneMeanings!.scenes[i]) : [];
    const target = wanted.get(ci);
    if (!target || target <= oldIdx.length) {
      oldIdx.forEach((i) => {
        nextScenes.push(plan.longScenes![i]);
        if (plan.sceneMeanings) nextMeanings.push(plan.sceneMeanings.scenes[i]);
      });
      continue;
    }
    const slots = chapterSceneSlots(chapters[ci].text, target);
    const usedSources = new Set<number>();
    slots.forEach((slot, j) => {
      // The old scene whose span (or, without spans, whose position) covers this slot's start.
      let source = oldIdx.length - 1;
      if (oldMeanings.length) {
        const found = oldMeanings.findIndex((m) => slot.startWord >= m.narrationSpan.startWord && slot.startWord < m.narrationSpan.endWordExclusive);
        if (found >= 0) source = found;
      } else {
        source = Math.min(oldIdx.length - 1, Math.floor((j * oldIdx.length) / target));
      }
      const base = plan.longScenes![oldIdx[source]];
      const reuse = !usedSources.has(source);
      usedSources.add(source);
      nextScenes.push({ chapterIndex: ci, words: slot.anchor, prompt: reuse ? base.prompt : `${base.prompt}${VARIANT_SUFFIX}` });
      if (plan.sceneMeanings) {
        nextMeanings.push({
          sceneId: `${ci}:${j}`,
          narrationSpan: { chapterIndex: ci, startWord: slot.startWord, endWordExclusive: slot.endWordExclusive },
          purpose: oldMeanings[source]?.purpose ?? 'unspecified',
        });
      }
    });
  }
  return {
    ...plan,
    longScenes: nextScenes,
    stillScenePrompts: nextScenes.map((s) => s.prompt),
    ...(plan.sceneMeanings && { sceneMeanings: { version: 1 as const, scenes: nextMeanings } }),
  };
}
