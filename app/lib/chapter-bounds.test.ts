// Sprint 5 Task 7 follow-up R3. Run with the server's vitest: cd studio && npx vitest run --root ../app
import { describe, it, expect } from 'vitest';
import { chapterBoundsOf, rangeText } from './chapter-bounds';

describe('runs.get.chapterBounds', () => {
  it('reads a range', () => {
    const b = chapterBoundsOf({ chapterBounds: { min: 3, max: 20, minWordsPerChapter: 26, exactCount: false } })!;
    expect(b).toMatchObject({ min: 3, max: 20, editMin: 3, editMax: 20, minWordsPerChapter: 26, exactCount: false });
    expect(rangeText(b)).toBe('3 to 20 chapters');
  });
  it('the edit range is what the editor judges by, not the writers planned range', () => {
    const b = chapterBoundsOf({ chapterBounds: { min: 4, max: 4, editMin: 3, editMax: 12, targetWords: 300, minWordsPerChapter: 26, exactCount: true } })!;
    expect(b.targetWords).toBe(300);
    expect(rangeText(b)).toBe('3 to 12 chapters');
  });
  it('reads an exact count, from the flag or from min equal to max', () => {
    expect(chapterBoundsOf({ chapterBounds: { min: 4, max: 4, minWordsPerChapter: 26, exactCount: true } })?.exactCount).toBe(true);
    const b = chapterBoundsOf({ chapterBounds: { min: 5, max: 5, minWordsPerChapter: 26, exactCount: false } })!;
    expect(rangeText(b)).toBe('exactly 5 chapters');
    expect(rangeText(chapterBoundsOf({ chapterBounds: { min: 4, max: 4, editMin: 4, editMax: 4, minWordsPerChapter: 26, exactCount: true } })!)).toBe('exactly 4 chapters');
  });
  it('is null for a Short (null), an older server (absent) and malformed data', () => {
    expect(chapterBoundsOf({ chapterBounds: null })).toBeNull();
    expect(chapterBoundsOf({})).toBeNull();
    expect(chapterBoundsOf(undefined)).toBeNull();
    expect(chapterBoundsOf({ chapterBounds: { min: 'x', max: 3, minWordsPerChapter: 26 } })).toBeNull();
    expect(chapterBoundsOf({ chapterBounds: { min: 5, max: 3, minWordsPerChapter: 26 } })).toBeNull();
  });
});
