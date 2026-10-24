// Sprint 5 Task 7 R7. Run with the server's vitest: cd studio && npx vitest run --root ../app
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkChapters, lengthStatus, narrationWords } from './script-editor';

const words = (n: number) => Array(n).fill('w').join(' ');
const sheet = (counts: number[]) => counts.map((n, i) => `## Chapter ${i + 1}\n${words(n)}`).join('\n\n');
const range = { min: 3, max: 20, editMin: 3, editMax: 20, targetWords: 300, minWordsPerChapter: 26, exactCount: false };
// The brief listed 4 titles; the Gate 1 edit check still accepts the length's whole range unless it is exact too.
const exact = { min: 4, max: 4, editMin: 3, editMax: 12, targetWords: 300, minWordsPerChapter: 26, exactCount: true };

describe('chapter check against the bounds the server sends', () => {
  it('without bounds the count shows but nothing is limited or blocked', () => {
    const r = checkChapters(sheet([50]), null);
    expect(r).toEqual({ count: 1, ok: true, message: null, limit: null, short: [], advice: null });
  });
  it('a range: inside passes, below the minimum and above the maximum do not', () => {
    expect(checkChapters(sheet([40, 40, 40]), range)).toMatchObject({ count: 3, ok: true, limit: '3 to 20 chapters' });
    const few = checkChapters(sheet([40, 40]), range);
    expect(few.ok).toBe(false);
    expect(few.message).toBe('Needs 3 to 20 chapters, each starting with "## Chapter title" (2 so far).');
    const many = checkChapters(sheet(Array(21).fill(40)), range);
    expect(many.ok).toBe(false);
    expect(many.message).toContain('Has 21 chapters');
  });
  it('an exact count is advice only: one amber line, never a block', () => {
    const three = checkChapters(sheet([40, 40, 40]), exact); // 3 is inside the edit range 3 to 12
    expect(three.ok).toBe(true);
    expect(three.advice).toBe('The brief lists 4 chapters');
    expect(checkChapters(sheet([40, 40, 40, 40]), exact).advice).toBe('The brief lists 4 chapters');
    expect(checkChapters(sheet([40, 40, 40]), range).advice).toBeNull();
    expect(checkChapters(sheet([40, 40]), exact).ok).toBe(false); // below editMin, not below the planned 4
  });
  it('a chapter under the server minimum words is a warning, not a block', () => {
    const r = checkChapters(sheet([40, 12, 40]), range);
    expect(r.ok).toBe(true);
    expect(r.short).toEqual([{ title: 'Chapter 2', words: 12 }]);
  });
  it('a pasted whole script with no headings has zero chapters', () => {
    expect(checkChapters('Just one long paragraph with no headings at all.', range)).toMatchObject({ count: 0, ok: false });
  });
  it('text before the first heading is refused, as the format requires', () => {
    const r = checkChapters(`Intro line\n${sheet([40, 40, 40])}`, range);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('before the first');
    expect(checkChapters('Intro line', null).ok).toBe(false);
  });
  it('an empty chapter does not count', () => {
    expect(checkChapters(`${sheet([40, 40])}\n## Empty\n\n## Last\n`, null).count).toBe(2);
  });
  it('keeps no chapter-count or minimum-words number of its own', () => {
    const src = readFileSync(join(__dirname, 'script-editor.ts'), 'utf8');
    expect(src).not.toMatch(/MIN_CHAPTERS|MAX_CHAPTERS|MIN_CHAPTER_WORDS/);
    expect(src).not.toMatch(/at least 3|3 chapters/);
  });
});

describe('length against the server target', () => {
  it('does not count heading lines as spoken words', () => {
    expect(narrationWords('## Title here\none two three')).toBe(3);
  });
  it('targetWords present: the count is shown against it', () => {
    expect(lengthStatus(Array(273).fill('word').join(' '), 300).text).toBe('273 words · target about 300');
  });
  it('targetWords absent: the count alone, no target', () => {
    expect(lengthStatus('a b c', undefined).text).toBe('3 words');
    expect(lengthStatus('a b c', null).text).toBe('3 words');
    expect(lengthStatus('a b c', 0).text).toBe('3 words');
  });
  it('keeps no pace or floor constant of its own', () => {
    const src = readFileSync(join(__dirname, 'script-editor.ts'), 'utf8') + readFileSync(join(__dirname, 'script-versions.ts'), 'utf8');
    expect(src).not.toMatch(/WORDS_PER_MINUTE|LENGTH_FLOOR|155/);
  });
});
