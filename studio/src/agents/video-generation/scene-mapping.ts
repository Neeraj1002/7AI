import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { NonTransientStageError } from '../../run-pipeline/retry-with-backoff';
import { chapterSceneSlots } from './plan-long';
import { ProductionPlanSchema, type ProductionPlan } from './plan';
import type { TimedScene } from './long-render';

export const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

export function validateScenePlan(plan: ProductionPlan, chapters: Array<{ text: string }>): void {
  const parsed = ProductionPlanSchema.safeParse(plan);
  if (!parsed.success) throw new NonTransientStageError(`Invalid production plan: ${parsed.error.issues[0]?.message}`);
  const scenes = plan.longScenes ?? [];
  if (!scenes.length) throw new NonTransientStageError('Long-form production plan has no scenes');
  let previous = -1;
  const counts = chapters.map(() => 0);
  scenes.forEach((scene, i) => {
    if (scene.chapterIndex < previous || scene.chapterIndex >= chapters.length) {
      throw new NonTransientStageError(`Scene ${i + 1} has an invalid chapter or order`);
    }
    counts[scene.chapterIndex]++;
    previous = scene.chapterIndex;
  });
  counts.forEach((count, ci) => {
    if (!count) throw new NonTransientStageError(`Chapter ${ci + 1} has no scenes`);
    if (!plan.sceneMeanings) return; // compatible legacy plans retain anchor matching
    const slots = chapterSceneSlots(chapters[ci].text, count);
    plan.sceneMeanings.scenes.filter(m => m.narrationSpan.chapterIndex === ci).forEach((m, slot) => {
      const scene = scenes.filter(s => s.chapterIndex === ci)[slot];
      if (m.narrationSpan.startWord !== slots[slot]?.startWord || m.narrationSpan.endWordExclusive !== slots[slot]?.endWordExclusive) {
        throw new NonTransientStageError(`Scene ${m.sceneId} narration span no longer matches the approved chapter`);
      }
      if (scene.words !== slots[slot].anchor) {
        throw new NonTransientStageError(`Scene ${m.sceneId} anchor no longer matches the approved chapter`);
      }
    });
  });
}

export type BoundSceneAsset = {
  sceneIndex: number;
  imagePath: string;
  imageSha256: string;
  sourceSceneIndex: number;
  substituted: boolean;
};

export async function bindSceneAssets(params: {
  sceneCount: number;
  imagePaths: string[];
  promptIndexes?: number[];
}): Promise<BoundSceneAsset[]> {
  const source = new Array<number | undefined>(params.sceneCount).fill(undefined);
  const paths = new Array<string | undefined>(params.sceneCount).fill(undefined);
  const indexes = params.promptIndexes ?? params.imagePaths.map((_, i) => i);
  if (indexes.length !== params.imagePaths.length) throw new NonTransientStageError('Still prompt indexes do not match generated images');
  indexes.forEach((index, k) => {
    if (!Number.isInteger(index) || index < 0 || index >= params.sceneCount || paths[index]) {
      throw new NonTransientStageError('Still prompt indexes are duplicated or out of range');
    }
    paths[index] = params.imagePaths[k];
    source[index] = index;
  });
  for (let i = 1; i < paths.length; i++) if (!paths[i]) { paths[i] = paths[i - 1]; source[i] = source[i - 1]; }
  for (let i = paths.length - 2; i >= 0; i--) if (!paths[i]) { paths[i] = paths[i + 1]; source[i] = source[i + 1]; }
  if (paths.some(p => !p)) throw new NonTransientStageError('No usable generated still exists for the long-form plan');
  const hashes = new Map<string, string>();
  return Promise.all(paths.map(async (p, i) => {
    const imagePath = p!;
    let imageSha256 = hashes.get(imagePath);
    if (!imageSha256) { imageSha256 = sha256(await fs.readFile(imagePath)); hashes.set(imagePath, imageSha256); }
    return { sceneIndex: i, imagePath, imageSha256, sourceSceneIndex: source[i]!, substituted: source[i] !== i };
  }));
}

export function createSceneMapping(params: {
  plan: ProductionPlan;
  timeline: TimedScene[];
  frames: number[];
  assets: BoundSceneAsset[];
  styledPrompts: string[];
  fps: number;
}) {
  let frameStart = 0;
  return { version: 1 as const, fps: params.fps, scenes: params.timeline.map((scene, i) => {
    const planScene = params.plan.longScenes![i];
    const asset = params.assets[i];
    const frameEndExclusive = frameStart + params.frames[i];
    const row = {
      sceneId: scene.sceneId,
      chapterIndex: scene.chapterIndex,
      narrationSpan: params.plan.sceneMeanings?.scenes[i]?.narrationSpan ?? null,
      purpose: params.plan.sceneMeanings?.scenes[i]?.purpose ?? 'unspecified',
      anchor: planScene.words,
      promptSha256: sha256(planScene.prompt),
      styledPromptSha256: sha256(params.styledPrompts[i]),
      startSec: scene.startSec,
      endSec: scene.endSec,
      matchKind: scene.matchKind,
      matchedTranscriptIndex: scene.matchedTranscriptIndex ?? null,
      warning: scene.warning ?? null,
      imagePath: asset.imagePath,
      imageSha256: asset.imageSha256,
      sourceSceneId: params.timeline[asset.sourceSceneIndex].sceneId,
      substituted: asset.substituted,
      frameStart,
      frameEndExclusive,
    };
    frameStart = frameEndExclusive;
    return row;
  }) };
}
