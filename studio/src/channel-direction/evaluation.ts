import type { DirectionPresetKey } from './presets';

// R8 is a separate, explicitly capped campaign. These helpers do no I/O and make no model calls.
export const TASK4_EVALUATION_CEILING_USD = 6;
export const NEUTRAL_SHORT_BRIEFS = [
  {
    id: 'neutral-short-library',
    brief: 'Fictional supplied example: a neighbourhood lending library has a shelf at the entrance. A visitor leaves one book and takes one book. A volunteer checks the shelf each evening. Write a 30-second Short explaining this process. Use only these supplied details; do not add dates, prices or claims about actual libraries.',
  },
  {
    id: 'neutral-short-timer',
    brief: 'Fictional supplied example: a kitchen timer has a dial and a bell. Turning the dial sets the interval. The dial moves back as the interval passes. The bell rings when the dial reaches the end. Write a 30-second Short explaining this sequence. Use only these supplied details; do not add a mechanism or claim about a real product.',
  },
] as const;

export type EvaluationText = { scriptText: string; reviewNotes: string; frameReview: string };
export type DirectionLeak = { field: keyof EvaluationText; word: string; offset: number };

// A conservative lexical flag, not a verdict about factual support or quality.
// Preserve each field and match position so the reviewer can inspect false positives.
export function directionLeaks(preset: DirectionPresetKey, output: EvaluationText): DirectionLeak[] {
  if (preset === 'history') return [];
  return (Object.entries(output) as [keyof EvaluationText, string][]).flatMap(([field, text]) =>
    [...text.matchAll(/\b(?:history|historic(?:al(?:ly)?)?|historian(?:s)?|textbook(?:s)?)\b/gi)]
      .map(match => ({ field, word: match[0], offset: match.index! })),
  );
}

// Reserve the full worst case BEFORE a call. Unknown usage remains reserved; never count it as zero.
export function evaluationReservationFits(chargedOrReservedUsd: number, nextWorstCaseUsd: number): boolean {
  return Number.isFinite(chargedOrReservedUsd) && Number.isFinite(nextWorstCaseUsd)
    && chargedOrReservedUsd >= 0 && nextWorstCaseUsd >= 0
    && chargedOrReservedUsd + nextWorstCaseUsd <= TASK4_EVALUATION_CEILING_USD;
}
