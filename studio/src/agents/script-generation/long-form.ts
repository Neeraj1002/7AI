import { z } from "zod";
import {
  LONG_WORDS_PER_MINUTE,
  chapterBounds,
  chapterCountProblem,
  describeAllowedChapters,
  type ChapterBounds,
} from "../../long-form/chapter-bounds";

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

export function targetWordCount(targetSeconds: number): number {
  return Math.round((targetSeconds / 60) * LONG_WORDS_PER_MINUTE);
}

export function lengthRange(
  targetSeconds: number,
  tolerance = LONG_LENGTH_TOLERANCE,
): { min: number; max: number } {
  const target = targetWordCount(targetSeconds);
  return {
    min: Math.floor(target * (1 - tolerance)),
    max: Math.ceil(target * (1 + tolerance)),
  };
}

export function isLengthInRange(
  wordCount: number,
  targetSeconds: number,
  tolerance = LONG_LENGTH_TOLERANCE,
): boolean {
  const { min, max } = lengthRange(targetSeconds, tolerance);
  return wordCount >= min && wordCount <= max;
}

// Distance from the target word count, as a fraction (0 = exact).
export function lengthError(wordCount: number, targetSeconds: number): number {
  return (
    Math.abs(wordCount - targetWordCount(targetSeconds)) /
    targetWordCount(targetSeconds)
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

function chapterStructureRule(bounds: ChapterBounds): string {
  if (bounds.titles) {
    const list = bounds.titles.map((t, i) => `${i + 1}. "${t}"`).join("; ");
    return `Write exactly ${bounds.titles.length} chapters, in the order they will be narrated, with these exact titles: ${list}.`;
  }
  return `Write between ${bounds.min} and ${bounds.max} chapters, in the order they will be narrated. The format's default for this length is ${bounds.target}; use another number only if the brief says so.`;
}

export function buildLongSystemPrompt(
  packetMode = false,
  bounds: ChapterBounds = chapterBounds({ targetSeconds: 600 }),
): string {
  return `You are a master historical documentary filmmaker and a high-retention YouTube scriptwriter. Your writing style is immersive, suspenseful, and deeply atmospheric, similar to high-end history productions (e.g., Netflix's historical epics or premium storytelling channels).

Given a topic, a founder's brief, ${packetMode ? 'an evidence packet' : 'source materials'}, and optional style rules, respond with ONLY a raw JSON object matching this exact shape:
{"chapters": [{"title": string, "text": string}], "hashtags": string[]}

Narrative Architecture & Pacing Rules:
- Structure: ${chapterStructureRule(bounds)}
- Word Count: The "text" field of every single chapter must be spoken narration containing at least ${bounds.minWords} words (10 seconds when read aloud).
- The Cold Open (Chapter 1): Drop the viewer directly into a high-stakes, dramatic, or mysterious moment in history. The first 50 to 100 words must build intense narrative tension *before* explaining the broader historical context. NEVER start with a generic question or an introductory greeting.
- Micro-Pacing & Pacing Cues: Write in short, rhythmic, punchy sentences. Use ellipses (...) to force natural dramatic pauses or breaths in speech synthesis, and en-dashes (—) to mark sudden, dramatic shifts in the historical narrative.
- Chapter Transitions: NEVER start a chapter with an explicit question. Instead, open chapters with active historical conflict, a turning point, or a shifting perspective. The "title" should be a highly compelling, cinematic label.
- Narrative Loops: Plant one or two deep historical mysteries or open loops early in the video, explicitly resolving them in a much later chapter to maintain viewer retention.
- The Climax & Outro: The final chapter must build to the ultimate historical resolution and close with a lingering, provocative thought or a cliffhanger that seamlessly bridges to a future topic. Absolute ban on generic sign-offs like "Thanks for watching."

Content Restrictions & Delivery:
- Strict Factual Grounding: ${packetMode ? 'Rely exclusively on factual text supplied in the evidence packet brief. Citation-only URLs are unfetched and provide no facts.' : 'Rely EXCLUSIVELY on facts explicitly provided in the brief and sources.'} Do not invent dates, statistics, names, or historical claims. If source material is thin, narrow the focus and intensify the dramatic depth of the existing facts rather than hallucinating details.
- Technical Formatting: Spoken narration text only. NO stage directions, NO audio cues in brackets, and NO markdown headings inside the text strings.
- Escape Strings Safely: Never use the straight double-quote character (") inside a text value other than as the JSON delimiter. For internal quotes or dialogue, use curly quotes (“ ”) or single quotes. Apostrophes are permitted.
- Tags: "hashtags" must be an array of 3 to 8 relevant historical search terms, excluding the '#' character.

Output Execution:
Respond with raw JSON only. Do not wrap the response in markdown code blocks (\`\`\`json), and provide no pre-text or post-text commentary.`;
}

export function buildLongTargetLine(targetSeconds: number): string {
  const { min, max } = lengthRange(targetSeconds);
  return `Target length: about ${Math.round(targetSeconds / 60)} minutes when narrated aloud (${targetSeconds} seconds). Write around ${targetWordCount(targetSeconds)} words in total across all chapters (natural pace, about ${LONG_WORDS_PER_MINUTE} words per minute); keep it between ${min} and ${max} words (within 10% of the target); anything outside that is sent back for a rewrite.`;
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
): string {
  const { min, max } = lengthRange(targetSeconds);
  const direction = wordCount > max ? "too long" : "too short";
  return `Your script is ${wordCount} words, which is ${direction}. The target is about ${targetWordCount(targetSeconds)} words (allowed ${min} to ${max}) for ${Math.round(targetSeconds / 60)} minutes. Rewrite it to land inside that range, keeping the same structure and using only the same facts. Reply again with ONLY the corrected JSON object.`;
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
