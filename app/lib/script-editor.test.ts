// Sprint 5 Task 7 R7. Run with the server's vitest: cd studio && npx vitest run --root ../app
import { describe, it, expect } from 'vitest';
import { checkChapterSheet, clock, lengthStatus, narrationWords } from './script-editor';

const chapter = (n: number) => `## Chapter ${n}\nSome words for chapter ${n} go here.`;

describe('chapter check (mirrors the server rules)', () => {
  it('three chapters pass; two do not, and the count is live', () => {
    expect(checkChapterSheet([1, 2, 3].map(chapter).join('\n\n'))).toEqual({ ok: true, chapters: 3, message: null });
    const two = checkChapterSheet([1, 2].map(chapter).join('\n\n'));
    expect(two.ok).toBe(false);
    expect(two.chapters).toBe(2);
    expect(two.message).toContain('at least 3 chapters');
  });
  it('a pasted whole script with no headings has zero chapters', () => {
    expect(checkChapterSheet('Just one long paragraph with no headings at all.').chapters).toBe(0);
  });
  it('text before the first heading is refused, as on the server', () => {
    const r = checkChapterSheet(`Intro line\n${[1, 2, 3].map(chapter).join('\n')}`);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('before the first');
  });
  it('an empty chapter does not count', () => {
    expect(checkChapterSheet(`${chapter(1)}\n${chapter(2)}\n## Empty\n\n## Last\n`).chapters).toBe(2);
  });
});

describe('length status', () => {
  it('does not count heading lines as spoken words', () => {
    expect(narrationWords('## Title here\none two three')).toBe(3);
  });
  it('about 273 words at 155 wpm is about 1:46 of a 2:00 target, and fine', () => {
    const s = lengthStatus(Array(273).fill('word').join(' '), 120);
    expect(clock(s.seconds)).toBe('1:46');
    expect(s.warn).toBe(false);
  });
  it('warns under 80% of the target', () => {
    const s = lengthStatus(Array(200).fill('word').join(' '), 120); // 77 s < 96 s
    expect(s.warn).toBe(true);
    expect(s.text).toContain('under the 1:36 minimum');
  });
  it('shows no warning without a target or an empty script', () => {
    expect(lengthStatus('a b c', undefined).warn).toBe(false);
    expect(lengthStatus('', 120).warn).toBe(false);
  });
});
