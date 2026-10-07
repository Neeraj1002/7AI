import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mapGoogleError, uploadVideoViaProvider, setThumbnailViaProvider } from './youtube-client';
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

// Sprint 3 Task 5 (M3) — getOAuthClient now resolves a real per-channel
// AgentCredential via this repository function; mocked here so these tests
// stay DB-free, same as they were before M3 (a real fake channelId, since
// what matters for these tests is the request construction, not real
// credential resolution — that's credential-crypto.test.ts's and Task 5's
// own live-verification job).
const findDecryptedRefreshTokenForChannelMock = vi.hoisted(() => vi.fn());
vi.mock('../../models/repositories/agent-credential.repository', () => ({
  findDecryptedRefreshTokenForChannel: findDecryptedRefreshTokenForChannelMock,
}));

const TEST_CHANNEL_ID = '00000000-0000-0000-0000-0000000000c1';

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
    findDecryptedRefreshTokenForChannelMock.mockReset();
    findDecryptedRefreshTokenForChannelMock.mockResolvedValue('mock-refresh-token');
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
      channelId: TEST_CHANNEL_ID,
      videoPath,
      metadata: { title: 'Test', description: 'Test', tags: ['test'], coverFrameTimestampRatio: 0.3 },
      privacyStatus: 'private',
      containsSyntheticMedia: true,
      selfDeclaredMadeForKids: false,
    });
    expect(extractRequestMetadata().status.containsSyntheticMedia).toBe(true);
  });

  it('sets containsSyntheticMedia: false on the real request for a stock-footage upload', async () => {
    await uploadVideoViaProvider({
      channelId: TEST_CHANNEL_ID,
      videoPath,
      metadata: { title: 'Test', description: 'Test', tags: ['test'], coverFrameTimestampRatio: 0.3 },
      privacyStatus: 'private',
      containsSyntheticMedia: false,
      selfDeclaredMadeForKids: false,
    });
    expect(extractRequestMetadata().status.containsSyntheticMedia).toBe(false);
  });

  // Sprint 4 Task 5 (R18): the real request body, parsed from the actual multipart
  // payload handed to the (mocked) Google client.
  function requestBody(): { snippet: Record<string, unknown>; status: Record<string, unknown> } {
    const call = requestMock.mock.calls[0][0] as { data: Buffer };
    const match = call.data.toString('utf-8').match(/Content-Type: application\/json; charset=UTF-8\r\n\r\n(\{.*?\})\r\n--/s);
    if (!match) throw new Error('no JSON metadata part');
    return JSON.parse(match[1]);
  }
  const base = {
    channelId: TEST_CHANNEL_ID,
    metadata: { title: 'T', description: 'D', tags: ['t'], coverFrameTimestampRatio: 0.3 },
    privacyStatus: 'private' as const,
    containsSyntheticMedia: false,
    selfDeclaredMadeForKids: false,
  };

  it('always sends status.selfDeclaredMadeForKids, and omits categoryId/defaultLanguage when unset', async () => {
    await uploadVideoViaProvider({ ...base, videoPath });
    const body = requestBody();
    expect(body.status).toEqual({ privacyStatus: 'private', containsSyntheticMedia: false, selfDeclaredMadeForKids: false });
    expect(body.snippet).toEqual({ title: 'T', description: 'D', tags: ['t'] });
    expect('categoryId' in body.snippet).toBe(false);
    expect('defaultLanguage' in body.snippet).toBe(false);
  });

  it('sends categoryId and defaultLanguage when the profile sets them, and echoes the flag', async () => {
    const result = await uploadVideoViaProvider({
      ...base,
      videoPath,
      selfDeclaredMadeForKids: true,
      categoryId: '27',
      defaultLanguage: 'en',
    });
    const body = requestBody();
    expect(body.snippet).toMatchObject({ categoryId: '27', defaultLanguage: 'en' });
    expect(body.status.selfDeclaredMadeForKids).toBe(true);
    expect(result.selfDeclaredMadeForKids).toBe(true);
  });

  it('throws a clear, specific error when the channel has no connected YouTube account', async () => {
    findDecryptedRefreshTokenForChannelMock.mockResolvedValue(null);
    await expect(
      uploadVideoViaProvider({
        channelId: TEST_CHANNEL_ID,
        videoPath,
        metadata: { title: 'Test', description: 'Test', tags: ['test'], coverFrameTimestampRatio: 0.3 },
        privacyStatus: 'private',
        containsSyntheticMedia: false,
        selfDeclaredMadeForKids: false,
      }),
    ).rejects.toThrow(/has no connected YouTube account/);
  });
});

// Sprint 2 Task 5 (H1) — mocked-client test proving the real request this
// project sends to thumbnails.set has the shape Google's docs specify: raw
// image bytes as the body (not multipart, unlike the upload above),
// videoId as a query param, image/jpeg content type. Same rigor as the
// containsSyntheticMedia test above — assert the real request construction,
// not just that the function resolves without throwing.
describe('setThumbnailViaProvider (Sprint 2 Task 5, H1 — custom cover frame)', () => {
  let imagePath: string;

  beforeEach(async () => {
    requestMock.mockReset();
    requestMock.mockResolvedValue({ data: {} });
    findDecryptedRefreshTokenForChannelMock.mockReset();
    findDecryptedRefreshTokenForChannelMock.mockResolvedValue('mock-refresh-token');
    imagePath = path.join(os.tmpdir(), `7ai-youtube-thumbnail-test-${Date.now()}.jpg`);
    await fs.writeFile(imagePath, Buffer.from('fake jpeg bytes for a mocked-client test, never actually uploaded'));
  });

  it('POSTs raw image bytes to thumbnails/set with videoId as a query param', async () => {
    await setThumbnailViaProvider({ channelId: TEST_CHANNEL_ID, youtubeVideoId: 'mock-video-id', imagePath });

    const call = requestMock.mock.calls[0][0] as {
      url: string;
      method: string;
      headers: Record<string, string>;
      data: Buffer;
    };
    const url = new URL(call.url);
    expect(url.origin + url.pathname).toBe('https://www.googleapis.com/upload/youtube/v3/thumbnails/set');
    expect(url.searchParams.get('videoId')).toBe('mock-video-id');
    expect(call.method).toBe('POST');
    expect(call.headers['Content-Type']).toBe('image/jpeg');
    expect(call.data.toString('utf-8')).toBe('fake jpeg bytes for a mocked-client test, never actually uploaded');
  });

  it('routes a thumbnails.set failure through the same mapGoogleError classification as upload', async () => {
    requestMock.mockRejectedValue(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }));
    await expect(
      setThumbnailViaProvider({ channelId: TEST_CHANNEL_ID, youtubeVideoId: 'mock-video-id', imagePath }),
    ).rejects.toBeInstanceOf(TransientStageError);
  });
});
