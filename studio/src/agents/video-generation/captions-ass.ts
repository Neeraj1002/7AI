import fs from 'node:fs';
import path from 'node:path';
import type { TranscriptSegment } from '../../media';
import { DATA_DIR } from '../../config/paths';
import { NonTransientStageError } from '../../run-pipeline/retry-with-backoff';
import { QUALITY_SPEC } from './quality-spec';
import type { CaptionStyle } from './plan';

// Sprint 4 Task 8 (R2) — ASS caption writer + script/Whisper alignment.
//
// Why ASS instead of the old SRT: libass renders SRT with a default 288px-tall
// PlayRes, so `Fontsize=48` became ~320 real px and `MarginV=200` landed ~70%
// up the frame. An .ass file declares PlayResX/Y = 1080x1920, so every size and
// margin below is in real output pixels.
//
// Why script-aligned text: Whisper words have no punctuation and misspell
// names. The narration is TTS of the sanctioned script, so the script is the
// truth for TEXT; Whisper is used only for TIMING.

export const FONTS_DIR = path.resolve(DATA_DIR, 'fonts');
export const CAPTION_FONT_FILE = 'Montserrat-ExtraBold.ttf';
// libass matches by the font's family name as recorded inside the file.
export const CAPTION_FONT_FAMILY = 'Montserrat ExtraBold';

const { captions } = QUALITY_SPEC;
const MARGIN_LR = captions.safeMarginX;
export const SAFE_WIDTH_PX = captions.playResX - 2 * MARGIN_LR;
const OUTLINE_PX = 7;
const SHADOW_PX = 3;
// R7 hook line: big enough to read at phone size, two lines at most for eight words.
const HOOK_FONT_PX = 92;
const HOOK_MARGIN_TOP_PX = 330;
// Centre of the caption block, inside the 45%-70% band of the quality spec.
const CAPTION_CENTER_Y = Math.round(captions.playResY * 0.57);

// Real output pixels per style (PlayRes 1080x1920).
export function captionFontSizePx(style: CaptionStyle): number {
  switch (style) {
    case 'word-flash':
      return 110;
    case 'phrase-grouped':
      return 90;
    case 'sentence-grouped':
      return 72;
    default: {
      const exhaustive: never = style;
      throw new Error(`Unknown caption style '${exhaustive as string}'`);
    }
  }
}

// ---------------------------------------------------------------------------
// Font metrics (minimal TrueType reader: head.unitsPerEm, hhea, hmtx, cmap fmt 4)
// ---------------------------------------------------------------------------

export type FontMetrics = {
  unitsPerEm: number;
  advanceFor: (codePoint: number) => number;
};

