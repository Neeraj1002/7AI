import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import fixture from './fixtures/scene-alignment-pre-gate.json';
import { alignSceneStarts } from './scene-alignment';
import { bindSceneAssets, createSceneMapping, sha256, validateScenePlan } from './scene-mapping';
import type { ProductionPlan, SceneMeaning } from './plan';
import { chapterSceneSlots } from './plan-long';

function synthetic(name: string) {
  const item = fixture.cases.find(c => c.name === name)!;
  const chapters = item.chapters.map(text => ({ text }));
  const chapterTimings = item.transcriptByChapter.map((_, ci) => ({ title: `C${ci}`, startSec: ci * 10, endSec: ci * 10 + 9 }));
  const words = item.transcriptByChapter.flatMap((tokens, ci) => tokens.map((text, i) => ({ text, startMs: ci * 10_000 + i * 400, endMs: ci * 10_000 + i * 400 + 350 })));
  const fixtureScenes = 'scenes' in item ? item.scenes! : [];
  const scenes = fixtureScenes.map(s => ({ chapterIndex: s.chapterIndex, words: s.anchor, prompt: `Still ${s.sceneId}` }));
  const meanings: SceneMeaning[] = fixtureScenes.map(s => ({ sceneId: s.sceneId,
    narrationSpan: { chapterIndex: s.chapterIndex, startWord: s.startWord,
      endWordExclusive: Math.min(s.endWordExclusive, chapters[s.chapterIndex].text.split(' ').length) }, purpose: 'illustration' }));
  return { chapters, chapterTimings, words, scenes, meanings };
}

describe('chapter-scoped scene identity and alignment', () => {
  it('reports fixture provenance without treating fallback as exact', () => {
    const names = ['repeated-three-word-prefix', 'repeated-complete-anchor', 'asr-omission-and-punctuation',
      'chapter-local-short-anchor', 'legacy-without-meaning', 'moderation-substitution-identity'];
    const rows = names.flatMap(name => {
      const input = synthetic(name);
      if (name === 'legacy-without-meaning') {
        const legacy = fixture.cases.find(c => c.name === name)!;
        return alignSceneStarts({ ...input, scenes: 'legacyLongScenes' in legacy ? legacy.legacyLongScenes! : [], meanings: undefined });
      }
      return alignSceneStarts(input);
    });
    expect(rows.filter(r => r.matchKind === 'exact')).toHaveLength(10);
    expect(rows.filter(r => r.matchKind === 'aligned')).toHaveLength(1);
    expect(rows.filter(r => r.matchKind === 'fallback')).toHaveLength(0);
  });
  it.each(['repeated-three-word-prefix', 'repeated-complete-anchor'])('resolves %s by its full script position', name => {
    const input = synthetic(name);
    const rows = alignSceneStarts(input);
    expect(rows.map(r => r.matchedTranscriptIndex)).toEqual(name === 'repeated-three-word-prefix' ? [0, 6] : [0, 9]);
    expect(rows.map(r => r.matchKind)).toEqual(['exact', 'exact']);
    expect(rows[1].startSec).toBeGreaterThan(rows[0].startSec);
  });
  it('marks ASR omission as alignment recovery, and normalizes punctuation', () => {
    const rows = alignSceneStarts(synthetic('asr-omission-and-punctuation'));
    expect(rows[0].matchKind).toBe('aligned');
    expect(rows[1].matchedTranscriptIndex).toBe(2);
    expect(rows[1].startSec).toBeCloseTo(1); // renderer's one-second minimum spacing
  });
  it('keeps short repeated anchors in their chapters', () => {
    const rows = alignSceneStarts(synthetic('chapter-local-short-anchor'));
    expect(rows.map(r => r.startSec)).toEqual([0, 10]);
    expect(rows.map(r => r.sceneId)).toEqual(['0:0', '1:0']);
  });
  it('supports legacy scenes and warns when an anchor needs bounded interpolation', () => {
    const input = synthetic('legacy-without-meaning');
    const legacy = fixture.cases.find(c => c.name === 'legacy-without-meaning')!;
    const scenes = 'legacyLongScenes' in legacy ? legacy.legacyLongScenes! : [];
    expect(alignSceneStarts({ ...input, scenes, meanings: undefined })[0].sceneId).toBe('0:0');
    const missing = alignSceneStarts({ ...input, scenes: [...scenes, { chapterIndex: 0, words: 'never spoken', prompt: 'missing' }], meanings: undefined });
    expect(missing[1]).toMatchObject({ matchKind: 'fallback', chapterIndex: 0 });
    expect(missing[1].warning).toContain('interpolated');
  });
  it('rejects a scene that crosses chapters or reverses their order', () => {
    const input = synthetic('chapter-local-short-anchor');
    expect(() => alignSceneStarts({ ...input, scenes: [...input.scenes].reverse(), meanings: undefined })).toThrow(/invalid chapter or order/);
    expect(() => alignSceneStarts({ ...input, meanings: [...input.meanings].reverse() })).toThrow(/meaning does not match/);
  });
});

it('binds a moderated scene to the borrowed image bytes while retaining its timed identity', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'scene-map-'));
  try {
    const p = path.join(dir, 'still.png');
    await fs.writeFile(p, 'synthetic image bytes');
    const assets = await bindSceneAssets({ sceneCount: 2, imagePaths: [p], promptIndexes: [0] });
    expect(assets[1]).toMatchObject({ sceneIndex: 1, sourceSceneIndex: 0, substituted: true, imageSha256: sha256('synthetic image bytes') });
    const input = synthetic('moderation-substitution-identity');
    const plan = { visualSource: 'ai-stills', stillScenePrompts: input.scenes.map(s => s.prompt), longScenes: input.scenes,
      sceneMeanings: { version: 1, scenes: input.meanings }, stockFootageQuery: 'crossing', captionStyle: 'sentence-grouped',
      audioLayer: 'none', pacingNotes: 'synthetic', rationale: 'synthetic' } as ProductionPlan;
    const aligned = alignSceneStarts(input);
    const timeline = aligned.map((row, i) => ({ ...row, endSec: i ? 9 : aligned[1].startSec }));
    const mapping = createSceneMapping({ plan, timeline, frames: [30, 240], assets, styledPrompts: input.scenes.map(s => s.prompt), fps: 30 });
    expect(mapping.scenes[1]).toMatchObject({ sceneId: '0:1', sourceSceneId: '0:0', substituted: true, frameStart: 30, frameEndExclusive: 270 });
    expect(mapping.scenes[1].imageSha256).toBe(mapping.scenes[0].imageSha256);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

it('invalidates scene meaning when approved narration changes', () => {
  const input = synthetic('repeated-three-word-prefix');
  const fullAnchors = chapterSceneSlots(input.chapters[0].text, 2).map(slot => slot.anchor);
  const scenes = input.scenes.map((scene, i) => ({ ...scene, words: fullAnchors[i] }));
  const plan = { visualSource: 'ai-stills', stillScenePrompts: scenes.map(s => s.prompt), longScenes: scenes,
    sceneMeanings: { version: 1, scenes: input.meanings }, stockFootageQuery: 'bridge', captionStyle: 'sentence-grouped',
    audioLayer: 'none', pacingNotes: 'synthetic', rationale: 'synthetic' } as ProductionPlan;
  expect(() => validateScenePlan(plan, input.chapters)).not.toThrow();
  expect(() => validateScenePlan(plan, [{ text: 'changed ' + input.chapters[0].text }])).toThrow(/no longer matches/);
});
