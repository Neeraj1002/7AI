import fs from 'node:fs/promises';
import { OAuth2Client } from 'google-auth-library';
import { env } from '../../config/env';
import { NonTransientStageError, TransientStageError } from '../../run-pipeline/retry-with-backoff';
import { findDecryptedRefreshTokenForChannel } from '../../models/repositories/agent-credential.repository';
import type { UploadParams, UploadResult } from './types';

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
// Sprint 2 Task 5 (H1) — real endpoint, confirmed against Google's own
// documentation before implementation: raw image bytes as the request body
// (not multipart), videoId as a query param. Requires a phone-verified
// channel — confirmed live against this project's real channel
// (`channels.list?part=status` → `longUploadsStatus: "eligible"`) before
// building this, not assumed.
const YOUTUBE_THUMBNAILS_SET_URL = 'https://www.googleapis.com/upload/youtube/v3/thumbnails/set';

// Sprint 3 Task 5 (M3) — resolves the real per-channel refresh token from
// AgentCredential, never a shared, ambient env-var value. YOUTUBE_CLIENT_ID/
// SECRET stay env vars deliberately — they identify the OAuth *application*,
// shared across every channel, not a per-channel credential; only the
// refresh token moved. A channel with no AgentCredential row fails with a
// clear, specific error naming the real cause — never a generic auth
// failure that reads like a code bug rather than "this channel isn't
// connected yet."
async function getOAuthClient(channelId: string): Promise<OAuth2Client> {
  if (!env.YOUTUBE_CLIENT_ID || !env.YOUTUBE_CLIENT_SECRET) {
    throw new NonTransientStageError(
      'YOUTUBE_CLIENT_ID/YOUTUBE_CLIENT_SECRET are not set — the OAuth application identity is not configured.',
    );
  }
  const refreshToken = await findDecryptedRefreshTokenForChannel(channelId);
  if (!refreshToken) {
    throw new NonTransientStageError(
      `Channel ${channelId} has no connected YouTube account — connect it via the app's channel settings (Sprint 3 Task 5's real OAuth connect flow) before publishing. Set YOUTUBE_STUB=1 to use the stub upload path instead.`,
    );
  }
  const client = new OAuth2Client(env.YOUTUBE_CLIENT_ID, env.YOUTUBE_CLIENT_SECRET, env.YOUTUBE_REDIRECT_URI);
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

// B4 fix (KNOWN_ISSUES_AND_BLOCKERS.md §2, "Publishing upload retry could
// double-upload"): a `videos.insert` is not idempotent — retrying it after
// an ambiguous failure risks creating a second real video, unlike a read
// (videos.list) where a 429/5xx is always safe to retry. This deliberately
// classifies far more narrowly than mapGoogleError elsewhere in this
// project: only an error that *proves* the request never reached YouTube at
// all (the TCP connection itself couldn't be established) is treated as
// safe to retry. Everything else — including a 429/5xx HTTP response, which
// for a read would be the textbook retryable case — is treated as
// non-transient here specifically because the video may already have been
// created server-side before the error surfaced on this end. A
// non-transient upload failure routes straight to `needs_attention` (never
// auto-retried within withRetryAndCircuitBreaker), for a human to check
// YouTube Studio for a duplicate before deciding whether to resume the run.
// The crash-resume checkpoint (recordStageProgress, runPublishingStage) is
// a separate, already-correct mechanism for a *different* gap — a crash
// between a successful upload and the stage being marked complete — and is
// untouched by this change.
const PRE_SEND_NETWORK_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN']);

// Exported for direct verification of the transient/non-transient
// classification with realistic error shapes — see Week 5 Task 2's report
// for the manual test this backs (forcing a live ambiguous network failure
// against the real YouTube API isn't practical, same posture already
// accepted project-wide for the transient-error path — KNOWN_ISSUES_AND_BLOCKERS.md §4).
export function mapGoogleError(error: unknown, context: Record<string, unknown>): Error {
  const code = (error as { code?: string })?.code;
  const message = error instanceof Error ? error.message : String(error);
  if (code && PRE_SEND_NETWORK_CODES.has(code)) {
    return new TransientStageError(
      `YouTube upload failed before the request could be sent (retryable): ${message}`,
      error,
      context,
    );
  }
  return new NonTransientStageError(
    `YouTube upload failed ambiguously — the request may have already reached YouTube before this error surfaced, so it is not safe to auto-retry: ${message}`,
    error,
    context,
  );
}

export async function uploadVideoViaProvider(params: UploadParams): Promise<UploadResult> {
  const context = { provider: 'youtube' };
  try {
    const client = await getOAuthClient(params.channelId);
    const videoBuffer = await fs.readFile(params.videoPath);

    const metadataPart = {
      snippet: {
        title: params.metadata.title,
        description: params.metadata.description,
        tags: params.metadata.tags,
      },
      status: {
        privacyStatus: params.privacyStatus,
        containsSyntheticMedia: params.containsSyntheticMedia,
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

    return { youtubeVideoId: response.data.id, privacyStatus: params.privacyStatus, containsSyntheticMedia: params.containsSyntheticMedia };
  } catch (error) {
    if (error instanceof TransientStageError || error instanceof NonTransientStageError) throw error;
    throw mapGoogleError(error, context);
  }
}

// Sprint 2 Task 5 (H1) — a genuinely separate, best-effort follow-up call,
// not part of the upload above: the video is already live by the time this
// runs, so a failure here must never look like (or cause) an upload
// failure. The caller (state-machine.ts) isolates this the same way Sprint
// 2 Task 4's G2 isolated retention-curve capture — logged, not thrown
// further, not escalated to needs_attention.
export async function setThumbnailViaProvider(params: {
  channelId: string;
  youtubeVideoId: string;
  imagePath: string;
}): Promise<void> {
  const context = { provider: 'youtube', operation: 'thumbnails.set' };
  try {
    const client = await getOAuthClient(params.channelId);
    const imageBuffer = await fs.readFile(params.imagePath);
    const url = new URL(YOUTUBE_THUMBNAILS_SET_URL);
    url.searchParams.set('videoId', params.youtubeVideoId);

    await client.request({
      url: url.toString(),
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg' },
      data: imageBuffer,
    });
  } catch (error) {
    if (error instanceof TransientStageError || error instanceof NonTransientStageError) throw error;
    throw mapGoogleError(error, context);
  }
}
