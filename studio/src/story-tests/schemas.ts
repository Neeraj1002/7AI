import { z } from 'zod';
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

export type StoredCall = {
  purpose: 'story-angles' | 'story-pair-reader';
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
