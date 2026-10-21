import { describe, it, expect } from 'vitest';
import {
  LONG_WORDS_PER_MINUTE,
  MAX_CHAPTERS,
  MIN_CHAPTERS,
  MIN_CHAPTER_SECONDS,
  MIN_CHAPTER_WORDS,
  chapterBounds,
  chapterCountProblem,
  defaultChapterCount,
  describeAllowedChapters,
  maxChaptersFor,
} from './chapter-bounds';
import { MIN_CHAPTERS as YOUTUBE_MIN_CHAPTERS, MIN_CHAPTER_SECONDS as YOUTUBE_MIN_SECONDS } from './chapters';

const titles = (n: number) => Array.from({ length: n }, (_, i) => `Title ${i + 1}`);

describe('chapter bounds', () => {
  it('is the only owner: the YouTube chapter rule reads the same constants', () => {
    expect(YOUTUBE_MIN_CHAPTERS).toBe(MIN_CHAPTERS);
    expect(YOUTUBE_MIN_SECONDS).toBe(MIN_CHAPTER_SECONDS);
    expect(MIN_CHAPTER_SECONDS).toBe(10);
    expect(MIN_CHAPTER_WORDS).toBe(Math.ceil((10 * LONG_WORDS_PER_MINUTE) / 60));
    expect(MIN_CHAPTER_WORDS).toBeGreaterThanOrEqual(25);
  });

  it.each([
    [120, 12, 3],
    [300, 20, 3],
    [600, 20, 4],
    [900, 20, 6],
  ])('a %i s video allows 3 to %i chapters and defaults to %i', (seconds, max, fallback) => {
    const bounds = chapterBounds({ targetSeconds: seconds });
    expect(bounds).toMatchObject({ min: MIN_CHAPTERS, max, target: fallback, titles: null });
    expect(maxChaptersFor(seconds)).toBe(max);
    expect(defaultChapterCount(seconds)).toBe(fallback);
  });

  it('never goes under the floor or over the ceiling', () => {
    expect(maxChaptersFor(10)).toBe(MIN_CHAPTERS);
    expect(maxChaptersFor(100000)).toBe(MAX_CHAPTERS);
  });

  it.each([7, 8, 9])('a brief that lists %i titles sets the count to exactly that', (n) => {
    const bounds = chapterBounds({ targetSeconds: 600, briefTitles: titles(n) });
    expect(bounds).toMatchObject({ min: n, max: n, target: n });
    expect(bounds.titles).toEqual(titles(n));
    expect(chapterCountProblem(n, bounds)).toBeNull();
    expect(chapterCountProblem(n + 1, bounds)).toMatch(new RegExp(`has ${n + 1} chapters, but this video needs exactly ${n} chapters`));
    expect(describeAllowedChapters(bounds)).toBe(`exactly ${n}`);
  });

  it('ignores a title list outside the allowed range (intake refuses it before any spend)', () => {
    expect(chapterBounds({ targetSeconds: 600, briefTitles: titles(21) }).titles).toBeNull();
    expect(chapterBounds({ targetSeconds: 600, briefTitles: titles(2) }).titles).toBeNull();
    expect(chapterBounds({ targetSeconds: 120, briefTitles: titles(13) }).titles).toBeNull();
  });

  it('names the count that came back and the allowed range', () => {
    const bounds = chapterBounds({ targetSeconds: 300 });
    expect(chapterCountProblem(21, bounds)).toBe('Your reply has 21 chapters, but this video needs 3 to 20 chapters');
    expect(chapterCountProblem(2, bounds, 'The edited script')).toBe('The edited script has 2 chapters, but this video needs 3 to 20 chapters');
    expect(chapterCountProblem(3, bounds)).toBeNull();
    expect(chapterCountProblem(20, bounds)).toBeNull();
  });
});
