import { z } from "zod";
import {
  LONG_WORDS_PER_MINUTE,
  chapterBounds,
  chapterCountProblem,
  describeAllowedChapters,
  type ChapterBounds,
} from "../../long-form/chapter-bounds";
export { buildLongSystemPrompt } from '../../prompts/system-prompts';

// Sprint 4 Task 9 (R2): the pure half of long-form script generation: the prompt, the reply
// shape, the length rule and the Gate 1 chapter edit sheet. No model calls here.

// A script is accepted without repair when its word count is within +-10% of the target; up to
// LONG_MAX_LENGTH_REPAIRS repairs are tried to get there. Past that the run continues anyway, and
// is only flagged (lengthOutOfRange) when it is still outside +-20%. Length never fails a run.
export const LONG_LENGTH_TOLERANCE = 0.1;
export const LONG_LENGTH_HARD_TOLERANCE = 0.2;
export const LONG_MAX_LENGTH_REPAIRS = 2;

// The chapter count, per-chapter minimum and pace are owned by long-form/chapter-bounds.ts.
export { LONG_WORDS_PER_MINUTE };

export const ScriptChapterSchema = z.object({
  title: z.string().min(1),
  text: z.string().min(1),
});
export type ScriptChapter = z.infer<typeof ScriptChapterSchema>;

// What the model returns for a long script. scriptText and captions are derived, not asked for.
export const LongScriptReplySchema = z.object({
  chapters: z.array(ScriptChapterSchema),
  hashtags: z.array(z.string()),
});
export type LongScriptReply = z.infer<typeof LongScriptReplySchema>;

export function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

// `wordsPerMinute` is the narrating voice's measured pace (Sprint 5 Task 8, R7); the calibrated default when absent.
export function targetWordCount(targetSeconds: number, wordsPerMinute = LONG_WORDS_PER_MINUTE): number {
  return Math.round((targetSeconds / 60) * wordsPerMinute);
}

export function lengthRange(
  targetSeconds: number,
  tolerance = LONG_LENGTH_TOLERANCE,
  wordsPerMinute = LONG_WORDS_PER_MINUTE,
): { min: number; max: number } {
  const target = targetWordCount(targetSeconds, wordsPerMinute);
  return {
    min: Math.floor(target * (1 - tolerance)),
    max: Math.ceil(target * (1 + tolerance)),
  };
}

export function isLengthInRange(
  wordCount: number,
  targetSeconds: number,
  tolerance = LONG_LENGTH_TOLERANCE,
  wordsPerMinute = LONG_WORDS_PER_MINUTE,
): boolean {
  const { min, max } = lengthRange(targetSeconds, tolerance, wordsPerMinute);
  return wordCount >= min && wordCount <= max;
}

// Distance from the target word count, as a fraction (0 = exact).
export function lengthError(wordCount: number, targetSeconds: number, wordsPerMinute = LONG_WORDS_PER_MINUTE): number {
  return (
    Math.abs(wordCount - targetWordCount(targetSeconds, wordsPerMinute)) /
    targetWordCount(targetSeconds, wordsPerMinute)
  );
}

// Words per minute of a finished narration (the figure LONG_WORDS_PER_MINUTE is calibrated from).
export function measuredWordsPerMinute(
  wordCount: number,
  narrationSeconds: number,
): number {
  return narrationSeconds > 0
    ? Number(((wordCount / narrationSeconds) * 60).toFixed(1))
    : 0;
}

// scriptText stays the concatenation of the chapter texts, so every existing reader keeps working.
export function joinChapterTexts(chapters: ScriptChapter[]): string {
  return chapters.map((c) => c.text.trim()).join("\n\n");
}

// A reply that parses but breaks the structure rules is handled like a reply that does not parse.
// The default bounds are the ones for a video with no listed titles at the platform's default length.
export function validateChapters(
  chapters: ScriptChapter[],
  bounds: ChapterBounds = chapterBounds({ targetSeconds: 600 }),
  subject = "Your reply",
): string | null {
  const countProblem = chapterCountProblem(chapters.length, bounds, subject);
  if (countProblem) return countProblem;
  const short = chapters.findIndex(
    (c) => countWords(c.text) < bounds.minWords,
  );
  if (short >= 0) {
    return `chapter ${short + 1} ("${chapters[short].title}") has ${countWords(chapters[short].text)} words; every chapter needs at least ${bounds.minWords} (10 seconds of narration)`;
  }
  return null;
}

