import { z } from 'zod';
import type { Purpose } from '../llm';
import { ANGLES_MAX, ANGLES_MIN } from './constants';

// What the angle call returns. Code validates the lengths and duplicates (angles.ts); the schema only fixes the shape.
export const AngleReplySchema = z.object({
  angles: z.array(z.object({ title: z.string(), promise: z.string() })),
});
export type AngleReply = z.infer<typeof AngleReplySchema>;

// What one pair-reader run returns: the id it would click, the id it would skip, and a line of why for each.
export const PairReaderReplySchema = z.object({
  click: z.object({ id: z.string(), why: z.string() }),
  skip: z.object({ id: z.string(), why: z.string() }),
});
export type PairReaderReply = z.infer<typeof PairReaderReplySchema>;

export type StoredAngle = { id: string; title: string; promise: string; figureFlag: string | null };

export type StoredReaderRun = {
  run: 1 | 2;
  // Angle ids in the order this reader saw them, and the neutral id each was shown under.
  order: string[];
  shownAs: Record<string, string>;
  // Angle ids, mapped back by code. null when the run was invalid.
  clickId: string | null;
  clickWhy: string | null;
  skipId: string | null;
  skipWhy: string | null;
  error: string | null;
};

export type HookShape = { firstSentenceWordCount: number; kind: 'question' | 'statement'; hasFigure: boolean };

export type StoredCall = {
  purpose: Extract<Purpose, 'story-angles' | 'story-pair-reader' | 'story-cold-reader' | 'story-promise-match'>;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number | null;
};

export type StoredMark = 'clear_winner' | 'no_clear_winner' | 'no_clear_winner_reader_error';

// The Part A record, kept on the intake stage row's output as `storyTests` (contract C1). Written with the intake
// stage's completion, so it survives a restart.
export type StoredAngleStep = {
  status: 'waiting' | 'chosen' | 'skipped' | 'not_run';
  notRunReason: string | null;
  angles: StoredAngle[];
  readerRuns: StoredReaderRun[];
  mark: StoredMark | null;
  readerTopId: string | null;
  chosenId: string | null;
  choseReaderPick: boolean | null;
  chosenAt: string | null;
};

export type StoredStoryTests = {
  version: 1;
  angleStep: StoredAngleStep;
  calls: StoredCall[];
  costUsd: number;
  // Written by code when each step happens, never edited later (Part C extends this).
  tags: { storyTests: 'on'; partA: 'used' | 'skipped' | 'not_run' };
};

export const ANGLE_COUNT_RANGE = `${ANGLES_MIN} to ${ANGLES_MAX}`;

// ---- Part B: the cold reader on the finished script ----

// What the cold reader returns (R4): six fields. `swipe_line` is an exact quote from the script or the word "none".
export const ColdReaderReplySchema = z.object({
  about: z.string(),
  why_care: z.string(),
  swipe_line: z.string(),
  remembered: z.string(),
  first_sentence_keeps_me: z.object({ keeps: z.enum(['yes', 'no']), why: z.string() }),
  weakest_sentence: z.object({ quote: z.string(), why: z.string() }),
});
export type ColdReaderReply = z.infer<typeof ColdReaderReplySchema>;

// The promise-match check: for each of the reader's two answers, does it match the promise, with one short line.
export const PromiseMatchReplySchema = z.object({
  about: z.object({ match: z.enum(['yes', 'no']), note: z.string() }),
  remembered: z.object({ match: z.enum(['yes', 'no']), note: z.string() }),
});
export type PromiseMatchReply = z.infer<typeof PromiseMatchReplySchema>;

export type ScriptCheckReasonCode = 'cant_tell' | 'swipe_early' | 'first_sentence_no' | 'promise_mismatch';

// The Part B record, kept on the script review stage's output as `storyTest` (contract C1). Version 1.
export type StoredScriptCheck = {
  version: 1;
  status: 'ran' | 'not_run';
  notRunReason: string | null;
  // The script the reader saw: a hash of its text, so a later edit is noticed (no re-run).
  scriptHash: string;
  format: 'short' | 'long';
  reader: ColdReaderReply | null;
  // Where the swipe quote sits: 0 to 100, or null for "none" (or not found).
  swipeAtPercent: number | null;
  verdict: 'pass' | 'fail' | null;
  reasons: ScriptCheckReasonCode[];
  promiseMatch: { ran: boolean; note: string; about: { match: 'yes' | 'no'; note: string } | null; remembered: { match: 'yes' | 'no'; note: string } | null };
  // The chosen angle's title and promise the match check compared against (null when none).
  promiseUsed: { title: string; promise: string } | null;
  calls: StoredCall[];
  costUsd: number;
  tags: { partB: 'ran' | 'not_run' };
  // Part C: the first sentence's shape, from code, for the script this check read. Absent on a check stored before Part C.
  hookShape?: HookShape | null;
};
