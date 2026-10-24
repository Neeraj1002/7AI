// Sprint 5 Task 7 R7 / follow-up R3 — live checks for the Gate 1 script editor, so a problem shows while typing instead of
// after Save. The app parses the `## Chapter title` format; every limit (how many chapters, how many words in one) comes from
// the server's `chapterBounds` (lib/chapter-bounds.ts) and the server still decides on Save: its message is shown as sent.
import { rangeText, type ChapterBounds } from './chapter-bounds';

export const WORDS_PER_MINUTE = 155; // LONG_WORDS_PER_MINUTE on the server (see the follow-up report's sweep)
/** A script under this share of the target length fails the quality floor. */
export const LENGTH_FLOOR = 0.8;

export const CHAPTER_HINT = 'Start each chapter with a line like "## Chapter title".';

/** Narration words: chapter heading lines are not spoken. */
export function narrationWords(text: string): number {
  const spoken = text
    .split(/\r?\n/)
    .filter((l) => !/^##\s/.test(l))
    .join(' ')
    .trim();
  return spoken ? spoken.split(/\s+/).length : 0;
}

export type ParsedChapter = { title: string; words: number };
export type ParsedSheet = { chapters: ParsedChapter[]; textBeforeFirstHeading: boolean };

/** The format only: "## Title" lines start a chapter, the lines under one are its text. */
export function parseSheet(text: string): ParsedSheet {
  const chapters: { title: string; lines: string[] }[] = [];
  let textBeforeFirstHeading = false;
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) chapters.push({ title: heading[1], lines: [] });
    else if (chapters.length > 0) chapters[chapters.length - 1].lines.push(line);
    else if (line.trim()) textBeforeFirstHeading = true;
  }
  return { chapters: chapters.map((c) => ({ title: c.title, words: narrationWords(c.lines.join('\n')) })), textBeforeFirstHeading };
}

export type ChapterCheck = {
  /** Chapters that have text (an empty chapter does not count). */
  count: number;
  /** False when Save would be refused for the count or the format; true when there are no bounds to judge by. */
  ok: boolean;
  /** What is wrong, in a sentence, or null. */
  message: string | null;
  /** The limit as the server states it ("3 to 20 chapters"), or null while the server has not sent bounds. */
  limit: string | null;
  /** Chapters with text but fewer words than the server's minimum: a warning, never a block. */
  short: ParsedChapter[];
};

export function checkChapters(text: string, bounds: ChapterBounds | null): ChapterCheck {
  const parsed = parseSheet(text);
  const filled = parsed.chapters.filter((c) => c.words > 0);
  const count = filled.length;
  const limit = bounds ? rangeText(bounds) : null;
  if (parsed.textBeforeFirstHeading) {
    return { count, ok: false, message: 'There is text before the first "## Chapter title" line. Put every part of the script under a chapter heading.', limit, short: [] };
  }
  if (!bounds) return { count, ok: true, message: null, limit, short: [] };
  const short = filled.filter((c) => c.words < bounds.minWordsPerChapter);
  if (count < bounds.min) return { count, ok: false, message: `Needs ${rangeText(bounds)}, each starting with "## Chapter title" (${count} so far).`, limit, short };
  if (count > bounds.max) return { count, ok: false, message: `Has ${count} chapters; this video needs ${rangeText(bounds)}.`, limit, short };
  return { count, ok: true, message: null, limit, short };
}

export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export type LengthStatus = { words: number; seconds: number; text: string; warn: boolean };

export function lengthStatus(text: string, targetSeconds: number | undefined): LengthStatus {
  const words = narrationWords(text);
  const seconds = (words / WORDS_PER_MINUTE) * 60;
  if (!targetSeconds) return { words, seconds, text: `${words} words · about ${clock(seconds)}`, warn: false };
  const floor = targetSeconds * LENGTH_FLOOR;
  const warn = words > 0 && seconds < floor;
  const base = `${words} words · about ${clock(seconds)} of ${clock(targetSeconds)}`;
  return { words, seconds, text: warn ? `${base} · under the ${clock(floor)} minimum` : base, warn };
}
