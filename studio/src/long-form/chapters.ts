// Sprint 4 Task 10 (R4.1): the chapter list YouTube turns into video chapters. Pure, so the
// three YouTube rules are unit-testable.

export type ChapterTiming = { title: string; startSec: number; endSec: number };

// YouTube's own rules for automatic chapters: first stamp at 00:00, at least 3 chapters, each
// at least 10 seconds long.
export const MIN_CHAPTERS = 3;
export const MIN_CHAPTER_SECONDS = 10;

// m:ss, or h:mm:ss from one hour on.
export function formatTimestamp(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

// The list's first line is always `00:00 <title>` (YouTube requires that exact start).
function stamp(index: number, startSec: number): string {
  return index === 0 ? '00:00' : formatTimestamp(startSec);
}

export type ChapterListResult =
  | { ok: true; text: string }
  | { ok: false; warning: string };

export function buildChapterList(timings: ChapterTiming[] | undefined): ChapterListResult {
  if (!timings || timings.length < MIN_CHAPTERS) {
    return { ok: false, warning: `Chapter list left out: YouTube needs at least ${MIN_CHAPTERS} chapters (this video has ${timings?.length ?? 0}).` };
  }
  const short = timings.find((c) => c.endSec - c.startSec < MIN_CHAPTER_SECONDS);
  if (short) {
    return { ok: false, warning: `Chapter list left out: chapter "${short.title}" is shorter than ${MIN_CHAPTER_SECONDS} seconds.` };
  }
  if (Math.floor(timings[0].startSec) !== 0) {
    return { ok: false, warning: 'Chapter list left out: the first chapter does not start at 00:00.' };
  }
  const text = timings.map((c, i) => `${stamp(i, c.startSec)} ${c.title.trim()}`).join('\n');
  return { ok: true, text };
}

// Appends the list after the description. A description that already ends in a list is not
// changed twice (publishing can re-run).
export function appendChapterList(description: string, list: string): string {
  if (description.includes(list)) return description;
  return `${description.trimEnd()}\n\n${list}`;
}

// A 16:9 upload is not a Short: never carry #shorts in title, description or tags.
export function stripShortsTag(text: string): string {
  return text.replace(/(^|\s)#shorts\b/gi, '$1').replace(/[ \t]+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').trim();
}
export function stripShortsFromTags(tags: string[]): string[] {
  return tags.filter((t) => t.trim().replace(/^#+/, '').toLowerCase() !== 'shorts');
}
