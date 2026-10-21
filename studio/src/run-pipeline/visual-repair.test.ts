import { afterEach, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildEvidencePacket, factualBaseline } from '../content-evidence/packet';
import type { ProductionPlan } from '../agents/video-generation/plan';
import { chapterSegmentPath } from '../agents/video-generation/long-render';
import { renderProfileFor } from '../agents/video-generation/render-profile';
import { assertUnder, prepareVisualRepair, recoverRepairReceipt, resolveDefect,
  saveRepairReceipt, sha256Bytes, type SceneMapping } from './visual-repair';
import { executeVisualRepair } from './visual-repair-render';
import { NonTransientStageError } from './retry-with-backoff';
import { buildStyledScenePrompts } from '../agents/video-generation/scene-prompts';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true }))); });
const fact = factualBaseline(buildEvidencePacket({ briefText: 'Approved bridge fact.', factPolicy: 'brief-only' }), 'Approved script');
const plan: ProductionPlan = {
  visualSource: 'ai-stills', stockFootageQuery: 'bridge', captionStyle: 'sentence-grouped', audioLayer: 'none',
  pacingNotes: 'two beats', rationale: 'mapped',
  stillScenePrompts: ['red bridge', 'blue bridge'],
  longScenes: [{ chapterIndex: 0, words: 'red bridge', prompt: 'red bridge' },
    { chapterIndex: 1, words: 'blue bridge', prompt: 'blue bridge' }],
  sceneMeanings: { version: 1, scenes: [
    { sceneId: '0:0', narrationSpan: { chapterIndex: 0, startWord: 0, endWordExclusive: 2 }, purpose: 'illustration' },
    { sceneId: '1:0', narrationSpan: { chapterIndex: 1, startWord: 0, endWordExclusive: 2 }, purpose: 'illustration' },
  ] },
};
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'task5-eligibility-'));
  roots.push(root);
  const out = path.join(root, 'run-1');
  const cache = path.join(root, 'cache');
  await fs.mkdir(path.join(out, 'work'), { recursive: true });
  await fs.mkdir(cache);
  const images = [path.join(cache, 'red.png'), path.join(cache, 'blue.png')];
  await fs.writeFile(images[0], 'red image'); await fs.writeFile(images[1], 'blue image');
  const mapping: SceneMapping = { version: 1, fps: 30, scenes: images.map((imagePath, i) => ({
    sceneId: `${i}:0`, chapterIndex: i, imagePath, imageSha256: sha256Bytes(i ? 'blue image' : 'red image'),
    promptSha256: sha256Bytes(i ? 'blue bridge' : 'red bridge'), styledPromptSha256: sha256Bytes(buildStyledScenePrompts([i ? 'blue bridge' : 'red bridge'], {})[0]),
    sourceSceneId: `${i}:0`, substituted: false, frameStart: i * 30, frameEndExclusive: (i + 1) * 30,
    startSec: i, endSec: i + 1, anchor: i ? 'blue bridge' : 'red bridge',
  })) };
  const unchangedChapterPath = chapterSegmentPath({ chapterIndex: 0,
    scenes: [{ sceneIndex: 0, imagePath: images[0], imageSha256: mapping.scenes[0].imageSha256, frames: 30 }] },
    path.join(out, 'work', 'segments'), renderProfileFor('long'));
  await fs.mkdir(path.dirname(unchangedChapterPath), { recursive: true });
  await fs.writeFile(unchangedChapterPath, 'valid unchanged chapter');
  await fs.writeFile(path.join(out, '1.scene-mapping.json'), JSON.stringify(mapping));
  await fs.writeFile(path.join(out, 'work', 'mixed-1.m4a'), 'fixed audio');
  await fs.writeFile(path.join(out, '1.srt'), 'fixed captions');
  await fs.writeFile(path.join(out, '1.transcript.json'), '{}');
  await fs.writeFile(path.join(out, '1.mp4'), 'completed baseline video');
  const input = { runId: 'run-1', baselineAttempt: 1, repairAttempt: 2,
    previousInput: { factualBaseline: fact, resolvedVoice: 'voice-a' },
    currentInput: { factualBaseline: fact, resolvedVoice: 'voice-a' },
    previousOutput: { plan, videoKind: 'long', chapterTimings: [{ title: 'a', startSec: 0, endSec: 1 }],
      videoPath: path.join(out, '1.mp4'), frameCount: 60, fps: 30, width: 1920, height: 1080 },
    defect: { sceneId: '1:0', timestampSeconds: 1.2, kind: 'continuity' as const,
      reason: 'blue subject changed outfit', requiredVisualConstraints: ['same coat'] },
    rootDir: root, inspect: async (file: string) => sha256Bytes(await fs.readFile(file)),
    inspectChapter: async () => undefined,
  };
  return { root, out, images, mapping, unchangedChapterPath, input };
}

