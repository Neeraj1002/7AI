import { NonTransientStageError } from '../../run-pipeline/retry-with-backoff';
import type { TranscriptSegment } from '../../media';
import type { ChapterTiming } from './long-narration';
import { normalizeToken } from './captions-ass';
import type { SceneMeaning } from './plan';

export type SceneAlignment = {
  sceneIndex: number;
  sceneId: string;
  chapterIndex: number;
  startSec: number;
  matchKind: 'exact' | 'aligned' | 'fallback';
  matchedTranscriptIndex?: number;
  warning?: string;
};

type Scene = { chapterIndex: number; words: string };
const normalized = (s: string) => s.split(/\s+/).map(normalizeToken).filter(Boolean);

// Match the approved chapter to its own transcription once. This disambiguates repeated
// scene prefixes by their position in the complete script, without crossing a chapter edge.
function scriptWordMatches(script: string, heard: string[]): Map<number, number> {
  const expected = script.trim().split(/\s+/).filter(Boolean).map(normalizeToken);
  const n = expected.length;
  const m = heard.length;
  const result = new Map<number, number>();
  if (!n || !m || n * m > 4_000_000) return result;
  const width = m + 1;
  const dp = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i * width + j] = expected[i] === heard[j]
        ? dp[(i + 1) * width + j + 1] + 1
        : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1]);
    }
  }
  for (let i = 0, j = 0; i < n && j < m;) {
    if (expected[i] === heard[j]) { result.set(i, j); i++; j++; }
    else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) i++;
    else j++;
  }
  return result;
}

