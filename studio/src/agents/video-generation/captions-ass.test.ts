import { describe, it, expect } from 'vitest';
import {
  alignScriptToWhisper,
  buildAss,
  captionFontSizePx,
  fitFontSizePx,
  groupCaptionCues,
  measureTextWidthPx,
  SAFE_WIDTH_PX,
} from './captions-ass';
import type { TranscriptSegment } from '../../media';

function w(text: string, startMs: number, endMs: number): TranscriptSegment {
  return { text, startMs, endMs };
}

describe('buildAss', () => {
  const words = [w('Octopuses', 0, 500), w('have', 500, 800), w('three', 800, 1100), w('hearts.', 1100, 1700)];

  it('declares a 1080x1920 PlayRes so every size/margin is in real output pixels', () => {
    const { ass } = buildAss({ words, style: 'phrase-grouped' });
    expect(ass).toContain('PlayResX: 1080');
    expect(ass).toContain('PlayResY: 1920');
    expect(ass).toContain('WrapStyle: 0');
  });

  it('uses the per-style pixel sizes and a >=90px safe margin with a thick outline', () => {
    expect(captionFontSizePx('word-flash')).toBe(110);
    expect(captionFontSizePx('phrase-grouped')).toBe(90);
    expect(captionFontSizePx('sentence-grouped')).toBe(72);
    const { ass } = buildAss({ words, style: 'phrase-grouped' });
    const styleLine = ass.split('\n').find((l) => l.startsWith('Style: Plain'))!;
    const f = styleLine.replace('Style: ', '').split(',');
    expect(Number(f[2])).toBe(90); // Fontsize
    expect(Number(f[16])).toBeGreaterThanOrEqual(6); // Outline
    expect(Number(f[19])).toBeGreaterThanOrEqual(90); // MarginL
    expect(Number(f[20])).toBeGreaterThanOrEqual(90); // MarginR
  });

  it('centres each cue in the 45%-70% band and carries the script text with its punctuation', () => {
    const { ass, cueCount } = buildAss({ words, style: 'phrase-grouped' });
    expect(cueCount).toBe(1);
    const dialogue = ass.split('\n').find((l) => l.startsWith('Dialogue'))!;
    const y = Number(/\pos\(540,(\d+)\)/.exec(dialogue)![1]);
    expect(y / 1920).toBeGreaterThanOrEqual(0.45);
    expect(y / 1920).toBeLessThanOrEqual(0.7);
    expect(dialogue).toContain('hearts.');
  });

  it('word-flash uses the plain style (no karaoke tags); grouped styles use karaoke fill', () => {
    expect(buildAss({ words, style: 'word-flash' }).ass).not.toContain('\\kf');
    expect(buildAss({ words, style: 'sentence-grouped' }).karaoke).toBe(true);
  });
});

describe('long-word safe-width fit', () => {
  const fixtureScript =
    'Hemocyanin makes octopus blood blue. Extraordinarily, pseudopseudohypoparathyroidism is rare. Antidisestablishmentarianism too.';

  it('every word of a fixture script fits inside the safe width at the fitted size, for every style', () => {
    for (const style of ['word-flash', 'phrase-grouped', 'sentence-grouped'] as const) {
      const base = captionFontSizePx(style);
      for (const word of fixtureScript.split(/\s+/)) {
        const size = fitFontSizePx(word, base);
        expect(size).toBeLessThanOrEqual(base);
        expect(measureTextWidthPx(word, size)).toBeLessThanOrEqual(SAFE_WIDTH_PX);
      }
    }
  });

  it('shrinks only when needed: a normal word keeps the style size, an absurd one shrinks', () => {
    expect(fitFontSizePx('hearts', 110)).toBe(110);
    expect(fitFontSizePx('Antidisestablishmentarianism', 110)).toBeLessThan(110);
  });

  it('writes a \fs override into the cue that needed shrinking', () => {
    const { ass } = buildAss({
      words: [w('Antidisestablishmentarianism', 0, 1500)],
      style: 'word-flash',
    });
    expect(ass).toMatch(/\\fs\d+/);
  });
});

describe('alignScriptToWhisper', () => {
  it('uses script spelling/punctuation with Whisper timings', () => {
    const whisper = [w('hemo', 0, 300), w('cyanine', 300, 800), w('is', 800, 900), w('blue', 900, 1300)];
    const out = alignScriptToWhisper('Hemocyanin is blue.', whisper);
    expect(out.map((x) => x.text)).toEqual(['Hemocyanin', 'is', 'blue.']);
    // The substituted word spans the two Whisper words it replaces.
    expect(out[0]).toMatchObject({ startMs: 0, endMs: 800 });
    expect(out[2]).toMatchObject({ startMs: 900, endMs: 1300 });
  });

  it('keeps a script word Whisper missed, interpolating its timing between neighbours', () => {
    const whisper = [w('the', 0, 200), w('heart', 1000, 1400)];
    const out = alignScriptToWhisper('The very heart', whisper);
    expect(out.map((x) => x.text)).toEqual(['The', 'very', 'heart']);
    expect(out[1].startMs).toBeGreaterThanOrEqual(200);
    expect(out[1].endMs).toBeLessThanOrEqual(1000);
    expect(out[1].endMs).toBeGreaterThan(out[1].startMs);
  });

  it('drops an extra Whisper word that is not in the script', () => {
    const whisper = [w('octopuses', 0, 500), w('uh', 500, 700), w('have', 700, 1000), w('hearts', 1000, 1500)];
    const out = alignScriptToWhisper('Octopuses have hearts.', whisper);
    expect(out.map((x) => x.text)).toEqual(['Octopuses', 'have', 'hearts.']);
    expect(out[1]).toMatchObject({ startMs: 700, endMs: 1000 });
  });

  it('falls back to Whisper words when the script and audio have diverged', () => {
    const whisper = [w('completely', 0, 500), w('different', 500, 1000), w('words', 1000, 1500)];
    expect(alignScriptToWhisper('Nothing here lines up at all with it', whisper)).toBe(whisper);
  });

  it('makes sentence-grouped work: punctuation now exists to end cues on', () => {
    const whisper = ['one', 'two', 'three', 'four'].map((t, i) => w(t, i * 400, (i + 1) * 400));
    const timed = alignScriptToWhisper('One two. Three four.', whisper);
    const cues = groupCaptionCues(timed, 'sentence-grouped');
    expect(cues.map((c) => c.text)).toEqual(['One two.', 'Three four.']);
  });
});
