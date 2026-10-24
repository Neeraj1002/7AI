// Sprint 5 Task 7 R7 / follow-up R3 — live checks for the Gate 1 script editor, so a problem shows while typing instead of
// after Save. The app parses the `## Chapter title` format; every limit (how many chapters, how many words in one) comes from
// the server's `chapterBounds` (lib/chapter-bounds.ts) and the server still decides on Save: its message is shown as sent.
import { rangeText, type ChapterBounds } from './chapter-bounds';

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
  /** Advice only, never a block: "The brief lists N chapters" when the brief named its chapters. */
  advice: string | null;
};

export function checkChapters(text: string, bounds: ChapterBounds | null): ChapterCheck {
  const parsed = parseSheet(text);
  const filled = parsed.chapters.filter((c) => c.words > 0);
  const count = filled.length;
  const limit = bounds ? rangeText(bounds) : null;
  if (parsed.textBeforeFirstHeading) {
    return { count, ok: false, message: 'There is text before the first "## Chapter title" line. Put every part of the script under a chapter heading.', limit, short: [], advice: null };
  }
  if (!bounds) return { count, ok: true, message: null, limit, short: [], advice: null };
  const advice = bounds.exactCount ? `The brief lists ${bounds.min} ${bounds.min === 1 ? 'chapter' : 'chapters'}` : null;
  const short = filled.filter((c) => c.words < bounds.minWordsPerChapter);
  if (count < bounds.editMin) return { count, ok: false, message: `Needs ${rangeText(bounds)}, each starting with "## Chapter title" (${count} so far).`, limit, short, advice };
  if (count > bounds.editMax) return { count, ok: false, message: `Has ${count} chapters; this video needs ${rangeText(bounds)}.`, limit, short, advice };
  return { count, ok: true, message: null, limit, short, advice };
}

export type LengthStatus = { words: number; text: string };

/** The word count against the server's target (`chapterBounds.targetWords`). With no target the count stands alone. */
export function lengthStatus(text: string, targetWords: number | null | undefined): LengthStatus {
  const words = narrationWords(text);
  return { words, text: targetWords ? `${words} words · target about ${targetWords}` : `${words} words` };
}
