import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildUserMessage } from './index';

const base = { topic: 'T', constraints: [] as string[] };

describe('script-generation prompt', () => {
  it('no longer hardcodes a 30-60 second range', () => {
    expect(buildSystemPrompt()).not.toContain('30-60');
  });

  it('brief-plus-common (default) leaves the system prompt without the authoritative-facts rule', () => {
    expect(buildSystemPrompt('brief-plus-common')).toBe(buildSystemPrompt());
    expect(buildSystemPrompt()).not.toContain('authoritative');
  });

  it('brief-only adds the authoritative-facts rule', () => {
    expect(buildSystemPrompt('brief-only')).toContain('Facts and figures stated in the brief are authoritative');
  });

  it('passes the raw brief alongside topic and constraints', () => {
    const msg = buildUserMessage({ ...base, constraints: ['calm'], briefText: 'In 1969, 4 men, 238,900 miles' });
    expect(msg).toContain('Topic: T');
    expect(msg).toContain('Constraints: calm');
    expect(msg).toContain('238,900 miles');
  });

  it('states the resolved target with an equivalent word count', () => {
    expect(buildUserMessage({ ...base, targetSeconds: 30 })).toContain('approximately 30 seconds');
    expect(buildUserMessage({ ...base, targetSeconds: 30 })).toContain('around 75 words');
  });

  it('adds banned opener / ending lines only when the lists are non-empty', () => {
    const none = buildUserMessage({ ...base, bannedOpeners: [], bannedEndings: [] });
    expect(none).not.toContain('Do not open');
    expect(none).not.toContain('Do not end');
    const some = buildUserMessage({ ...base, bannedOpeners: ['Did you know', 'Imagine'], bannedEndings: ['Follow for more'] });
    expect(some).toContain('Do not open with any of: Did you know; Imagine');
    expect(some).toContain('Do not end with any of: Follow for more');
  });

  it('a call with none of the Task 2 params produces the same message shape as before', () => {
    expect(buildUserMessage({ topic: 'T', constraints: ['a', 'b'], styleGuide: 'g' })).toBe(
      'Topic: T\nConstraints: a; b\nStyle guide: g',
    );
  });
});