it('selects exactly one mapped scene and binds the immutable baseline before any replacement', async () => {
  const { input, mapping } = await fixture();
  const prepared = await prepareVisualRepair(input);
  expect(prepared.receipt).toMatchObject({ sceneId: '1:0', chapterIndex: 1, status: 'intent',
    baseline: { factualFingerprint: fact.fingerprint, voice: 'voice-a' } });
  expect(resolveDefect(mapping, [{ timestampSeconds: 1.2, kind: 'continuity', reason: 'outfit', requiredVisualConstraints: [] }]).scene.sceneId).toBe('1:0');
  expect(() => resolveDefect(mapping, [{ sceneId: '0:0', timestampSeconds: 1.2, kind: 'continuity', reason: 'wrong', requiredVisualConstraints: [] }])).toThrow(/conflicts/);
  expect(() => resolveDefect(mapping, [{ sceneId: '1:0', timestampSeconds: 1.2, kind: 'continuity', reason: 'change the narration fact', requiredVisualConstraints: [] }])).toThrow(/factual/);
});

it('rejects stale evidence/script, changed voice, unknown or substituted scenes, corrupt assets and missing work files', async () => {
  const f = await fixture();
  await expect(prepareVisualRepair({ ...f.input, currentInput: { ...f.input.currentInput,
    factualBaseline: factualBaseline(buildEvidencePacket({ briefText: 'Changed', factPolicy: 'brief-only' }), 'Approved script') } })).rejects.toThrow(/fingerprint/);
  await expect(prepareVisualRepair({ ...f.input, currentInput: { ...f.input.currentInput,
    factualBaseline: factualBaseline(buildEvidencePacket({ briefText: 'Approved bridge fact.', factPolicy: 'brief-only' }), 'Changed script') } })).rejects.toThrow(/fingerprint/);
  await expect(prepareVisualRepair({ ...f.input, currentInput: { ...f.input.currentInput, resolvedVoice: 'voice-b' } })).rejects.toThrow(/voice/);
  await expect(prepareVisualRepair({ ...f.input, sceneStyle: { stylePrompt: 'new style' } })).rejects.toThrow(/style/);
  await expect(prepareVisualRepair({ ...f.input, previousOutput: { ...f.input.previousOutput, frameCount: 59 } })).rejects.toThrow(/frame total/);
  await expect(prepareVisualRepair({ ...f.input, defect: { ...f.input.defect, sceneId: '9:0' } })).rejects.toThrow(/unknown scene/);
  f.mapping.scenes[1].substituted = true;
  await fs.writeFile(path.join(f.out, '1.scene-mapping.json'), JSON.stringify(f.mapping));
  await expect(prepareVisualRepair(f.input)).rejects.toThrow(/substituted/);
  f.mapping.scenes[1].substituted = false;
  await fs.writeFile(path.join(f.out, '1.scene-mapping.json'), JSON.stringify(f.mapping));
  await fs.writeFile(f.images[1], 'corrupt');
  await expect(prepareVisualRepair(f.input)).rejects.toThrow(/baseline image changed/);
  await fs.writeFile(f.images[1], 'blue image');
  await fs.rm(path.join(f.out, 'work', 'mixed-1.m4a'));
  await expect(prepareVisualRepair(f.input)).rejects.toThrow(/missing/);
});

it('rejects missing or changed unchanged-chapter cache before replacement', async () => {
  const f = await fixture();
  await fs.rm(f.unchangedChapterPath);
  await expect(prepareVisualRepair(f.input)).rejects.toThrow(/cached unchanged chapter is missing/);
  await fs.writeFile(f.unchangedChapterPath, 'valid unchanged chapter');
  const prepared = await prepareVisualRepair(f.input);
  await fs.writeFile(f.unchangedChapterPath, 'corrupt after preflight');
  let requested = 0;
  await expect(executeVisualRepair({ prepared, baselineOutput: f.input.previousOutput as never,
    sceneStyle: {}, allowedAssetRoot: f.root, inspect: f.input.inspect,
    replacement: async () => { requested++; throw new Error('must not run'); } }))
    .rejects.toThrow(/unchanged chapter changed after eligibility check/);
  expect(requested).toBe(0);
});

