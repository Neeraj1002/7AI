// Sprint 5 Task 7 follow-up R3 — how many chapters a long script may have and how short a chapter may be is the server's to
// decide (studio/src/long-form/chapter-bounds.ts, per video length and per brief). The app does not keep a copy of those
// numbers; it reads them from `runs.get.chapterBounds { min, max, minWordsPerChapter, exactCount }` (null for a Short).
// Until the server sends that field (it is not on `main` yet), the Gate 1 editor shows the live count without a limit and the
// server's own message after Save is shown as sent.
export type ChapterBounds = {
  min: number;
  max: number;
  minWordsPerChapter: number;
  /** The brief listed its chapter titles, so the count must be exactly `min` (= `max`). */
  exactCount: boolean;
};

const int = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);

/** Reads `runs.get.chapterBounds` defensively; null for a Short, an older server, or malformed data. */
export function chapterBoundsOf(data: unknown): ChapterBounds | null {
  const b = (data as { chapterBounds?: Record<string, unknown> | null } | undefined)?.chapterBounds;
  if (!b || typeof b !== 'object') return null;
  const min = int(b.min);
  const max = int(b.max);
  const words = int(b.minWordsPerChapter);
  if (min === null || max === null || words === null || max < min) return null;
  const exact = b.exactCount === true || (typeof b.exactCount === 'number' && b.exactCount === min && min === max);
  return { min, max, minWordsPerChapter: words, exactCount: exact || min === max };
}

/** "exactly 4 chapters" or "3 to 20 chapters". */
export function rangeText(b: ChapterBounds): string {
  return b.exactCount ? `exactly ${b.min} ${b.min === 1 ? 'chapter' : 'chapters'}` : `${b.min} to ${b.max} chapters`;
}
