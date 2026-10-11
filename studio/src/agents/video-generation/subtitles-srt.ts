import { NonTransientStageError } from '../../run-pipeline/retry-with-backoff';
import { alignScriptToWhisper, normalizeToken, type TimedWord } from './captions-ass';
import type { TranscriptSegment } from '../../media';

// Sprint 4 Task 9 (R4): captions.srt for a long-form video, built from the EXACT script text with
// Whisper's word timing (Task 8's alignment). Lines of at most 42 characters, at most 2 lines,
// each cue 1 to 6 seconds. Not burned in: it is uploaded to YouTube as a caption track.

export const SRT_MAX_LINE_CHARS = 42;
export const SRT_MAX_LINES = 2;
export const SRT_MIN_CUE_SECONDS = 1;
export const SRT_MAX_CUE_SECONDS = 6;
const SRT_MAX_CUE_CHARS = SRT_MAX_LINE_CHARS * SRT_MAX_LINES;

export type SrtCue = { startMs: number; endMs: number; lines: string[] };

// Greedy wrap into lines of at most 42 characters. Returns null when it needs more than 2 lines.
function wrapLines(words: string[]): string[] | null {
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if (!line) line = w;
    else if (line.length + 1 + w.length <= SRT_MAX_LINE_CHARS) line += ` ${w}`;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines.length <= SRT_MAX_LINES ? lines : null;
}

const SENTENCE_END = /[.!?…]["'”’)\]]*$/;
const CLAUSE_END = /[,;:–—]["'”’)\]]*$/;

export function buildSrtCues(words: TimedWord[]): SrtCue[] {
  const cues: SrtCue[] = [];
  let current: TimedWord[] = [];

  const flush = () => {
    if (current.length === 0) return;
    const lines = wrapLines(current.map((w) => w.text)) ?? [current.map((w) => w.text).join(' ')];
    cues.push({ startMs: current[0].startMs, endMs: current[current.length - 1].endMs, lines });
    current = [];
  };

  for (let i = 0; i < words.length; i += 1) {
    const w = words[i];
    const tentative = [...current, w];
    const fitsText = wrapLines(tentative.map((x) => x.text)) !== null;
    const spanMs = w.endMs - (current[0]?.startMs ?? w.startMs);
    if (current.length > 0 && (!fitsText || spanMs > SRT_MAX_CUE_SECONDS * 1000)) flush();
    current.push(w);
    const dur = current[current.length - 1].endMs - current[0].startMs;
    const chars = current.map((x) => x.text).join(' ').length;
    // Break at the end of a sentence once a cue has real length; at a comma once it is well filled.
    if (SENTENCE_END.test(w.text) && dur >= 1500) flush();
    else if (CLAUSE_END.test(w.text) && dur >= 2500 && chars >= SRT_MAX_CUE_CHARS * 0.6) flush();
  }
  flush();

  // Enforce 1 s minimum: merge a too-short cue into a neighbour when the text still fits, else hold it.
  const merged: SrtCue[] = [];
  for (const cue of cues) {
    const prev = merged[merged.length - 1];
    if (prev && cue.endMs - cue.startMs < SRT_MIN_CUE_SECONDS * 1000) {
      const combined = wrapLines([...prev.lines, ...cue.lines].join(' ').split(' '));
      if (combined && cue.endMs - prev.startMs <= SRT_MAX_CUE_SECONDS * 1000) {
        prev.lines = combined;
        prev.endMs = cue.endMs;
        continue;
      }
    }
    merged.push({ ...cue });
  }
  // Times must be strictly increasing: a cue may never start before the previous one ends.
  for (let i = 0; i < merged.length; i += 1) {
    const cue = merged[i];
    if (i > 0 && cue.startMs < merged[i - 1].endMs) cue.startMs = merged[i - 1].endMs;
    if (cue.endMs - cue.startMs < SRT_MIN_CUE_SECONDS * 1000) {
      const next = merged[i + 1];
      cue.endMs = Math.min(cue.startMs + SRT_MIN_CUE_SECONDS * 1000, next ? next.startMs : Infinity);
    }
    if (cue.endMs <= cue.startMs) cue.endMs = cue.startMs + 1;
  }
  return merged;
}

function srtTime(ms: number): string {
  const t = Math.max(0, Math.round(ms));
  const h = Math.floor(t / 3_600_000);
  const m = Math.floor((t % 3_600_000) / 60_000);
  const s = Math.floor((t % 60_000) / 1000);
  const r = t % 1000;
  const p = (n: number, l = 2) => n.toString().padStart(l, '0');
  return `${p(h)}:${p(m)}:${p(s)},${p(r, 3)}`;
}

export function formatSrt(cues: SrtCue[]): string {
  return cues.map((c, i) => `${i + 1}\n${srtTime(c.startMs)} --> ${srtTime(c.endMs)}\n${c.lines.join('\n')}\n`).join('\n');
}

// The whole step: aligns the script's own words to Whisper's timings and writes the SRT. If the
// alignment cannot be trusted (the audio and the script have diverged) it fails loudly instead of
// producing captions that do not match the script.
export function buildSrtFromScript(scriptText: string, whisper: TranscriptSegment[]): { srt: string; cues: SrtCue[] } {
  const scriptWords = scriptText.split(/\s+/).filter((w) => normalizeToken(w).length > 0);
  const aligned = alignScriptToWhisper(scriptText, whisper);
  if (aligned.length !== scriptWords.length || aligned.some((w, i) => w.text !== scriptWords[i])) {
    throw new NonTransientStageError(
      'Subtitles could not be built: the narration audio does not match the script closely enough to time the script text. The video was not produced.',
    );
  }
  const cues = buildSrtCues(aligned);
  return { srt: formatSrt(cues), cues };
}

export type ParsedSrt = { cues: Array<{ index: number; startMs: number; endMs: number; text: string }> };

export function parseSrt(srt: string): ParsedSrt {
  const blocks = srt.replace(/\r\n/g, '\n').trim().split(/\n{2,}/);
  const cues = blocks.map((block) => {
    const [indexLine, timeLine, ...textLines] = block.split('\n');
    const m = /^(\d+):(\d{2}):(\d{2}),(\d{3}) --> (\d+):(\d{2}):(\d{2}),(\d{3})$/.exec(timeLine ?? '');
    if (!m || !/^\d+$/.test(indexLine ?? '')) throw new Error(`Malformed SRT block: ${block.slice(0, 60)}`);
    const ms = (h: string, mi: string, s: string, r: string) => ((+h * 60 + +mi) * 60 + +s) * 1000 + +r;
    return { index: +indexLine, startMs: ms(m[1], m[2], m[3], m[4]), endMs: ms(m[5], m[6], m[7], m[8]), text: textLines.join('\n') };
  });
  return { cues };
}
