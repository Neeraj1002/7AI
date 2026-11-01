import { describe, expect, it } from 'vitest';
import { angleStepSkipReason, briefFixesStructure } from './skip';
import { anglesSystem, pairReaderSystem } from './prompts';
import { PROMISE_MAX_CHARS, REASON_MAX_WORDS, TITLE_MAX_CHARS } from './constants';

describe('angleStepSkipReason', () => {
  it('runs for a plain brief on a channel with Gate 1 on', () => {
    expect(angleStepSkipReason({ gate1Enabled: true, briefText: 'Topic: how bridges carry load' })).toBeNull();
  });
  it('skips when Gate 1 is off', () => {
    expect(angleStepSkipReason({ gate1Enabled: false, briefText: 'Topic: a plain topic' })).toMatch(/Gate 1 is off/);
  });
  it('skips when the brief fixes the opening or closing sentence', () => {
    expect(briefFixesStructure('The first sentence must be exactly: "It began quietly."')).toBe(true);
    expect(briefFixesStructure('The last sentence exactly: \u201cThat was all.\u201d')).toBe(true);
    expect(angleStepSkipReason({ gate1Enabled: true, briefText: 'first sentence must be exactly "Go."' })).toMatch(/fixes how the video is built/);
  });
  it('skips when the brief gives chapter titles, budgets or a fact allocation', () => {
    expect(briefFixesStructure('Three chapters, titles exactly: "One", "Two", "Three".')).toBe(true);
    expect(briefFixesStructure('Chapter 1: about 200 words\nChapter 2: about 250 words')).toBe(true);
    expect(briefFixesStructure('Chapter 1 uses facts 1, 2, 3.\nChapter 2 uses facts 4, 5.')).toBe(true);
  });
  it('does not skip for a length alone', () => {
    expect(briefFixesStructure('Constraint: about 1,500 words for a 10 minute video')).toBe(false);
  });
});

describe('prompt numbers have one source', () => {
  it('the prose carries the constants', () => {
    expect(anglesSystem('short')).toContain(`at most ${TITLE_MAX_CHARS} characters`);
    expect(anglesSystem('long')).toContain(`at most ${PROMISE_MAX_CHARS} characters`);
    expect(pairReaderSystem(null)).toContain(`at most ${REASON_MAX_WORDS} words`);
  });
});
