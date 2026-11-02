import { expect, it } from 'vitest';
import { parseAssignments, withDirection, onlyDirectionChanged } from './admin-plan';

it('requires three distinct known assignments', () => {
  expect(parseAssignments(['A=history', 'B=story-first', 'C=explainer'])).toHaveLength(3);
  expect(() => parseAssignments(['A=history'])).toThrow();
  expect(() => parseAssignments(['A=history', 'B=story-first', 'C=unknown'])).toThrow();
  expect(() => parseAssignments(['A=history', 'A=story-first', 'C=explainer'])).toThrow();
});

it('changes only direction and preserves an existing note', () => {
  const before = { script: { guide: 'Guide' }, direction: { preset: 'neutral' as const, note: 'Note' } };
  const after = withDirection(before, 'history');
  expect(after).toEqual({ ...before, direction: { preset: 'history', note: 'Note' } });
  expect(onlyDirectionChanged(before, after)).toBe(true);
  expect(onlyDirectionChanged(before, { ...after, script: { guide: 'Wrong' } })).toBe(false);
});
