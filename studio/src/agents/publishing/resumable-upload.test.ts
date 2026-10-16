import { createReadStream } from 'node:fs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OAuth2Client } from 'google-auth-library';
import { acknowledgedOffset, uploadResumableVideo, validatedSessionUri } from './resumable-upload';
import type { UploadParams } from './types';

const SESSION = 'https://www.googleapis.com/upload/youtube/v3/videos?upload_id=test';
const headers = (values: Record<string, string> = {}) => ({ get: (key: string) => values[key.toLowerCase()] ?? null });
const params = (videoPath: string): UploadParams => ({
  channelId: 'channel', videoPath, metadata: { title: 'Title', description: 'Description',
    tags: ['test'], coverFrameTimestampRatio: 0.2 },
  privacyStatus: 'private', containsSyntheticMedia: false, selfDeclaredMadeForKids: false,
});
const dirs: string[] = [];
async function file() {
  const dir = await mkdtemp(path.join(os.tmpdir(), '7ai-resume-'));
  dirs.push(dir);
  const videoPath = path.join(dir, 'video.mp4');
  await writeFile(videoPath, 'abcdefghij');
  return videoPath;
}
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }); });

describe('resumable provider transport', () => {
  it('saves the session before any file bytes and uses the acknowledged offset', async () => {
    const videoPath = await file();
    const events: string[] = [];
    const request = vi.fn(async (options: { method: string; data?: unknown }) => {
      if (options.method === 'POST') return { status: 200, headers: headers({ location: SESSION }), data: {} };
      if (options.data === '') return { status: 308, headers: headers({ range: 'bytes=0-3' }), data: {} };
      events.push('bytes');
      let body = '';
      for await (const chunk of options.data as ReturnType<typeof createReadStream>) body += chunk.toString();
      expect(body).toBe('efghij');
      return { status: 201, headers: headers(), data: { id: 'video-1' } };
    });
    const result = await uploadResumableVideo({ request } as unknown as OAuth2Client,
      params(videoPath), 10, undefined, {
        persistSession: async uri => { expect(uri).toBe(SESSION); events.push('session'); },
        confirmedOffset: async n => { expect(n).toBe(4); events.push('offset'); },
        beforeBytes: async () => { events.push('start'); },
      });
    expect(result.youtubeVideoId).toBe('video-1');
    expect(events).toEqual(['session', 'offset', 'start', 'bytes']);
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('reconciles a lost final response on the same session, with one submission', async () => {
    const videoPath = await file();
    let queries = 0;
    let sends = 0;
    const request = vi.fn(async (options: { method: string; data?: unknown }) => {
      expect(options.method).toBe('PUT');
      if (options.data === '') {
        queries++;
        return queries === 1
          ? { status: 308, headers: headers(), data: {} }
          : { status: 201, headers: headers(), data: { id: 'video-2' } };
      }
      sends++;
      throw new Error('lost final response');
    });
    const out = await uploadResumableVideo({ request } as unknown as OAuth2Client,
      params(videoPath), 10, SESSION, {
        persistSession: async () => { throw new Error('must reuse session'); },
        confirmedOffset: async () => {}, beforeBytes: async () => {},
      });
    expect(out.youtubeVideoId).toBe('video-2');
    expect(sends).toBe(1);
    expect(queries).toBe(2);
  });

  it('does not send bytes when a saved session cannot be queried', async () => {
    const videoPath = await file();
    const request = vi.fn(async () => { throw new Error('expired'); });
    await expect(uploadResumableVideo({ request } as unknown as OAuth2Client,
      params(videoPath), 10, SESSION, {
        persistSession: async () => {}, confirmedOffset: async () => {}, beforeBytes: async () => {},
      })).rejects.toThrow('could not be reconciled');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('sends no file bytes when session persistence fails', async () => {
    const videoPath = await file();
    let sends = 0;
    const request = vi.fn(async (options: { method: string; data?: unknown }) => {
      if (options.method === 'POST') return { status: 200, headers: headers({ location: SESSION }), data: {} };
      if (options.data !== '') sends++;
      return { status: 308, headers: headers(), data: {} };
    });
    await expect(uploadResumableVideo({ request } as unknown as OAuth2Client,
      params(videoPath), 10, undefined, {
        persistSession: async () => { throw new Error('DB unavailable'); },
        confirmedOffset: async () => {}, beforeBytes: async () => {},
      })).rejects.toThrow('DB unavailable');
    expect(request).toHaveBeenCalledTimes(1);
    expect(sends).toBe(0);
  });

  it('continues only the provider-confirmed remainder after a partial interruption', async () => {
    const videoPath = await file();
    let queries = 0;
    let sends = 0;
    const request = vi.fn(async (options: { method: string; data?: unknown }) => {
      if (options.data === '') {
        queries++;
        return queries === 1
          ? { status: 308, headers: headers(), data: {} }
          : { status: 308, headers: headers({ range: 'bytes=0-3' }), data: {} };
      }
      sends++;
      const chunks: Buffer[] = [];
      for await (const chunk of options.data as ReturnType<typeof createReadStream>) chunks.push(Buffer.from(chunk));
      if (sends === 1) throw new Error('partial network failure');
      expect(Buffer.concat(chunks).toString()).toBe('efghij');
      return { status: 201, headers: headers(), data: { id: 'partial-video' } };
    });
    const offsets: number[] = [];
    const out = await uploadResumableVideo({ request } as unknown as OAuth2Client,
      params(videoPath), 10, SESSION, {
        persistSession: async () => { throw new Error('unexpected new session'); },
        confirmedOffset: async n => { offsets.push(n); }, beforeBytes: async () => {},
      });
    expect(out.youtubeVideoId).toBe('partial-video');
    expect(offsets).toEqual([0, 4]);
    expect(sends).toBe(2);
  });

  it('rejects invalid session origins and ranges', () => {
    expect(() => validatedSessionUri('https://example.com/upload/youtube/v3/videos')).toThrow();
    expect(acknowledgedOffset({ status: 308, headers: headers({ range: 'bytes=0-3' }), data: {} }, 10)).toBe(4);
    expect(() => acknowledgedOffset({ status: 308, headers: headers({ range: 'bytes=0-12' }), data: {} }, 10)).toThrow();
  });
});
