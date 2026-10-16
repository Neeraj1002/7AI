import { z } from "zod";

// Sprint 4 Task 9 (R2): the pure half of long-form script generation: the prompt, the reply
// shape, the length rule and the Gate 1 chapter edit sheet. No model calls here.

// Measured on the 2-minute real run of 2026-10-11 (276 words narrated in 106.66 s, voice alloy,
// tts-1-hd): 155 words per minute. The earlier plan of 145 asked for scripts that narrate about 7%
// short even when hit exactly. The pace is logged for every run (measuredWordsPerMinute) so this can
// be re-calibrated from real data.
export const LONG_WORDS_PER_MINUTE = 155;
// A script is accepted without repair when its word count is within +-10% of the target; up to
// LONG_MAX_LENGTH_REPAIRS repairs are tried to get there. Past that the run continues anyway, and
// is only flagged (lengthOutOfRange) when it is still outside +-20%. Length never fails a run.
export const LONG_LENGTH_TOLERANCE = 0.1;
export const LONG_LENGTH_HARD_TOLERANCE = 0.2;
export const LONG_MAX_LENGTH_REPAIRS = 2;
export const LONG_MIN_CHAPTERS = 3;
export const LONG_MAX_CHAPTERS = 6;
export const LONG_MIN_CHAPTER_WORDS = 25;
// 15 minutes is about 2,200 words (~3,300 tokens); this is headroom, not a target.
export const LONG_SCRIPT_MAX_TOKENS = 12_000;

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
export function validateChapters(chapters: ScriptChapter[]): string | null {
  if (
    chapters.length < LONG_MIN_CHAPTERS ||
    chapters.length > LONG_MAX_CHAPTERS
  ) {
    return `expected ${LONG_MIN_CHAPTERS} to ${LONG_MAX_CHAPTERS} chapters, got ${chapters.length}`;
  }
  const short = chapters.findIndex(
    (c) => countWords(c.text) < LONG_MIN_CHAPTER_WORDS,
  );
  if (short >= 0) {
    return `chapter ${short + 1} ("${chapters[short].title}") has ${countWords(chapters[short].text)} words; every chapter needs at least ${LONG_MIN_CHAPTER_WORDS}`;
  }
  return null;
}

export function buildLongSystemPrompt(packetMode = false): string {
  return `You are a master historical documentary filmmaker and a high-retention YouTube scriptwriter. Your writing style is immersive, suspenseful, and deeply atmospheric, similar to high-end history productions (e.g., Netflix's historical epics or premium storytelling channels).

Given a topic, a founder's brief, ${packetMode ? 'an evidence packet' : 'source materials'}, and optional style rules, respond with ONLY a raw JSON object matching this exact shape:
{"chapters": [{"title": string, "text": string}], "hashtags": string[]}

Narrative Architecture & Pacing Rules:
- Structure: Generate exactly ({LONG_MIN_CHAPTERS} to){LONG_MAX_CHAPTERS} chapters, written exactly in the order they will be narrated. 
- Word Count: The "text" field of every single chapter must be spoken narration containing at least \${LONG_MIN_CHAPTER_WORDS} words.
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

export const CHAPTER_EDIT_TOO_FEW_MESSAGE = `The edited script needs at least ${LONG_MIN_CHAPTERS} chapters, each starting with a line like "## Chapter title".`;

export type ParsedChapterSheet =
  | { ok: true; chapters: ScriptChapter[] }
  | { ok: false; message: string };

export function parseChapterSheet(sheet: string): ParsedChapterSheet {
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
  if (nonEmpty.length < LONG_MIN_CHAPTERS)
    return { ok: false, message: CHAPTER_EDIT_TOO_FEW_MESSAGE };
  return { ok: true, chapters: nonEmpty };
}
