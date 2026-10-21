import {
  MIN_CHAPTERS,
  MIN_CHAPTER_WORDS,
  SOFT_MIN_AVERAGE_CHAPTER_SECONDS,
  averageChapterSeconds,
  chapterBounds,
  maxChaptersFor,
  type ChapterBounds,
} from './chapter-bounds';

// Bugs (chapter bounds): what a founder's brief says about its chapters, read from the text. A brief
// may list its chapter titles ("seven chapters, titles exactly: "A", "B", ..."), give each chapter a
// word budget ("Chapter 2: about 200 words" or "word budgets: 150, 200, ...") and allocate its facts
// ("Chapter 1 uses facts 1, 2, 3."). Pure: no model call, so intake can check it before any spend.

export type BriefChapterPlan = {
  // The quoted titles after "titles ...:" (or "Chapter N: "Title"" lines), in order; null when none.
  titles: string[] | null;
  // The count the brief announces in words or digits ("seven chapters"), when it does.
  declaredCount: number | null;
  // Words per chapter, in chapter order; null when the brief gives none.
  wordBudgets: number[] | null;
  // The chapters that have a fact allocation ("Chapter N uses ..."); null when the brief has none.
  factAllocationCount: number | null;
};

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20,
};

const QUOTED_TITLE = /^\s*(?:(?:,|;)\s*)?(?:(?:and|or)\s+)?[“"]([^”"\n]+)[”"]/;

function readQuotedTitles(rest: string): string[] {
  const titles: string[] = [];
  let remaining = rest;
  for (;;) {
    const match = QUOTED_TITLE.exec(remaining);
    if (!match) break;
    titles.push(match[1].trim());
    remaining = remaining.slice(match[0].length);
  }
  return titles;
}

function readTitles(brief: string): string[] | null {
  for (const line of brief.split(/\r?\n/)) {
    // A chapter-title line: it talks about chapters and says "titles ...:" ("Title suggestions:" for the
    // video itself is not one).
    if (!/\bchapters?\b/i.test(line)) continue;
    const label = /\btitles\s*(?:exactly|in order|are)?\s*:/i.exec(line);
    if (!label) continue;
    const titles = readQuotedTitles(line.slice(label.index + label[0].length));
    if (titles.length > 0) return titles;
  }
  const perChapter = [...brief.matchAll(/\bchapter\s+(\d+)\s*[:\-–]\s*[“"]([^”"\n]+)[”"]/gi)];
  if (perChapter.length > 0) {
    const byIndex = new Map<number, string>();
    for (const m of perChapter) byIndex.set(Number(m[1]), m[2].trim());
    return [...byIndex.entries()].sort((x, y) => x[0] - y[0]).map(([, title]) => title);
  }
  return null;
}

// "seven chapters, titles exactly: ..." announces the count on the title line. A chapter count
// mentioned anywhere else ("at least 3 chapters") is a rule about something else.
function readDeclaredCount(brief: string): number | null {
  const words = Object.keys(NUMBER_WORDS).join('|');
  const match = new RegExp(String.raw`\b(\d{1,2}|${words})\s+chapters\b[^\n:"“]{0,40}\btitles\b`, 'i').exec(brief);
  if (!match) return null;
  const raw = match[1].toLowerCase();
  return /^\d+$/.test(raw) ? Number(raw) : NUMBER_WORDS[raw];
}

const NUMBER = /\d{1,3}(?:,\d{3})+|\d+/g;
const toNumber = (text: string) => Number(text.replace(/,/g, ''));

function readWordBudgets(brief: string): number[] | null {
  const listed = /\bword budgets?\b[^:\n]{0,20}:\s*([^\n]*)/i.exec(brief);
  if (listed) {
    const numbers = (listed[1].match(NUMBER) ?? []).map(toNumber);
    if (numbers.length > 0) return numbers;
  }
  const byIndex = new Map<number, number>();
  for (const m of brief.matchAll(/\bchapter\s+(\d+)\b[^\n.]{0,60}?(?:about|around|approximately|roughly|budget\w*|~|\(|:|=)\s*(\d{1,3}(?:,\d{3})+|\d+)\s*words\b/gi)) {
    byIndex.set(Number(m[1]), toNumber(m[2]));
  }
  if (byIndex.size === 0) return null;
  return [...byIndex.entries()].sort((a, b) => a[0] - b[0]).map(([, words]) => words);
}

function readFactAllocationCount(brief: string): number | null {
  const chapters = new Set<number>();
  for (const m of brief.matchAll(/\bchapter\s+(\d+)\s+(?:uses|takes|draws on|gets)\s+(?:facts?\s+)?\d/gi)) {
    chapters.add(Number(m[1]));
  }
  return chapters.size > 0 ? chapters.size : null;
}

export function parseBriefChapterPlan(briefText: string | null | undefined): BriefChapterPlan {
  const brief = briefText ?? '';
  const titles = readTitles(brief);
  const wordBudgets = readWordBudgets(brief);
  return {
    titles,
    declaredCount: readDeclaredCount(brief),
    wordBudgets,
    factAllocationCount: readFactAllocationCount(brief),
  };
}

// The bounds a script for this brief must meet; Script Generation asks for them in the prompt and
// checks the reply against them.
export function chapterBoundsForBrief(
  briefText: string | null | undefined,
  targetSeconds: number,
): ChapterBounds {
  return chapterBounds({ targetSeconds, briefTitles: parseBriefChapterPlan(briefText).titles });
}

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;
const minutes = (targetSeconds: number) => `${Math.round(targetSeconds / 60)}-minute`;

export type BriefChapterCheck =
  | { ok: true; bounds: ChapterBounds; warnings: string[] }
  | { ok: false; message: string };

// Intake check for a long-form brief, before any spend: the lists in the brief must agree with each
// other, and the chapter count they give must fit the video's length. A mismatch is a plain sentence.
// Too-short chapters are only a warning.
export function checkBriefChapterPlan(
  briefText: string | null | undefined,
  targetSeconds: number,
): BriefChapterCheck {
  const plan = parseBriefChapterPlan(briefText);
  // The reference is the first list present, in this order; the message names it and the first that differs.
  const lists: Array<{ n: number; noun: (n: number) => string }> = [];
  if (plan.titles) lists.push({ n: plan.titles.length, noun: (n) => plural(n, 'title') });
  if (plan.wordBudgets) lists.push({ n: plan.wordBudgets.length, noun: (n) => plural(n, 'word budget') });
  if (plan.factAllocationCount !== null) lists.push({ n: plan.factAllocationCount, noun: (n) => plural(n, 'fact allocation') });
  if (plan.declaredCount !== null) lists.push({ n: plan.declaredCount, noun: (n) => `a count of ${plural(n, 'chapter')}` });

  const first = lists[0];
  const differing = first ? lists.find((l) => l.n !== first.n) : undefined;
  if (first && differing) {
    return {
      ok: false,
      message: `The brief has ${first.noun(first.n)} but ${differing.noun(differing.n)}. Make the lists in the brief match before starting.`,
    };
  }

  const max = maxChaptersFor(targetSeconds);
  const count = first?.n ?? null;
  if (count !== null && (count < MIN_CHAPTERS || count > max)) {
    return {
      ok: false,
      message: `The brief has ${plural(count, 'chapter')}, but a ${minutes(targetSeconds)} video needs ${MIN_CHAPTERS} to ${max}. Change the brief or the video length.`,
    };
  }

  const tooShort = plan.wordBudgets?.findIndex((words) => words < MIN_CHAPTER_WORDS) ?? -1;
  if (plan.wordBudgets && tooShort >= 0) {
    return {
      ok: false,
      message: `Chapter ${tooShort + 1} has a word budget of ${plan.wordBudgets[tooShort]}, under the ${MIN_CHAPTER_WORDS} words (10 seconds) a chapter needs.`,
    };
  }

  const bounds = chapterBounds({ targetSeconds, briefTitles: plan.titles });
  const warnings: string[] = [];
  const chapterCount = count ?? bounds.target;
  const average = averageChapterSeconds(targetSeconds, chapterCount);
  if (count !== null && average < SOFT_MIN_AVERAGE_CHAPTER_SECONDS) {
    warnings.push(
      `${plural(count, 'chapter')} in a ${minutes(targetSeconds)} video is about ${Math.round(average)} seconds a chapter, under the ${SOFT_MIN_AVERAGE_CHAPTER_SECONDS} seconds that usually works.`,
    );
  }
  return { ok: true, bounds, warnings };
}
