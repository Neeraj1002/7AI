import { z } from 'zod';

// Sprint 4 Task 9 (R2): the pure half of long-form script generation: the prompt, the reply
// shape, the length rule and the Gate 1 chapter edit sheet. No model calls here.

export const LONG_WORDS_PER_MINUTE = 145;
export const LONG_LENGTH_TOLERANCE = 0.2;
export const LONG_MIN_CHAPTERS = 3;
export const LONG_MAX_CHAPTERS = 6;
export const LONG_MIN_CHAPTER_WORDS = 25;
// 15 minutes is about 2,200 words (~3,300 tokens); this is headroom, not a target.
export const LONG_SCRIPT_MAX_TOKENS = 12_000;

export const ScriptChapterSchema = z.object({ title: z.string().min(1), text: z.string().min(1) });
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

export function lengthRange(targetSeconds: number): { min: number; max: number } {
  const target = targetWordCount(targetSeconds);
  return { min: Math.floor(target * (1 - LONG_LENGTH_TOLERANCE)), max: Math.ceil(target * (1 + LONG_LENGTH_TOLERANCE)) };
}

export function isLengthInRange(wordCount: number, targetSeconds: number): boolean {
  const { min, max } = lengthRange(targetSeconds);
  return wordCount >= min && wordCount <= max;
}

// scriptText stays the concatenation of the chapter texts, so every existing reader keeps working.
export function joinChapterTexts(chapters: ScriptChapter[]): string {
  return chapters.map((c) => c.text.trim()).join('\n\n');
}

// A reply that parses but breaks the structure rules is handled like a reply that does not parse.
export function validateChapters(chapters: ScriptChapter[]): string | null {
  if (chapters.length < LONG_MIN_CHAPTERS || chapters.length > LONG_MAX_CHAPTERS) {
    return `expected ${LONG_MIN_CHAPTERS} to ${LONG_MAX_CHAPTERS} chapters, got ${chapters.length}`;
  }
  const short = chapters.findIndex((c) => countWords(c.text) < LONG_MIN_CHAPTER_WORDS);
  if (short >= 0) {
    return `chapter ${short + 1} ("${chapters[short].title}") has ${countWords(chapters[short].text)} words; every chapter needs at least ${LONG_MIN_CHAPTER_WORDS}`;
  }
  return null;
}

export function buildLongSystemPrompt(): string {
  return `You write scripts for a long-form YouTube video (landscape, several minutes), narrated by one voice.
Given a topic, the founder's brief and sources, and optional style rules, respond with ONLY a JSON object of the shape:
{"chapters": [{"title": string, "text": string}], "hashtags": string[]}

Structure:
- ${LONG_MIN_CHAPTERS} to ${LONG_MAX_CHAPTERS} chapters, in the order they are narrated. The "text" of every chapter is spoken narration, at least ${LONG_MIN_CHAPTER_WORDS} words.
- The first chapter opens with a cold open: its first 20 to 40 seconds (about 50 to 100 words) hook the viewer with the most surprising thing in the material, before any introduction.
- Every chapter opens with the question it answers (as a spoken sentence), and "title" is a short plain label for that chapter.
- Plant one or two open loops (a question or promise the viewer wants answered) that a LATER chapter answers explicitly.
- The final chapter ends with a closing line that points forward (what to look at next), not a generic sign-off.
- Natural spoken sentences, no stage directions, no bracketed notes, no headings inside the text.

Facts: use ONLY facts stated in the brief and the listed sources. Do not add dates, prices, names, statistics, quotations or claims that are not in them. When the material is thin for a chapter, say less rather than invent.

Never use the straight double-quote character (") inside a string value other than as the JSON delimiter. To quote a word or phrase, use curly quotes (“ ”) or single quotes. Apostrophes are fine.
Respect every listed constraint, banned phrase and style rule in the user message.
"hashtags" is a short list (3-8) of relevant hashtags, without the '#' character.
Respond with raw JSON only: no markdown code fences, no commentary.`;
}

export function buildLongTargetLine(targetSeconds: number): string {
  const { min, max } = lengthRange(targetSeconds);
  return `Target length: about ${Math.round(targetSeconds / 60)} minutes when narrated aloud (${targetSeconds} seconds). Write around ${targetWordCount(targetSeconds)} words in total across all chapters (natural pace, about ${LONG_WORDS_PER_MINUTE} words per minute); anything outside ${min} to ${max} words is too far off.`;
}

export function buildLengthRepairMessage(wordCount: number, targetSeconds: number): string {
  const { min, max } = lengthRange(targetSeconds);
  const direction = wordCount > max ? 'too long' : 'too short';
  return `Your script is ${wordCount} words, which is ${direction}. The target is about ${targetWordCount(targetSeconds)} words (allowed ${min} to ${max}) for ${Math.round(targetSeconds / 60)} minutes. Rewrite it to land inside that range, keeping the same structure and using only the same facts. Reply again with ONLY the corrected JSON object.`;
}

// ---- Gate 1 edit sheet -----------------------------------------------------------------------

// The edit sheet shows each chapter as "## Title" followed by its text.
export function formatChapterSheet(chapters: ScriptChapter[]): string {
  return chapters.map((c) => `## ${c.title.trim()}\n${c.text.trim()}`).join('\n\n');
}

export const CHAPTER_EDIT_TOO_FEW_MESSAGE = `The edited script needs at least ${LONG_MIN_CHAPTERS} chapters, each starting with a line like "## Chapter title".`;

export type ParsedChapterSheet = { ok: true; chapters: ScriptChapter[] } | { ok: false; message: string };

export function parseChapterSheet(sheet: string): ParsedChapterSheet {
  const chapters: ScriptChapter[] = [];
  let current: { title: string; lines: string[] } | null = null;
  const preamble: string[] = [];
  for (const line of sheet.replace(/\r\n/g, '\n').split('\n')) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) {
      if (current) chapters.push({ title: current.title, text: current.lines.join('\n').trim() });
      current = { title: heading[1], lines: [] };
    } else if (current) {
      current.lines.push(line);
    } else if (line.trim()) {
      preamble.push(line);
    }
  }
  if (current) chapters.push({ title: current.title, text: current.lines.join('\n').trim() });
  if (preamble.length > 0) {
    return { ok: false, message: 'There is text before the first "## Chapter title" line. Put every part of the script under a chapter heading.' };
  }
  const nonEmpty = chapters.filter((c) => c.text.length > 0);
  if (nonEmpty.length < LONG_MIN_CHAPTERS) return { ok: false, message: CHAPTER_EDIT_TOO_FEW_MESSAGE };
  return { ok: true, chapters: nonEmpty };
}
