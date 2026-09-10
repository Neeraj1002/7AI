import fs from 'node:fs/promises';
import { OAuth2Client } from 'google-auth-library';
import { env } from '../../config/env';
import { NonTransientStageError, TransientStageError } from '../../run-pipeline/retry-with-backoff';
import { PRIVACY_STATUS, type UploadParams, type UploadResult } from './types';

// The only file allowed to touch the YouTube Data API v3's upload endpoint —
// same boundary pattern as llm/media/stock-footage's client.ts files. No
// `googleapis` package dependency; uses `google-auth-library`'s OAuth2Client
// (already a project dependency — scripts/youtube-oauth.ts already uses it
// for a trivial channels.list call) directly against the documented REST
// endpoint via a hand-built multipart/related request — the standard,
// documented way to do a simple (non-resumable) YouTube upload without the
// `googleapis` package.

const YOUTUBE_UPLOAD_URL =
  'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status';
const MULTIPART_BOUNDARY = '7ai-publishing-boundary-314159265358979';

function getOAuthClient(): OAuth2Client {
  if (!env.YOUTUBE_CLIENT_ID || !env.YOUTUBE_CLIENT_SECRET || !env.YOUTUBE_REFRESH_TOKEN) {
    throw new NonTransientStageError(
      'YouTube OAuth credentials are not configured (YOUTUBE_CLIENT_ID/YOUTUBE_CLIENT_SECRET/YOUTUBE_REFRESH_TOKEN) — cannot upload for real. Set YOUTUBE_STUB=1 to use the stub upload path instead.',
    );
  }
  const client = new OAuth2Client(env.YOUTUBE_CLIENT_ID, env.YOUTUBE_CLIENT_SECRET, env.YOUTUBE_REDIRECT_URI);
  client.setCredentials({ refresh_token: env.YOUTUBE_REFRESH_TOKEN });
  return client;
}

// 401 (bad/expired credentials) and 403 (quota exhausted, forbidden) are both
// non-transient per docs/execution/week4/BUSINESS_LOGIC.md Section 1 —
// neither resolves by retrying. 429/5xx are transient.
function mapGoogleError(error: unknown, context: Record<string, unknown>): Error {
  const status =
    (error as { response?: { status?: number } })?.response?.status ?? (error as { status?: number })?.status;
  const message = error instanceof Error ? error.message : String(error);
  if (status === 429 || (typeof status === 'number' && status >= 500)) {
    return new TransientStageError(`YouTube upload failed (retryable): ${message}`, error, context);
  }
  return new NonTransientStageError(`YouTube upload failed: ${message}`, error, context);
}

export async function uploadVideoViaProvider(params: UploadParams): Promise<UploadResult> {
  const context = { provider: 'youtube' };
  try {
    const client = getOAuthClient();
    const videoBuffer = await fs.readFile(params.videoPath);

    const metadataPart = {
      snippet: {
        title: params.metadata.title,
        description: params.metadata.description,
        tags: params.metadata.tags,
      },
      status: {
        privacyStatus: PRIVACY_STATUS,
      },
    };

    const body = Buffer.concat([
      Buffer.from(
        `--${MULTIPART_BOUNDARY}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadataPart)}\r\n`,
      ),
      Buffer.from(`--${MULTIPART_BOUNDARY}\r\nContent-Type: video/mp4\r\n\r\n`),
      videoBuffer,
      Buffer.from(`\r\n--${MULTIPART_BOUNDARY}--`),
    ]);

    const response = await client.request<{ id?: string }>({
      url: YOUTUBE_UPLOAD_URL,
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${MULTIPART_BOUNDARY}` },
      data: body,
    });

    if (!response.data.id) {
      throw new NonTransientStageError('YouTube upload succeeded but returned no video id', undefined, context);
    }

    return { youtubeVideoId: response.data.id, privacyStatus: PRIVACY_STATUS };
  } catch (error) {
    if (error instanceof TransientStageError || error instanceof NonTransientStageError) throw error;
    throw mapGoogleError(error, context);
  }
}
