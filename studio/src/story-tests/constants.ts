// Sprint 6 Task 3 (P19). Part A: angle pairing before the script is written. Every number a reader of this module
// would ask about is here, once.

export const STORY_TESTS_VERSION = 1;

// R1: four or five angles; a title and a one-line promise each.
export const ANGLES_MIN = 4;
export const ANGLES_MAX = 5;
export const TITLE_MAX_CHARS = 70;
export const PROMISE_MAX_CHARS = 220;

// R8: the hard spend cap for Part A on one run (the angle call and the two reader calls together).
export const PART_A_CAP_USD = 0.1;

// Decision 2: one neutral reader for every channel. A channel's own line, when it has one, replaces this sentence.
export const DEFAULT_READER_PERSONA = 'a stranger scrolling their feed, no prior interest in this subject, ready to swipe if bored.';

// Reader-facing ids: neutral and unrelated to position, so the order a reader sees carries no meaning.
export const READER_ID_POOL = ['K', 'M', 'P', 'R', 'T', 'V', 'X'] as const;
