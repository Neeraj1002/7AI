import { describe, it, expect } from 'vitest';
import { chapterBoundsForBrief, checkBriefChapterPlan, parseBriefChapterPlan } from './brief-chapter-plan';

const NAMES = ['An Imagined Morning', 'The Street and the Hearth', 'The Market and the Stones', 'The Traveller and the Beads', 'The Signs Nobody Can Read', 'What Came After', 'What We Know, and What I Made Up', 'Eighth', 'Ninth'];
const COUNT_WORDS = ['three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

function brief(parts: { titles?: number; budgets?: number; allocations?: number; announced?: string }): string {
  const lines = ['Topic: A day in a city.', 'Constraint: about 1,500 words for a 10 minute video, calm and vivid.'];
  if (parts.titles !== undefined) {
    const list = NAMES.slice(0, parts.titles).map((t) => `"${t}"`).join(', ');
    lines.push(`Constraint: ${parts.announced ?? COUNT_WORDS[parts.titles - 3] ?? 'many'} chapters, titles exactly: ${list}. Each chapter opens with a question it answers.`);
  }
  if (parts.budgets !== undefined) {
    lines.push(`Constraint: word budgets: ${Array.from({ length: parts.budgets }, () => 200).join(', ')}.`);
  }
  if (parts.allocations !== undefined) {
    lines.push(
      'Constraint: ' +
        Array.from({ length: parts.allocations }, (_, i) => `Chapter ${i + 1} uses facts ${i * 3 + 1}, ${i * 3 + 2}, ${i * 3 + 3}.`).join(' '),
    );
  }
  lines.push('Constraint: stance. Chapters 2 to 4 are first person. Use at least 3 chapters of commentary. Title suggestions: "A Day in a City" · "Second".');
  lines.push('Facts: 1. A fact. 2. Another.');
  return lines.join('\n');
}

describe('parseBriefChapterPlan', () => {
  it('reads titles with commas inside them, the announced count, budgets and allocations', () => {
    const plan = parseBriefChapterPlan(brief({ titles: 7, budgets: 7, allocations: 7 }));
    expect(plan.titles).toHaveLength(7);
    expect(plan.titles![6]).toBe('What We Know, and What I Made Up');
    expect(plan.declaredCount).toBe(7);
    expect(plan.wordBudgets).toEqual([200, 200, 200, 200, 200, 200, 200]);
    expect(plan.factAllocationCount).toBe(7);
  });

  it('reads curly quotes and per-chapter word budgets', () => {
    const plan = parseBriefChapterPlan('Constraint: four chapters, titles in order: “One”, “Two”, “Three” and “Four”.\nChapter 1: about 120 words. Chapter 2 (about 300 words). Chapter 3 ~250 words. Chapter 4: 1,000 words.');
    expect(plan.titles).toEqual(['One', 'Two', 'Three', 'Four']);
    expect(plan.wordBudgets).toEqual([120, 300, 250, 1000]);
  });

  it('does not take video title suggestions, stance lines or "at least 3 chapters" for chapter data', () => {
    const plan = parseBriefChapterPlan(brief({}));
    expect(plan.titles).toBeNull();
    expect(plan.declaredCount).toBeNull();
    expect(plan.wordBudgets).toBeNull();
    expect(plan.factAllocationCount).toBeNull();
  });

  it('reads a labelled allocation line where a chapter uses a different verb, and "word budget by chapter"', () => {
    const plan = parseBriefChapterPlan(
      'Constraint: about 1,500 words for a 10 minute video; word budget by chapter: about 60, 125, 340, 375, 375, 175 and 50.\n' +
        'Constraint: chapter allocation: chapter 1 uses facts 1 to 3. Chapter 2 uses 4 to 7 and 9. Chapter 3 uses 10 to 17. Chapter 4 uses 18 to 24. Chapter 5 uses 25 to 32 and may recall facts 12 and 19 in one sentence. Chapter 6 uses 33 to 35, 37, 38 and 39. Chapter 7 restates in one sentence which facts were documented.',
    );
    expect(plan.wordBudgets).toEqual([60, 125, 340, 375, 375, 175, 50]);
    expect(plan.factAllocationCount).toBe(7);
  });

  it('does not read "the first 100 words" as a chapter word budget', () => {
    expect(parseBriefChapterPlan('Chapter 1: the first 100 words build tension.').wordBudgets).toBeNull();
  });
});

describe('checkBriefChapterPlan: lists must agree', () => {
  it('stops 8 titles with 7 word budgets with a plain sentence', () => {
    const result = checkBriefChapterPlan(brief({ titles: 8, budgets: 7 }), 600);
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('8 titles but 7 word budgets') });
  });

  it('stops titles and fact allocations that differ', () => {
    const result = checkBriefChapterPlan(brief({ titles: 7, allocations: 6 }), 600);
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('7 titles but 6 fact allocations') });
  });

  it('stops budgets and allocations that differ when there are no titles', () => {
    expect(checkBriefChapterPlan(brief({ budgets: 5, allocations: 6 }), 600)).toMatchObject({ ok: false, message: expect.stringContaining('5 word budgets but 6 fact allocations') });
  });

  it('stops an announced count that does not match the titles', () => {
    const result = checkBriefChapterPlan(brief({ titles: 8, announced: 'seven' }), 600);
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('8 titles but a count of 7 chapters') });
  });

  it.each([7, 8, 9])('accepts %i matching titles, budgets and allocations and sets the chapter count', (n) => {
    const result = checkBriefChapterPlan(brief({ titles: n, budgets: n, allocations: n }), 600);
    expect(result).toMatchObject({ ok: true, warnings: [] });
    if (result.ok) expect(result.bounds).toMatchObject({ min: n, max: n });
  });

  it('refuses 21 chapters and 2 chapters', () => {
    const many = `Constraint: 21 chapters, titles exactly: ${Array.from({ length: 21 }, (_, i) => `"T${i}"`).join(', ')}.`;
    expect(checkBriefChapterPlan(many, 900)).toMatchObject({ ok: false, message: expect.stringContaining('21 chapters') });
    expect(checkBriefChapterPlan('Chapter titles: "A", "B".', 600)).toMatchObject({ ok: false, message: expect.stringContaining('2 chapters') });
  });

  it('refuses more chapters than the length allows (10 seconds each)', () => {
    const lined = `Constraint: chapters, titles exactly: ${Array.from({ length: 13 }, (_, i) => `"T${i}"`).join(', ')}.`;
    expect(checkBriefChapterPlan(lined, 120)).toMatchObject({ ok: false, message: expect.stringContaining('needs 3 to 12') });
    expect(checkBriefChapterPlan(lined, 180)).toMatchObject({ ok: true });
  });

  it('refuses a word budget under 10 seconds of narration', () => {
    const text = 'Constraint: three chapters, titles exactly: "A", "B", "C".\nword budgets: 200, 20, 200';
    expect(checkBriefChapterPlan(text, 600)).toMatchObject({ ok: false, message: expect.stringContaining('Chapter 2 has a word budget of 20') });
  });

  it('a brief with no chapter data passes and uses the format default', () => {
    const result = checkBriefChapterPlan('Just a topic and some facts.', 600);
    expect(result).toMatchObject({ ok: true, warnings: [] });
    if (result.ok) expect(result.bounds).toMatchObject({ min: 3, max: 20, target: 4, titles: null });
  });
});

describe('checkBriefChapterPlan: soft warning', () => {
  it('warns, without failing, when the average chapter is under 40 seconds', () => {
    const result = checkBriefChapterPlan(brief({ titles: 9 }), 300);
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.warnings[0]).toMatch(/9 chapters in a 5-minute video is about 33 seconds a chapter/);
  });

  it('does not warn at 40 seconds or more', () => {
    expect(checkBriefChapterPlan(brief({ titles: 7 }), 600)).toMatchObject({ ok: true, warnings: [] });
    expect(checkBriefChapterPlan(brief({ titles: 3 }), 120)).toMatchObject({ ok: true, warnings: [] });
  });
});

describe('chapterBoundsForBrief', () => {
  it('is what Script Generation uses: titles set the count, otherwise the default', () => {
    expect(chapterBoundsForBrief(brief({ titles: 8 }), 600)).toMatchObject({ min: 8, max: 8 });
    expect(chapterBoundsForBrief(undefined, 600)).toMatchObject({ min: 3, max: 20, titles: null });
  });
});
