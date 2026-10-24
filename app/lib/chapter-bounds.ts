// Sprint 5 Task 7 follow-up R3 — how many chapters a long script may have and how short a chapter may be is the server's to
// decide (studio/src/long-form/chapter-bounds.ts, per video length and per brief). The app does not keep a copy of those
// numbers; it reads them from `runs.get.chapterBounds { min, max, editMin, editMax, targetWords, minWordsPerChapter,
// exactCount }` (null for a Short; BUGS_CHAPTER_BOUNDS_R9). The Gate 1 edit is judged against editMin/editMax, which is what
// the server's edit check accepts. With no bounds the editor shows the live count without a limit and the server's own
// message after Save is shown as sent.
export type ChapterBounds = {
  /** What the writer plans (the brief's titles, or the length's default). */
  min: number;
  max: number;
  /** What the Gate 1 edit check accepts for this run's length; the editor judges against these. */
  editMin: number;
  editMax: number;
  targetWords: number;
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
  // editMin/editMax/targetWords came with R9; an earlier shape falls back to the planned range.
  const editMin = int(b.editMin) ?? min;
  const editMax = int(b.editMax) ?? max;
  if (min === null || max === null || words === null || max < min || editMin === null || editMax === null || editMax < editMin) return null;
  const exact = b.exactCount === true || (typeof b.exactCount === 'number' && b.exactCount === min && min === max);
  return { min, max, editMin, editMax, targetWords: int(b.targetWords) ?? 0, minWordsPerChapter: words, exactCount: exact || min === max };
}

/** The range a Gate 1 edit may have: "exactly 4 chapters" or "3 to 20 chapters". */
export function rangeText(b: ChapterBounds): string {
  return b.editMin === b.editMax ? `exactly ${b.editMin} ${b.editMin === 1 ? 'chapter' : 'chapters'}` : `${b.editMin} to ${b.editMax} chapters`;
}