export function buildLongTargetLine(targetSeconds: number, wordsPerMinute = LONG_WORDS_PER_MINUTE): string {
  const { min, max } = lengthRange(targetSeconds, LONG_LENGTH_TOLERANCE, wordsPerMinute);
  return `Target length: about ${Math.round(targetSeconds / 60)} minutes when narrated aloud (${targetSeconds} seconds). Write around ${targetWordCount(targetSeconds, wordsPerMinute)} words in total across all chapters (natural pace, about ${Math.round(wordsPerMinute)} words per minute); keep it between ${min} and ${max} words (within 10% of the target); anything outside that is sent back for a rewrite.`;
}

// The one retry after an unusable reply, when the problem is the chapter structure: names what came
// back and what is allowed.
export function buildStructureRepairMessage(problem: string, bounds: ChapterBounds): string {
  const titles = bounds.titles
    ? ` Use these exact titles, in this order: ${bounds.titles.map((t, i) => `${i + 1}. "${t}"`).join("; ")}.`
    : "";
  return `${problem}. The chapter count must be ${describeAllowedChapters(bounds)}, and every chapter needs at least ${bounds.minWords} words.${titles} Reply again with ONLY the corrected JSON object.`;
}

export function buildLengthRepairMessage(
  wordCount: number,
  targetSeconds: number,
  wordsPerMinute = LONG_WORDS_PER_MINUTE,
): string {
  const { min, max } = lengthRange(targetSeconds, LONG_LENGTH_TOLERANCE, wordsPerMinute);
  const direction = wordCount > max ? "too long" : "too short";
  return `Your script is ${wordCount} words, which is ${direction}. The target is about ${targetWordCount(targetSeconds, wordsPerMinute)} words (allowed ${min} to ${max}) for ${Math.round(targetSeconds / 60)} minutes. Rewrite it to land inside that range, keeping the same structure and using only the same facts. Reply again with ONLY the corrected JSON object.`;
}

// ---- Gate 1 edit sheet -----------------------------------------------------------------------

// The edit sheet shows each chapter as "## Title" followed by its text.
export function formatChapterSheet(chapters: ScriptChapter[]): string {
  return chapters
    .map((c) => `## ${c.title.trim()}\n${c.text.trim()}`)
    .join("\n\n");
}

export const CHAPTER_EDIT_TOO_FEW_MESSAGE = `The edited script needs at least ${chapterBounds({ targetSeconds: 600 }).min} chapters, each starting with a line like "## Chapter title".`;

export type ParsedChapterSheet =
  | { ok: true; chapters: ScriptChapter[] }
  | { ok: false; message: string };

export function parseChapterSheet(
  sheet: string,
  targetSeconds = 600,
): ParsedChapterSheet {
  const chapters: ScriptChapter[] = [];
  let current: { title: string; lines: string[] } | null = null;
  const preamble: string[] = [];
  for (const line of sheet.replace(/\r\n/g, "\n").split("\n")) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) {
      if (current)
        chapters.push({
          title: current.title,
          text: current.lines.join("\n").trim(),
        });
      current = { title: heading[1], lines: [] };
    } else if (current) {
      current.lines.push(line);
    } else if (line.trim()) {
      preamble.push(line);
    }
  }
  if (current)
    chapters.push({
      title: current.title,
      text: current.lines.join("\n").trim(),
    });
  if (preamble.length > 0) {
    return {
      ok: false,
      message:
        'There is text before the first "## Chapter title" line. Put every part of the script under a chapter heading.',
    };
  }
  const nonEmpty = chapters.filter((c) => c.text.length > 0);
  const bounds = chapterBounds({ targetSeconds });
  if (nonEmpty.length < bounds.min)
    return { ok: false, message: CHAPTER_EDIT_TOO_FEW_MESSAGE };
  // An edit may reshape the chapters, so the brief's exact count does not bind it; the video's own
  // limits do (the same ones that bind the model's reply).
  const problem = validateChapters(nonEmpty, bounds, "The edited script");
  if (problem) return { ok: false, message: `${problem}.` };
  return { ok: true, chapters: nonEmpty };
}
