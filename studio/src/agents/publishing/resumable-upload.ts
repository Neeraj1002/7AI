import { createReadStream } from 'node:fs';
import { OAuth2Client } from 'google-auth-library';
import { NonTransientStageError } from '../../run-pipeline/retry-with-backoff';
import { buildUploadMetadataPart } from './youtube-client';
import type { UploadParams, UploadResult } from './types';

const SESSION_URL = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';
type Reply = { status: number; headers: { get(name: string): string | null }; data: { id?: string } };
export type SessionHooks = {
  persistSession(uri: string): Promise<void>;
  beforeBytes(): Promise<void>;
  confirmedOffset(offset: number): Promise<void>;
  signal?: AbortSignal;
};
export function validatedSessionUri(uri: string): string {
  const url = new URL(uri);
  if (url.protocol !== 'https:' || url.hostname !== 'www.googleapis.com'
      || !url.pathname.startsWith('/upload/youtube/v3/videos')) {
    throw new NonTransientStageError('Stored YouTube upload session has an invalid origin or path');
  }
  return uri;
}
function header(reply: Reply, name: string): string | undefined {
  const value = reply.headers.get(name);
  return typeof value === 'string' ? value : undefined;
}
function result(params: UploadParams, reply: Reply): UploadResult {
  if (!reply.data || typeof reply.data.id !== 'string' || !reply.data.id)
    throw new NonTransientStageError('YouTube completed an upload without a usable video ID; outcome requires review');
  return { youtubeVideoId: reply.data.id, privacyStatus: params.privacyStatus,
    containsSyntheticMedia: params.containsSyntheticMedia,
    selfDeclaredMadeForKids: params.selfDeclaredMadeForKids };
}
export function acknowledgedOffset(reply: Reply, total: number): number {
  if (reply.status !== 308) throw new Error('Offset requires a 308 response');
  const range = header(reply, 'range');
  if (!range) return 0;
  const match = /^bytes=0-(\d+)$/.exec(range);
  if (!match) throw new NonTransientStageError('YouTube returned an invalid acknowledged byte range');
  const offset = Number(match[1]) + 1;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset >= total)
    throw new NonTransientStageError('YouTube returned an out-of-range acknowledged byte count');
  return offset;
}
export async function uploadResumableVideo(
  client: OAuth2Client, params: UploadParams, total: number,
  existingSession: string | undefined, hooks: SessionHooks,
): Promise<UploadResult> {
  let session = existingSession ? validatedSessionUri(existingSession) : undefined;
  if (!session) {
    const started = await client.request({
      url: SESSION_URL, method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': String(total), 'X-Upload-Content-Type': 'video/mp4' },
      data: buildUploadMetadataPart(params), timeout: 60_000, retry: false,
    }) as Reply;
    const location = header(started, 'location');
    if (!location) throw new NonTransientStageError('YouTube did not return a resumable session');
    session = validatedSessionUri(location);
    // No bytes are sent until this durable write succeeds.
    await hooks.persistSession(session);
  }
  const query = async (): Promise<Reply> => client.request({
    url: session!, method: 'PUT', headers: { 'Content-Length': '0', 'Content-Range': 'bytes */' + total },
    data: '', signal: hooks.signal, validateStatus: (status: number) => status === 308 || (status >= 200 && status < 300),
    timeout: 60_000, retry: false,
  }) as Promise<Reply>;
  // Every restart first queries the same session. Never interpret a lost response as zero bytes.
  let reply: Reply;
  try { reply = await query(); }
  catch { throw new NonTransientStageError('YouTube session outcome could not be reconciled; review before retry'); }
  for (let attempt = 0; attempt < 4; attempt++) {
    if (reply.status !== 308) return result(params, reply);
    const offset = acknowledgedOffset(reply, total);
    await hooks.confirmedOffset(offset);
    await hooks.beforeBytes();
    try {
      reply = await client.request({
        url: session, method: 'PUT', headers: { 'Content-Type': 'video/mp4',
          'Content-Length': String(total - offset),
          'Content-Range': 'bytes ' + offset + '-' + (total - 1) + '/' + total },
        data: createReadStream(params.videoPath, { start: offset }), signal: hooks.signal,
        validateStatus: (status: number) => status === 308 || (status >= 200 && status < 300),
        timeout: 20 * 60_000, retry: false,
      }) as Reply;
    } catch {
      try { reply = await query(); }
      catch { throw new NonTransientStageError('YouTube upload outcome is unresolved; do not start another insertion'); }
    }
  }
  throw new NonTransientStageError('YouTube session did not settle after bounded reconciliation');
}