it('persists and recovers accepted replacement, and rejects a mismatched receipt or escaped path', async () => {
  const f = await fixture();
  const prepared = await prepareVisualRepair(f.input);
  const replacement = { path: f.images[1], sha256: sha256Bytes('blue image'), provider: 'local', costUsd: 0 };
  const saved = { ...prepared.receipt, status: 'replacement-ready' as const, replacement };
  await saveRepairReceipt(prepared.receiptPath, saved);
  expect(await recoverRepairReceipt(prepared.receiptPath, prepared.receipt)).toEqual(saved);
  await expect(recoverRepairReceipt(prepared.receiptPath, { ...prepared.receipt, sceneId: '0:0' })).rejects.toThrow(/does not match/);
  expect(() => assertUnder(f.root, path.resolve(f.root, '..', 'outside.png'))).toThrow(/escapes/);
});

it('treats only an absent receipt as fresh intent and refuses corrupt checkpoints', async () => {
  const f = await fixture();
  const prepared = await prepareVisualRepair(f.input);
  expect(await recoverRepairReceipt(prepared.receiptPath, prepared.receipt)).toEqual(prepared.receipt);
  await fs.writeFile(prepared.receiptPath, '{broken');
  await expect(recoverRepairReceipt(prepared.receiptPath, prepared.receipt)).rejects.toThrow(/corrupt/);
  await fs.writeFile(prepared.receiptPath, '{}');
  await expect(recoverRepairReceipt(prepared.receiptPath, prepared.receipt)).rejects.toThrow(/incompatible/);
});

it.each([
  ['video', (f: Awaited<ReturnType<typeof fixture>>) => path.join(f.out, '1.mp4')],
  ['transcript', (f: Awaited<ReturnType<typeof fixture>>) => path.join(f.out, '1.transcript.json')],
  ['mixed audio', (f: Awaited<ReturnType<typeof fixture>>) => path.join(f.out, 'work', 'mixed-1.m4a')],
  ['image', (f: Awaited<ReturnType<typeof fixture>>) => f.images[0]],
])('refuses changed baseline %s before requesting a replacement', async (_label, fileFor) => {
  const f = await fixture();
  const prepared = await prepareVisualRepair(f.input);
  await fs.writeFile(fileFor(f), 'changed after preflight');
  let requested = 0;
  await expect(executeVisualRepair({ prepared, baselineOutput: f.input.previousOutput as never,
    sceneStyle: {}, allowedAssetRoot: f.root, inspect: f.input.inspect,
    replacement: async () => { requested++; throw new Error('must not run'); } }))
    .rejects.toThrow(/changed after eligibility check/);
  expect(requested).toBe(0);
});

it('keeps a moderation-refused scene unresolved after durable intent', async () => {
  const f = await fixture();
  const prepared = await prepareVisualRepair(f.input);
  await expect(executeVisualRepair({ prepared, baselineOutput: f.input.previousOutput as never,
    sceneStyle: {}, allowedAssetRoot: f.root, inspect: f.input.inspect,
    replacement: async () => { throw new NonTransientStageError('moderation refused selected scene'); } }))
    .rejects.toThrow(/moderation refused/);
  const saved = JSON.parse(await fs.readFile(prepared.receiptPath, 'utf8')) as { status: string };
  expect(saved.status).toBe('intent');
  await expect(fs.stat(path.join(f.out, '2.mp4'))).rejects.toThrow();
});

it('refuses a budget or cancellation guard before requesting a replacement', async () => {
  const f = await fixture();
  const prepared = await prepareVisualRepair(f.input);
  let requested = 0;
  await expect(executeVisualRepair({ prepared, baselineOutput: f.input.previousOutput as never,
    sceneStyle: {}, allowedAssetRoot: f.root, inspect: f.input.inspect,
    guard: async () => { throw new NonTransientStageError('budget or cancellation stop'); },
    replacement: async () => { requested++; throw new Error('must not run'); } }))
    .rejects.toThrow(/budget or cancellation/);
  expect(requested).toBe(0);
});
