import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { it, expect } from 'vitest';
import type { OAuth2Client } from 'google-auth-library';
import { uploadResumableVideo } from './resumable-upload';

it('uses one fake HTTP session with a persisted URI before streamed bytes', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), '7ai-publish-http-'));
  const videoPath = path.join(dir, 'video.mp4');
  await writeFile(videoPath, 'abcdefghij');
  const session = 'https://www.googleapis.com/upload/youtube/v3/videos?upload_id=fake-http';
  let sessions = 0;
  let submissions = 0;
  let queries = 0;
  const events: string[] = [];
  const server = createServer(async (req, res) => {
    if (req.method === 'POST') {
      sessions++;
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const metadata = JSON.parse(Buffer.concat(chunks).toString());
      expect(metadata.status.privacyStatus).toBe('private');
      res.writeHead(200, { Location: session }).end();
      return;
    }
    if (req.headers['content-range'] === 'bytes */10') {
      queries++;
      res.writeHead(308).end();
      return;
    }
    submissions++;
    expect(req.headers['content-range']).toBe('bytes 0-9/10');
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString()).toBe('abcdefghij');
    events.push('bytes');
    res.writeHead(201, { 'Content-Type': 'application/json' }).end(JSON.stringify({ id: 'fake-video-id' }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No fake server address');
    const base = 'http://127.0.0.1:' + address.port;
    const request = async (options: { url: string; method: string; headers?: Record<string, string>; data?: unknown }) => {
      const source = new URL(options.url);
      const body = options.data && typeof options.data === 'object' && !('pipe' in options.data)
        ? JSON.stringify(options.data) : options.data as RequestInit['body'] | undefined;
      const response = await fetch(base + source.pathname + source.search, {
        method: options.method, headers: options.headers, body: body as RequestInit['body'],
        redirect: 'manual', duplex: 'half',
      } as RequestInit & { duplex: 'half' });
      return { status: response.status, headers: response.headers,
        data: response.status === 308 || response.status === 200 ? {} : await response.json() };
    };
    const result = await uploadResumableVideo({ request } as unknown as OAuth2Client, {
      channelId: 'fake', videoPath, metadata: { title: 'HTTP test', description: 'Fake only',
        tags: ['fake'], coverFrameTimestampRatio: 0.3 },
      privacyStatus: 'private', containsSyntheticMedia: false, selfDeclaredMadeForKids: false,
    }, 10, undefined, {
      persistSession: async uri => { expect(uri).toBe(session); events.push('persist'); },
      confirmedOffset: async offset => { expect(offset).toBe(0); },
      beforeBytes: async () => { events.push('before'); },
    });
    expect(result.youtubeVideoId).toBe('fake-video-id');
    expect([sessions, queries, submissions]).toEqual([1, 1, 1]);
    expect(events).toEqual(['persist', 'before', 'bytes']);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});
