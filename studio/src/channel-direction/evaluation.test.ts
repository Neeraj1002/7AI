import { expect, it } from 'vitest';
import { directionLeaks, evaluationReservationFits, NEUTRAL_SHORT_BRIEFS } from './evaluation';

it('flags leakage separately in script, review notes and frame review', () => {
  const output = { scriptText: 'A historical moment.', reviewNotes: 'Use a textbook opening.', frameReview: 'Judge as history.' };
  expect(directionLeaks('explainer', output)).toEqual([
    { field: 'scriptText', word: 'historical', offset: 2 },
    { field: 'reviewNotes', word: 'textbook', offset: 6 },
    { field: 'frameReview', word: 'history', offset: 9 },
  ]);
  expect(directionLeaks('story-first', output)).toHaveLength(3);
  expect(directionLeaks('neutral', output)).toHaveLength(3);
  expect(directionLeaks('history', output)).toEqual([]);
  expect(directionLeaks('neutral', { scriptText: 'Turn the dial.', reviewNotes: 'Clear steps.', frameReview: 'Fits the narration.' })).toEqual([]);
  expect(NEUTRAL_SHORT_BRIEFS).toHaveLength(2);
});

it('stops before the total ceiling and keeps unresolved calls reserved', () => {
  expect(evaluationReservationFits(5.5, 0.5)).toBe(true);
  expect(evaluationReservationFits(5.5, 0.51)).toBe(false);
  expect(evaluationReservationFits(6, 0.01)).toBe(false);
  for (const invalid of [NaN, Infinity, -1]) expect(evaluationReservationFits(invalid, 0.1)).toBe(false);
});
