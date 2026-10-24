// Sprint 5 Task 7 R7 — live checks for the Gate 1 script editor, so a problem shows while typing instead of after Save.
// The chapter rules mirror the server's `parseChapterSheet` (studio/src/agents/script-generation/long-form.ts); the
// server still decides on Save and its message is shown if it rejects.
export const MIN_CHAPTERS = 3;
export const WORDS_PER_MINUTE = 155; // LONG_WORDS_PER_MINUTE on the server
/** A script under this share of the target length fails the quality floor. */
export const LENGTH_FLOOR = 0.8;

export const CHAPTER_HINT = 'Start each chapter with a line like "## Chapter title".';

export type ChapterCheck = { ok: boolean; chapters: number; message: string | null };

export function checkChapterSheet(text: string): ChapterCheck {
  let current: string[] | null = null;
  let preamble = false;
  const bodies: string[] = [];
  const flush = () => {
    if (current) bodies.push(current.join('\n').trim());
  };
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    if (/^##\s+(.+?)\s*$/.test(line)) {
      flush();
      current = [];
    } else if (current) {
      current.push(line);
    } else if (line.trim()) {
      preamble = true;
    }
  }
  flush();
  const chapters = bodies.filter((b) => b.length > 0).length;
  if (preamble) {
    return { ok: false, chapters, message: 'There is text before the first "## Chapter title" line. Put every part of the script under a chapter heading.' };
  }
  if (chapters < MIN_CHAPTERS) {
    return { ok: false, chapters, message: `Needs at least ${MIN_CHAPTERS} chapters, each starting with "## Chapter title" (${chapters} so far).` };
  }
  return { ok: true, chapters, message: null };
}

/** Narration words: chapter heading lines are not spoken. */
export function narrationWords(text: string): number {
  const spoken = text
    .split(/\r?\n/)
    .filter((l) => !/^##\s/.test(l))
    .join(' ')
    .trim();
  return spoken ? spoken.split(/\s+/).length : 0;
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
