import { describe, it, expect } from 'vitest';
import { describeJsonError } from './extract-json';

const failure = (text: string): unknown => {
  try {
    JSON.parse(text);
  } catch (error) {
    return error;
  }
  throw new Error('expected a parse failure');
};

// The message ends up in pipeline_runs.lastError / pipeline_stages.error, which the
// admin inspector and the tenant run view return: it must never carry model output.
describe('describeJsonError (Bugs Task 11, PR #55)', () => {
  const SECRET = 'SECRETWORD-salt-money-story';

  it.each([
    ['a stray quote', `{"scriptText":"He said "${SECRET}" to us","captions":"c"}`],
    ['plain prose', `${SECRET} is not json`],
    ['a trailing comma', `{"a":"${SECRET}",}`],
    ['text after the object', `{"a":"b"} ${SECRET}`],
    ['a cut-off reply', `{"scriptText":"${SECRET}`],
  ])('never quotes the reply (%s)', (_label, text) => {
    const described = describeJsonError(failure(text));
    expect(described).not.toContain(SECRET);
    expect(described).not.toContain('scriptText');
    expect(described.length).toBeLessThan(200);
  });

  it('keeps the position when the parser reports one', () => {
    expect(describeJsonError(failure('{"a":"x" "b":1}'))).toMatch(/at position \d+/);
  });

  it('copes with a non-Error value', () => {
    expect(describeJsonError('weird')).toBeTruthy();
  });
});
