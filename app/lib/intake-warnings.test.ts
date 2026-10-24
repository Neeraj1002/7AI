// Sprint 5 Task 7 follow-up R4. Run with the server's vitest: cd studio && npx vitest run --root ../app
import { describe, it, expect } from 'vitest';
import { intakeWarningsOf } from './intake-warnings';

describe('intake warnings', () => {
  it('absent means nothing', () => {
    expect(intakeWarningsOf(undefined)).toEqual([]);
    expect(intakeWarningsOf({})).toEqual([]);
    expect(intakeWarningsOf({ creationOptions: null })).toEqual([]);
    expect(intakeWarningsOf({ creationOptions: { intakeWarnings: [] } })).toEqual([]);
  });
  it('one warning', () => {
    const w = 'Each chapter averages about 30 seconds; chapters usually work better at 40 or more';
    expect(intakeWarningsOf({ creationOptions: { intakeWarnings: [w] } })).toEqual([w]);
  });
  it('several, in order, without blanks or repeats', () => {
    const run = { creationOptions: { intakeWarnings: [' First. ', '', 'Second.', 7, 'First.'] } };
    expect(intakeWarningsOf(run)).toEqual(['First.', 'Second.']);
  });
});