export function parseFontMetrics(buf: Buffer): FontMetrics {
  const numTables = buf.readUInt16BE(4);
  const tables = new Map<string, number>();
  for (let i = 0; i < numTables; i += 1) {
    const rec = 12 + i * 16;
    tables.set(buf.toString('ascii', rec, rec + 4), buf.readUInt32BE(rec + 8));
  }
  const need = (tag: string): number => {
    const off = tables.get(tag);
    if (off === undefined) throw new Error(`font is missing required '${tag}' table`);
    return off;
  };
  const head = need('head');
  const hhea = need('hhea');
  const hmtx = need('hmtx');
  const cmap = need('cmap');
  const unitsPerEm = buf.readUInt16BE(head + 18);
  const numHMetrics = buf.readUInt16BE(hhea + 34);

  // Find a Unicode format-4 subtable.
  const nSub = buf.readUInt16BE(cmap + 2);
  let fmt4 = -1;
  for (let i = 0; i < nSub; i += 1) {
    const rec = cmap + 4 + i * 8;
    const platform = buf.readUInt16BE(rec);
    const encoding = buf.readUInt16BE(rec + 2);
    const sub = cmap + buf.readUInt32BE(rec + 4);
    if (buf.readUInt16BE(sub) === 4 && (platform === 0 || (platform === 3 && encoding === 1))) {
      fmt4 = sub;
      break;
    }
  }
  if (fmt4 === -1) throw new Error('font has no Unicode cmap format-4 subtable');
  const segCount = buf.readUInt16BE(fmt4 + 6) / 2;
  const endCodes = fmt4 + 14;
  const startCodes = endCodes + segCount * 2 + 2;
  const idDeltas = startCodes + segCount * 2;
  const idRangeOffsets = idDeltas + segCount * 2;

  const glyphFor = (cp: number): number => {
    if (cp > 0xffff) return 0;
    for (let i = 0; i < segCount; i += 1) {
      if (cp > buf.readUInt16BE(endCodes + i * 2)) continue;
      if (cp < buf.readUInt16BE(startCodes + i * 2)) return 0;
      const rangeOffset = buf.readUInt16BE(idRangeOffsets + i * 2);
      const delta = buf.readInt16BE(idDeltas + i * 2);
      if (rangeOffset === 0) return (cp + delta) & 0xffff;
      const glyphAddr = idRangeOffsets + i * 2 + rangeOffset + (cp - buf.readUInt16BE(startCodes + i * 2)) * 2;
      const g = buf.readUInt16BE(glyphAddr);
      return g === 0 ? 0 : (g + delta) & 0xffff;
    }
    return 0;
  };

  const advanceForGlyph = (g: number): number =>
    buf.readUInt16BE(hmtx + Math.min(g, numHMetrics - 1) * 4);

  return {
    unitsPerEm,
    advanceFor: (cp) => advanceForGlyph(glyphFor(cp)),
  };
}

let cachedMetrics: FontMetrics | undefined;
export function loadCaptionFontMetrics(): FontMetrics {
  if (!cachedMetrics) {
    cachedMetrics = parseFontMetrics(fs.readFileSync(path.join(FONTS_DIR, CAPTION_FONT_FILE)));
  }
  return cachedMetrics;
}

// Rendered width in px, including the outline on both sides. Kerning (GPOS) is
// not applied, so a small safety factor is added; kerning only ever tightens.
export function measureTextWidthPx(text: string, fontSizePx: number, metrics = loadCaptionFontMetrics()): number {
  let units = 0;
  for (const ch of text) units += metrics.advanceFor(ch.codePointAt(0) as number);
  return (units / metrics.unitsPerEm) * fontSizePx * 1.03 + 2 * OUTLINE_PX;
}

// Largest size <= baseSize at which the longest word of `text` fits SAFE_WIDTH_PX.
// A single word can't wrap, so it must be shrunk (libass would otherwise run it
// off the frame edge — the "ousand"/"olynesia" clipping in the published videos).
export function fitFontSizePx(text: string, baseSizePx: number, metrics = loadCaptionFontMetrics()): number {
  const longest = text.split(/\s+/).reduce((a, b) => (b.length > a.length ? b : a), '');
  const width = measureTextWidthPx(longest, baseSizePx, metrics);
  if (width <= SAFE_WIDTH_PX) return baseSizePx;
  // width = glyphs(px-proportional) + a constant outline term, so solve for the
  // glyph budget rather than scaling the whole width.
  const glyphWidthPerPx = (width - 2 * OUTLINE_PX) / baseSizePx;
  return Math.max(24, Math.floor((SAFE_WIDTH_PX - 2 * OUTLINE_PX) / glyphWidthPerPx));
}

// Fail fast on a deploy problem: libass silently falls back to some other font
// when the file is missing, which would ship wrong-looking captions.
export function assertCaptionFontPresent(): void {
  const fontPath = path.join(FONTS_DIR, CAPTION_FONT_FILE);
  if (!fs.existsSync(fontPath)) {
    throw new NonTransientStageError(
      `Bundled caption font missing at ${fontPath} — deploy problem (studio/data/fonts/ must ship with the app)`,
    );
  }
}

// ---------------------------------------------------------------------------
// Script <-> Whisper alignment
// ---------------------------------------------------------------------------