export function alignSceneStarts(params: {
  scenes: Scene[];
  chapterTimings: ChapterTiming[];
  words: TranscriptSegment[];
  chapters?: Array<{ text: string }>;
  meanings?: SceneMeaning[];
}): SceneAlignment[] {
  const { scenes, chapterTimings, words, chapters, meanings } = params;
  if (meanings && meanings.length !== scenes.length) throw new NonTransientStageError('Scene meaning count does not match scene count');
  if (chapters && chapters.length !== chapterTimings.length) throw new NonTransientStageError('Chapter script and timing counts differ');
  let previousChapter = -1;
  const slots = new Map<number, number>();
  scenes.forEach((scene, i) => {
    if (scene.chapterIndex < previousChapter || scene.chapterIndex >= chapterTimings.length) {
      throw new NonTransientStageError(`Scene ${i + 1} has an invalid chapter or order`);
    }
    const slot = slots.get(scene.chapterIndex) ?? 0;
    const meaning = meanings?.[i];
    if (meaning && (meaning.sceneId !== `${scene.chapterIndex}:${slot}` || meaning.narrationSpan.chapterIndex !== scene.chapterIndex)) {
      throw new NonTransientStageError(`Scene ${i + 1} meaning does not match its chapter slot`);
    }
    slots.set(scene.chapterIndex, slot + 1);
    previousChapter = scene.chapterIndex;
  });
  const result: SceneAlignment[] = [];
  for (let ci = 0; ci < chapterTimings.length; ci++) {
    const chapter = chapterTimings[ci];
    const indexes = scenes.map((s, i) => s.chapterIndex === ci ? i : -1).filter(i => i >= 0);
    if (!indexes.length) continue;
    if (!(chapter.endSec > chapter.startSec)) throw new NonTransientStageError(`Chapter ${ci + 1} has invalid narration timing`);
    const inChapter = words.map((w, i) => ({ ...w, index: i, token: normalizeToken(w.text) }))
      .filter(w => w.token && w.startMs / 1000 >= chapter.startSec - 0.001 && w.startMs / 1000 < chapter.endSec + 0.001);
    const heard = inChapter.map(w => w.token);
    const script = chapters?.[ci]?.text;
    const scriptTokens = script ? script.trim().split(/\s+/).filter(Boolean).map(normalizeToken) : [];
    const matched = script ? scriptWordMatches(script, heard) : new Map<number, number>();
    const candidates: Array<SceneAlignment & { heardIndex?: number }> = [];
    let previousHeard = -1;
    for (let k = 0; k < indexes.length; k++) {
      const sceneIndex = indexes[k];
      const meaning = meanings?.[sceneIndex];
      const anchor = normalized(scenes[sceneIndex].words);
      const spanStart = meaning?.narrationSpan.startWord;
      const spanEnd = meaning?.narrationSpan.endWordExclusive;
      if (meaning && (spanStart! < 0 || spanEnd! > scriptTokens.length || spanEnd! <= spanStart!)) {
        throw new NonTransientStageError(`Scene ${sceneIndex + 1} has an invalid narration span`);
      }
      let hit: number | undefined;
      let kind: SceneAlignment['matchKind'] = 'fallback';
      if (k === 0) {
        if (inChapter.length) hit = 0;
        kind = anchor.length && anchor.every((word, offset) => heard[offset] === word)
          ? 'exact' : heard[0] === anchor[0] ? 'aligned' : 'fallback';
      } else if (spanStart !== undefined && matched.size) {
        // The opening word may be absent from ASR. Search a bounded part of this
        // planned span; a later match still identifies the correct scene beat.
        for (let si = spanStart; si < Math.min(spanEnd!, spanStart + 8); si++) {
          const found = matched.get(si);
          if (found !== undefined && found > previousHeard) { hit = found; break; }
        }
        if (hit !== undefined) {
          const full = anchor.length > 0 && anchor.every((word, offset) => heard[hit! + offset] === word);
          kind = hit === matched.get(spanStart) && full ? 'exact' : 'aligned';
        }
      } else if (anchor.length) {
        for (let j = previousHeard + 1; j < heard.length; j++) {
          if (anchor.every((word, offset) => heard[j + offset] === word)) { hit = j; kind = 'exact'; break; }
        }
        if (hit === undefined && anchor.length > 1) {
          for (let j = previousHeard + 1; j < heard.length; j++) {
            if (heard[j] === anchor[0] && heard[j + 1] === anchor[1]) { hit = j; kind = 'aligned'; break; }
          }
        }
      }
      if (hit !== undefined) previousHeard = hit;
      candidates.push({ sceneIndex, sceneId: meaning?.sceneId ?? `${ci}:${k}`, chapterIndex: ci,
        startSec: hit === undefined ? NaN : inChapter[hit].startMs / 1000,
        matchKind: kind, ...(hit !== undefined && inChapter[hit] ? { matchedTranscriptIndex: inChapter[hit].index, heardIndex: hit } : {}),
        ...(kind === 'fallback' ? { warning: `Scene ${sceneIndex + 1} could not be confidently matched inside chapter ${ci + 1}; timing interpolated` } : {}) });
    }
    candidates[0].startSec = chapter.startSec;
    // Only unmatched scenes are interpolated. Tight narration may require the final
    // minimum-spacing clamp, but no scene may escape its chapter.
    for (let k = 1; k < candidates.length; k++) {
      if (Number.isFinite(candidates[k].startSec)) continue;
      let left = k - 1;
      while (!Number.isFinite(candidates[left].startSec)) left--;
      let right = k + 1;
      while (right < candidates.length && !Number.isFinite(candidates[right].startSec)) right++;
      const end = right < candidates.length ? candidates[right].startSec : chapter.endSec;
      candidates[k].startSec = candidates[left].startSec + (end - candidates[left].startSec) * (k - left) / (right - left);
    }
    const gap = Math.min(1, (chapter.endSec - chapter.startSec) / candidates.length);
    for (let k = 1; k < candidates.length; k++) candidates[k].startSec = Math.max(candidates[k].startSec, candidates[k - 1].startSec + gap);
    for (let k = candidates.length - 1; k >= 1; k--) candidates[k].startSec = Math.min(candidates[k].startSec, chapter.endSec - gap * (candidates.length - k));
    result.push(...candidates.map(({ heardIndex: _unused, ...item }) => item));
  }
  return result;
}
