import { describe, it, expect } from 'vitest';
import { extractRunId } from './run-id';

const ID = '3f2b8c1e-9d4a-4e7b-8a61-0c5d2e9f7a10';

describe('extractRunId', () => {
  it('reads /run/<uuid>', () => expect(extractRunId(`/run/${ID}`)).toBe(ID));
  it('ignores a query string', () => expect(extractRunId(`/run/${ID}?x=1`)).toBe(ID));
  it('reads a full URL', () => expect(extractRunId(`https://app.example.test/run/${ID}#top`)).toBe(ID));
  it('returns null for a short id prefix', () => expect(extractRunId('/run/3f2b8c1e')).toBeNull());
  it('returns null for an empty context', () => {
    expect(extractRunId('')).toBeNull();
    expect(extractRunId({ runId: null, screenContext: null })).toBeNull();
    expect(extractRunId(null)).toBeNull();
    expect(extractRunId(undefined)).toBeNull();
  });
  it('returns null for garbage', () => {
    expect(extractRunId('hello world')).toBeNull();
    expect(extractRunId(`/runner/${ID}`)).toBeNull();
    expect(extractRunId(`/run/${ID}zzz`)).toBeNull();
  });
  it('prefers the runId column and lowercases it', () => {
    expect(extractRunId({ runId: ID.toUpperCase(), screenContext: '/run/00000000-0000-4000-8000-000000000000' })).toBe(ID);
  });
  it('falls back to the screen path when the column is not a uuid', () => {
    expect(extractRunId({ runId: 'abc', screenContext: `/run/${ID}` })).toBe(ID);
  });
});