export function normalizeToken(word: string): string {
  return word.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

export type TimedWord = TranscriptSegment;

// Takes the script's words (punctuation/casing intact) and gives each the
// timing of the Whisper word it matches, via an LCS over normalised tokens.
//  - matched script word        -> that Whisper word's timing
//  - run of script words between two matches with Whisper words in between
//    (e.g. "2,000" heard as "two thousand") -> spread across that Whisper span
//  - run of script words with no Whisper words at all (a missed word) ->
//    interpolated across the gap between the neighbouring matches
//  - Whisper words with no script counterpart (extras/hallucinations) -> dropped:
//    the narration is TTS of the script, so they carry no script text
// If fewer than half of the script words match, the script and the audio have
// diverged too far to trust the alignment; Whisper's own words are returned.
export function alignScriptToWhisper(scriptText: string, whisper: TranscriptSegment[]): TimedWord[] {
  const scriptWords = scriptText.split(/\s+/).filter((w) => normalizeToken(w).length > 0);
  if (scriptWords.length === 0 || whisper.length === 0) return whisper;

  const a = scriptWords.map(normalizeToken);
  const b = whisper.map((w) => normalizeToken(w.text));
  const n = a.length;
  const m = b.length;

  // LCS table.
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const matches: Array<[number, number]> = [];
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (a[i] === b[j]) {
      matches.push([i, j]);
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }
  if (matches.length * 2 < n) return whisper;

  const out: TimedWord[] = new Array<TimedWord>(n);
  const audioStart = whisper[0].startMs;
  const audioEnd = whisper[m - 1].endMs;

  // Anchors with sentinels so every gap has a left and right neighbour.
  const anchors: Array<[number, number]> = [[-1, -1], ...matches, [n, m]];
  for (let k = 0; k < anchors.length; k += 1) {
    const [si, wj] = anchors[k];
    if (si >= 0 && si < n) {
      out[si] = { text: scriptWords[si], startMs: whisper[wj].startMs, endMs: whisper[wj].endMs };
    }
    if (k === anchors.length - 1) break;
    const [nextSi, nextWj] = anchors[k + 1];
    const gapScript = nextSi - si - 1;
    if (gapScript <= 0) continue;
    // Time span available to the gap's script words.
    const hasWhisperInGap = nextWj - wj - 1 > 0;
    const spanStart = hasWhisperInGap
      ? whisper[wj + 1].startMs
      : wj >= 0
        ? whisper[wj].endMs
        : audioStart;
    const spanEnd = hasWhisperInGap
      ? whisper[nextWj - 1].endMs
      : nextWj < m
        ? whisper[nextWj].startMs
        : audioEnd;
    const span = Math.max(gapScript, spanEnd - spanStart); // never zero-length
    for (let g = 0; g < gapScript; g += 1) {
      const idx = si + 1 + g;
      out[idx] = {
        text: scriptWords[idx],
        startMs: Math.round(spanStart + (span * g) / gapScript),
        endMs: Math.round(spanStart + (span * (g + 1)) / gapScript),
      };
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Cue grouping (script words with punctuation, so sentence-grouped now works)
// ---------------------------------------------------------------------------

function mergeWords(words: TimedWord[]): TimedWord & { words: TimedWord[] } {
  return {
    text: words.map((w) => w.text).join(' '),
    startMs: words[0].startMs,
    endMs: words[words.length - 1].endMs,
    words,
  };
}

export type CaptionCue = TimedWord & { words: TimedWord[] };

export function groupCaptionCues(words: TimedWord[], style: CaptionStyle): CaptionCue[] {
  const cues: CaptionCue[] = [];
  if (style === 'word-flash') return words.map((w) => mergeWords([w]));
  if (style === 'phrase-grouped') {
    for (let i = 0; i < words.length; i += 4) cues.push(mergeWords(words.slice(i, i + 4)));
    return cues;
  }
  let current: TimedWord[] = [];
  for (const w of words) {
    current.push(w);
    if (/[.!?]["')\]]*$/.test(w.text.trim()) || current.length >= 8) {
      cues.push(mergeWords(current));
      current = [];
    }
  }
  if (current.length > 0) cues.push(mergeWords(current));
  return cues;
}

// ---------------------------------------------------------------------------
// ASS writer
// ---------------------------------------------------------------------------

function assTimestamp(ms: number): string {
  const cs = Math.max(0, Math.round(ms / 10));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${c.toString().padStart(2, '0')}`;
}

function escapeAssText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\{/g, '(').replace(/\}/g, ')').replace(/\r?\n/g, ' ');
}

// BGR colour as ASS expects: &HAABBGGRR.
const WHITE = '&H00FFFFFF';
const HIGHLIGHT = '&H0000D7FF'; // warm yellow
const BLACK = '&H00000000';
const SHADOW_COLOUR = '&H96000000';

export type AssBuildResult = { ass: string; cueCount: number; karaoke: boolean };

export function buildAss(params: {
  words: TimedWord[];
  style: CaptionStyle;
  metrics?: FontMetrics;
  // Bugs Closure 2 (P8) - keeps the last caption on screen this long after its
  // last word, so it stays up through the end tail.
  holdLastCueMs?: number;
  // Sprint 6 Task 1 R7: a line drawn from the first frame for `seconds`, near the top, above the caption band.
  hook?: { text: string; seconds: number };
}): AssBuildResult {
  const baseSize = captionFontSizePx(params.style);
  const karaoke = params.style !== 'word-flash';
  const styleLine = (name: string, primary: string, secondary: string): string =>
    `Style: ${name},${CAPTION_FONT_FAMILY},${baseSize},${primary},${secondary},${BLACK},${SHADOW_COLOUR},0,0,0,0,100,100,0,0,1,${OUTLINE_PX},${SHADOW_PX},5,${MARGIN_LR},${MARGIN_LR},0,1`;

  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${captions.playResX}`,
    `PlayResY: ${captions.playResY}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    'YCbCr Matrix: None',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    // Plain: solid white. Karaoke: words start white (Secondary) and fill to the
    // highlight colour (Primary) as each is spoken (\k tags below).
    styleLine('Plain', WHITE, WHITE),
    styleLine('Karaoke', HIGHLIGHT, WHITE),
    // The hook: top-centre (alignment 8), clear of the caption band (45% to 70% of the height) and the watermark corner.
    `Style: Hook,${CAPTION_FONT_FAMILY},${HOOK_FONT_PX},${WHITE},${WHITE},${BLACK},${SHADOW_COLOUR},0,0,0,0,100,100,0,0,1,${OUTLINE_PX},${SHADOW_PX},8,${MARGIN_LR},${MARGIN_LR},${HOOK_MARGIN_TOP_PX},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  const cues = groupCaptionCues(params.words, params.style);
  const events = cues.map((cue, cueIndex) => {
    const endMs = cueIndex === cues.length - 1 ? cue.endMs + (params.holdLastCueMs ?? 0) : cue.endMs;
    const size = fitFontSizePx(cue.text, baseSize, params.metrics);
    const sizeTag = size === baseSize ? '' : `\\fs${size}`;
    const tags = `{\\an5\\pos(${captions.playResX / 2},${CAPTION_CENTER_Y})${sizeTag}}`;
    let body: string;
    if (karaoke) {
      body = cue.words
        .map((w, i) => {
          // Karaoke duration runs to the next word's start so the fill is
          // continuous across small gaps; the last word ends with the cue.
          const next = cue.words[i + 1];
          const dur = Math.max(1, Math.round(((next ? next.startMs : w.endMs) - w.startMs) / 10));
          return `{\\kf${dur}}${escapeAssText(w.text)}`;
        })
        .join(' ');
    } else {
      body = escapeAssText(cue.text);
    }
    return `Dialogue: 0,${assTimestamp(cue.startMs)},${assTimestamp(endMs)},${karaoke ? 'Karaoke' : 'Plain'},,0,0,0,,${tags}${body}`;
  });

  const hookEvents = params.hook?.text
    ? [`Dialogue: 1,${assTimestamp(0)},${assTimestamp(Math.round(params.hook.seconds * 1000))},Hook,,0,0,0,,{\\fad(0,300)}${escapeAssText(params.hook.text)}`]
    : [];
  return { ass: [...header, ...hookEvents, ...events, ''].join('\n'), cueCount: cues.length, karaoke };
}
