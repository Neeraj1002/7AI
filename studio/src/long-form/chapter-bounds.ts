// Bugs (chapter bounds): the one place that decides how many chapters a long-form video may have, how
// short a chapter may be, and how many words a minute of narration is. Script Generation (prompt,
// reply check, repair message), the Gate 1 edit sheet, intake, the Script Review prompt and the YouTube
// chapter list all read these, so no two of them can disagree.
//
// Pure: no imports, so anything may use it.

// Measured on the 2-minute real run of 2026-10-11 (276 words narrated in 106.66 s, voice alloy,
// tts-1-hd): 155 words per minute. The earlier plan of 145 asked for scripts that narrate about 7%
// short even when hit exactly. The pace is logged for every run (measuredWordsPerMinute) so this can
// be re-calibrated from real data.
export const LONG_WORDS_PER_MINUTE = 155;

// YouTube's own rules for automatic chapters: first stamp at 00:00, at least 3 chapters, each at least
// 10 seconds long. The ceiling is ours: past 20 the stills, the review frames and the description list
// stop being useful.
export const MIN_CHAPTERS = 3;
export const MAX_CHAPTERS = 20;
export const MIN_CHAPTER_SECONDS = 10;
// 10 seconds of speech at the long-form pace (about 25 words).
export const MIN_CHAPTER_WORDS = Math.ceil((MIN_CHAPTER_SECONDS * LONG_WORDS_PER_MINUTE) / 60);
// Below this average the video is a slideshow of fragments: a warning at intake, never a failure.
export const SOFT_MIN_AVERAGE_CHAPTER_SECONDS = 40;
// With no titles in the brief the format's pattern applies: one chapter for about every 2.5 minutes
// (2 min: 3, 10 min: 4, 15 min: 6).
export const DEFAULT_SECONDS_PER_CHAPTER = 150;

export type ChapterBounds = {
  // The chapter counts a script may have (both ends included).
  min: number;
  max: number;
  // The count the prompt asks for. Equal to min and max when the brief lists its titles.
  target: number;
  // The brief's titles, in order, or null when it lists none.
  titles: string[] | null;
  minWords: number;
};

// The most chapters a video of this length can have and still give each one the 10-second minimum.
export function maxChaptersFor(targetSeconds: number): number {
  return Math.max(
    MIN_CHAPTERS,
    Math.min(MAX_CHAPTERS, Math.floor(targetSeconds / MIN_CHAPTER_SECONDS)),
  );
}

export function defaultChapterCount(targetSeconds: number): number {
  const wanted = Math.round(targetSeconds / DEFAULT_SECONDS_PER_CHAPTER);
  return Math.min(maxChaptersFor(targetSeconds), Math.max(MIN_CHAPTERS, wanted));
}

// A brief that lists chapter titles sets the chapter count. With no titles (or a list outside the
// allowed range, which intake refuses before any spend) the format's default pattern applies.
export function chapterBounds(params: {
  targetSeconds: number;
  briefTitles?: string[] | null;
}): ChapterBounds {
  const max = maxChaptersFor(params.targetSeconds);
  const titles = params.briefTitles ?? null;
  if (titles && titles.length >= MIN_CHAPTERS && titles.length <= max) {
    return {
      min: titles.length,
      max: titles.length,
      target: titles.length,
      titles,
      minWords: MIN_CHAPTER_WORDS,
    };
  }
  return {
    min: MIN_CHAPTERS,
    max,
    target: defaultChapterCount(params.targetSeconds),
    titles: null,
    minWords: MIN_CHAPTER_WORDS,
  };
}

export function describeAllowedChapters(bounds: ChapterBounds): string {
  return bounds.min === bounds.max
    ? `exactly ${bounds.min}`
    : `${bounds.min} to ${bounds.max}`;
}

// The reply check, the repair message and the Gate 1 edit check share this sentence: the count that
// came back and the range that is allowed.
export function chapterCountProblem(
  count: number,
  bounds: ChapterBounds,
  subject = 'Your reply',
): string | null {
  if (count >= bounds.min && count <= bounds.max) return null;
  const why = bounds.titles
    ? ` (the brief lists ${bounds.titles.length} chapter titles)`
    : '';
  return `${subject} has ${count} chapters, but this video needs ${describeAllowedChapters(bounds)} chapters${why}`;
}

export function averageChapterSeconds(
  targetSeconds: number,
  chapterCount: number,
): number {
  return targetSeconds / chapterCount;
}

// The script's word target: a count stated in the brief wins, else minutes x pace.
export function scriptTargetWords(
  targetSeconds: number,
  wordsPerMinute: number,
  statedWords: number | null,
): number {
  return statedWords ?? Math.round((targetSeconds / 60) * wordsPerMinute);
}

// What the app is told (runs.get.chapterBounds), so it never copies the numbers.
// min/max/exactCount are what generation needs (exactCount: the brief lists its titles, then min equals max);
// editMin/editMax are what the Gate 1 edit check (parseChapterSheet) accepts for this run's length;
// targetWords is the script target the server plans and checks against.
export type ChapterBoundsView = {
  min: number;
  max: number;
  minWordsPerChapter: number;
  exactCount: boolean;
  editMin: number;
  editMax: number;
  targetWords: number;
};

export function chapterBoundsView(
  bounds: ChapterBounds,
  targetSeconds: number,
  targetWords: number,
): ChapterBoundsView {
  const edit = chapterBounds({ targetSeconds });
  return {
    min: bounds.min,
    max: bounds.max,
    minWordsPerChapter: bounds.minWords,
    exactCount: bounds.titles !== null,
    editMin: edit.min,
    editMax: edit.max,
    targetWords,
  };
}
