import { describe, it, expect } from 'vitest';
import { mapGoogleError } from './youtube-client';
import { TransientStageError, NonTransientStageError } from '../../run-pipeline/retry-with-backoff';

// Week 5 Task 4 (C4) — this exact classification was flagged in
// youtube-client.ts's own comment as "verified only by manual testing" (Week
// 5 Task 2's report). Turns that into a real, repeatable regression test.
// B4's whole point: only a failure that PROVES the upload request never
// reached YouTube is safe to retry; everything else (including what would
// be a textbook-retryable 429/5xx for a read) must not auto-retry, since a
// videos.insert isn't idempotent.

describe('mapGoogleError (Publishing upload classification, B4)', () => {
  it('classifies a pure connection-establishment failure as transient/retryable', () => {
    const error = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    expect(mapGoogleError(error, {})).toBeInstanceOf(TransientStageError);
  });

  it('classifies ENOTFOUND (DNS failure, never connected) as transient/retryable', () => {
    const error = Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
    expect(mapGoogleError(error, {})).toBeInstanceOf(TransientStageError);
  });

  it('classifies EAI_AGAIN (transient DNS failure) as transient/retryable', () => {
    const error = Object.assign(new Error('getaddrinfo EAI_AGAIN'), { code: 'EAI_AGAIN' });
    expect(mapGoogleError(error, {})).toBeInstanceOf(TransientStageError);
  });

  it('classifies a real HTTP 503 response as non-transient (request reached YouTube)', () => {
    const error = { response: { status: 503 }, message: 'Service Unavailable' };
    expect(mapGoogleError(error, {})).toBeInstanceOf(NonTransientStageError);
  });

  it('classifies a real HTTP 429 response as non-transient — unlike a read, not safe to auto-retry', () => {
    const error = { response: { status: 429 }, message: 'Too Many Requests' };
    expect(mapGoogleError(error, {})).toBeInstanceOf(NonTransientStageError);
  });

  it('classifies ECONNRESET (connection dropped mid-transfer) as non-transient — ambiguous', () => {
    const error = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
    expect(mapGoogleError(error, {})).toBeInstanceOf(NonTransientStageError);
  });

  it('classifies ETIMEDOUT as non-transient — could be pre- or post-send, treated as ambiguous', () => {
    const error = Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });
    expect(mapGoogleError(error, {})).toBeInstanceOf(NonTransientStageError);
  });

  it('preserves the given context on the mapped error', () => {
    const error = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    const mapped = mapGoogleError(error, { provider: 'youtube' }) as TransientStageError;
    expect(mapped.context).toEqual({ provider: 'youtube' });
  });
});
