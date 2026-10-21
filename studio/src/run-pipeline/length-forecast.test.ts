import { describe, it, expect, vi } from 'vitest';
import { forecastLength, plausiblePace, resolveVoicePace } from './length-forecast';
import { buildLongTargetLine, targetWordCount, isLengthInRange } from '../agents/script-generation/long-form';

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');

describe('pace of the chosen voice (R7)', () => {
  it('uses the latest measured pace for the voice when it is plausible', async () => {
    const lookup = vi.fn().mockResolvedValue(167);
    expect(await resolveVoicePace('t', 'coral', lookup)).toEqual({ wordsPerMinute: 167, source: 'measured' });
    expect(lookup).toHaveBeenCalledWith('t', 'coral');
  });
  it('falls back to 155 with no measurement, an implausible one, or a failed lookup', async () => {
    expect(await resolveVoicePace('t', 'coral', async () => null)).toEqual({ wordsPerMinute: 155, source: 'default' });
    expect(await resolveVoicePace('t', 'coral', async () => 12)).toEqual({ wordsPerMinute: 155, source: 'default' });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await resolveVoicePace('t', 'coral', async () => { throw new Error('db'); })).toEqual({ wordsPerMinute: 155, source: 'default' });
    expect(await resolveVoicePace('t', null, vi.fn())).toEqual({ wordsPerMinute: 155, source: 'default' });
  });
  it('rejects paces that are measurement errors', () => {
    expect(plausiblePace(0)).toBeNull();
    expect(plausiblePace(400)).toBeNull();
    expect(plausiblePace(167)).toBe(167);
  });
});

describe('planning the word count from the voice pace', () => {
  it('asks Coral (167 wpm) for more words than the default pace for the same 2 minutes', () => {
    expect(targetWordCount(120)).toBe(310);
    expect(targetWordCount(120, 167)).toBe(334);
    expect(buildLongTargetLine(120, 167)).toContain('Write around 334 words');
    expect(buildLongTargetLine(120, 167)).toContain('about 167 words per minute');
    expect(buildLongTargetLine(120)).toContain('Write around 310 words');
  });
  it('judges the range at that pace', () => {
    expect(isLengthInRange(273, 120)).toBe(false); // 310 +-10% = 279..341
    expect(isLengthInRange(334, 120, undefined, 167)).toBe(true);
  });
});

describe('forecastLength (replay of E5: about 273 words, Coral)', () => {
  it('predicts about 98 s: inside the 96 s floor, but more than 10% short, so it warns', () => {
    const f = forecastLength({ text: words(273), targetSeconds: 120, wordsPerMinute: 167, paceSource: 'measured' });
    expect(f.expectedSeconds).toBeCloseTo(98.1, 0);
    expect(f.status).toBe('short');
    expect(f.warn).toBe(true);
    expect(f.floorSeconds).toBe(96);
    expect(f.message).toMatch(/about 1:38 against a 2:00 target \(-18%\)/);
  });
  it('is under_floor below 80% of the target, and says how many words to add', () => {
    const f = forecastLength({ text: words(250), targetSeconds: 120, wordsPerMinute: 167 });
    expect(f.status).toBe('under_floor');
    expect(f.message).toMatch(/under the 1:36 minimum/);
    expect(f.message).toMatch(/Add about \d+ words/);
  });
  it('is ok inside 10% either way and long above it', () => {
    expect(forecastLength({ text: words(334), targetSeconds: 120, wordsPerMinute: 167 })).toMatchObject({ status: 'ok', warn: false });
    expect(forecastLength({ text: words(400), targetSeconds: 120, wordsPerMinute: 167 }).status).toBe('long');
  });
});
