import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mapGoogleError, uploadVideoViaProvider } from './youtube-client';
import { TransientStageError, NonTransientStageError } from '../../run-pipeline/retry-with-backoff';

// Sprint 2 Task 2 (E4) — mocked-client test proving the real request body
// this project sends to YouTube actually carries containsSyntheticMedia,
// same rigor as Sprint 2 Task 1's D1 TTS-voice mocked-client test. This is
// the layer where a dropped/wrong disclosure flag would actually manifest —
// asserting the real multipart body's JSON metadata part, not just that
// uploadVideoViaProvider's own return value looks right.
const requestMock = vi.hoisted(() => vi.fn());
vi.mock('google-auth-library', () => {
  class MockOAuth2Client {
    setCredentials(): void {}
    request(...args: unknown[]): unknown {
      return requestMock(...args);
    }
  }
  return { OAuth2Client: MockOAuth2Client };
});

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

describe('uploadVideoViaProvider (Sprint 2 Task 2, E4 — synthetic-content disclosure)', () => {
  let videoPath: string;

  beforeEach(async () => {
    requestMock.mockReset();
    requestMock.mockResolvedValue({ data: { id: 'mock-video-id' } });
    videoPath = path.join(os.tmpdir(), `7ai-youtube-client-test-${Date.now()}.mp4`);
    await fs.writeFile(videoPath, Buffer.from('fake mp4 bytes for a mocked-client test, never actually uploaded'));
  });

  function extractRequestMetadata(): { status: { privacyStatus: string; containsSyntheticMedia: boolean } } {
    const call = requestMock.mock.calls[0][0] as { data: Buffer };
    const bodyText = call.data.toString('utf-8');
    const match = bodyText.match(/Content-Type: application\/json; charset=UTF-8\r\n\r\n(\{.*?\})\r\n--/s);
    if (!match) throw new Error('multipart body did not contain the expected JSON metadata part');
    return JSON.parse(match[1]);
  }

  it('sets containsSyntheticMedia: true on the real request for an ai-stills upload', async () => {
    await uploadVideoViaProvider({
      videoPath,
      metadata: { title: 'Test', description: 'Test', tags: ['test'] },
      privacyStatus: 'private',
      containsSyntheticMedia: true,
    });
    expect(extractRequestMetadata().status.containsSyntheticMedia).toBe(true);
  });

  it('sets containsSyntheticMedia: false on the real request for a stock-footage upload', async () => {
    await uploadVideoViaProvider({
      videoPath,
      metadata: { title: 'Test', description: 'Test', tags: ['test'] },
      privacyStatus: 'private',
      containsSyntheticMedia: false,
    });
    expect(extractRequestMetadata().status.containsSyntheticMedia).toBe(false);
  });
});
