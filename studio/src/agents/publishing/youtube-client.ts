import fs from 'node:fs/promises';
import { OAuth2Client } from 'google-auth-library';
import { env } from '../../config/env';
import { NonTransientStageError, TransientStageError } from '../../run-pipeline/retry-with-backoff';
import { findDecryptedRefreshTokenForChannel } from '../../models/repositories/agent-credential.repository';
import type { UploadParams } from './types';

// Shared per-channel OAuth boundary, metadata builder, thumbnail and caption calls.
// Video bytes use the resumable transport in resumable-upload.ts; the former
// whole-file multipart insertion is deliberately removed.

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
export async function getOAuthClient(channelId: string): Promise<OAuth2Client> {
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

// Conservative error classification retained for thumbnail/caption calls.
// The video insertion path now reconciles its durable resumable session instead
// of retrying a fresh videos.insert after an uncertain response.
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
      `YouTube request failed before it could be sent (retryable): ${message}`,
      error,
      context,
    );
  }
  return new NonTransientStageError(
    `YouTube request failed ambiguously; review the provider outcome before repeating a side effect: ${message}`,
    error,
    context,
  );
}

// Sprint 4 Task 5 (R18): the videos.insert metadata part, pure so its exact JSON is
// testable. selfDeclaredMadeForKids is always present; categoryId/defaultLanguage
// are omitted (not sent empty) when unset.
export function buildUploadMetadataPart(params: UploadParams) {
  return {
    snippet: {
      title: params.metadata.title,
      description: params.metadata.description,
      tags: params.metadata.tags,
      ...(params.categoryId && { categoryId: params.categoryId }),
      ...(params.defaultLanguage && { defaultLanguage: params.defaultLanguage }),
    },
    status: {
      privacyStatus: params.privacyStatus,
      containsSyntheticMedia: params.containsSyntheticMedia,
      selfDeclaredMadeForKids: params.selfDeclaredMadeForKids,
    },
  };
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

// Sprint 4 Task 10 (R4.4): captions.insert. Endpoint, scope (youtube.force-ssl) and quota cost
// (400 units per call) confirmed against Google's captions.insert reference on 2026-10-11. A
// multipart upload: JSON snippet part, then the SRT bytes.
const YOUTUBE_CAPTIONS_INSERT_URL = 'https://www.googleapis.com/upload/youtube/v3/captions?uploadType=multipart&part=snippet';
export const CAPTIONS_INSERT_QUOTA_UNITS = 400;

export type CaptionsUploadParams = {
  channelId: string;
  youtubeVideoId: string;
  srtPath: string;
  // BCP-47 language of the track (the channel's defaultLanguage) and the track name shown to viewers.
  language: string;
  name: string;
};

export function buildCaptionsMetadataPart(params: Pick<CaptionsUploadParams, 'youtubeVideoId' | 'language' | 'name'>) {
  return { snippet: { videoId: params.youtubeVideoId, language: params.language, name: params.name, isDraft: false } };
}

// A failed caption upload never fails the publish. This maps the error to the two plain messages
// the app shows; the technical error stays in the log and the stage output.
export const SUBTITLES_RECONNECT_MESSAGE = 'Subtitles were not uploaded. Reconnect this channel, then upload the file by hand.';
export const SUBTITLES_REJECTED_MESSAGE = 'YouTube did not accept the subtitles. Upload the file by hand.';

// Sprint 5 Task 8 (R11.5): thumbnails.set answers 403 "doesn't have permissions to upload and set custom video
// thumbnails" when the channel has not been verified (phone verification in YouTube Studio); the scopes this
// app asks for (youtube.upload, youtube.force-ssl) are enough. It is an account state, not something the code
// can fix, so the failure is named in plain words for the Run screen and the cover is set by hand. The error
// is wrapped by mapGoogleError, so the original status is read down the cause chain.
export const THUMBNAIL_UNVERIFIED_MESSAGE =
  'YouTube refused the cover image (403). A channel needs phone verification in YouTube Studio before it can use custom thumbnails. Verify the channel, then set the cover by hand.';
export const THUMBNAIL_RECONNECT_MESSAGE = 'The cover image was not set because the YouTube connection was rejected. Reconnect this channel, then set the cover by hand.';
export const THUMBNAIL_FAILED_MESSAGE = 'The cover image was not set. Set it by hand in YouTube Studio.';

function httpStatusOf(error: unknown, depth = 0): number | undefined {
  if (!error || typeof error !== 'object' || depth > 4) return undefined;
  const e = error as { response?: { status?: number }; code?: number | string; cause?: unknown };
  const direct = e.response?.status ?? (typeof e.code === 'number' ? e.code : undefined);
  return direct ?? httpStatusOf(e.cause, depth + 1);
}

export function thumbnailFailureMessage(error: unknown): string {
  const status = httpStatusOf(error);
  if (status === 403) return THUMBNAIL_UNVERIFIED_MESSAGE;
  if (status === 401) return THUMBNAIL_RECONNECT_MESSAGE;
  return THUMBNAIL_FAILED_MESSAGE;
}

export function subtitlesFailureMessage(error: unknown): string {
  const e = error as { response?: { status?: number; data?: { error?: { errors?: { reason?: string }[]; message?: string } } }; code?: number | string };
  const status = e?.response?.status ?? (typeof e?.code === 'number' ? e.code : undefined);
  const reason = e?.response?.data?.error?.errors?.[0]?.reason ?? '';
  const quotaLike = /quota|limitExceeded/i.test(reason);
  const permissionLike = /insufficient|forbidden|scope/i.test(`${reason} ${e?.response?.data?.error?.message ?? ''}`);
  if (status === 403 && !quotaLike && (permissionLike || reason === '')) return SUBTITLES_RECONNECT_MESSAGE;
  return SUBTITLES_REJECTED_MESSAGE;
}

export async function uploadCaptionsViaProvider(params: CaptionsUploadParams): Promise<{ captionId?: string }> {
  const client = await getOAuthClient(params.channelId);
  const srt = await fs.readFile(params.srtPath);
  const body = Buffer.concat([
    Buffer.from(`--${MULTIPART_BOUNDARY}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(buildCaptionsMetadataPart(params))}\r\n`),
    Buffer.from(`--${MULTIPART_BOUNDARY}\r\nContent-Type: application/octet-stream\r\n\r\n`),
    srt,
    Buffer.from(`\r\n--${MULTIPART_BOUNDARY}--`),
  ]);
  const response = await client.request<{ id?: string }>({
    url: YOUTUBE_CAPTIONS_INSERT_URL,
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${MULTIPART_BOUNDARY}` },
    data: body,
  });
  return { captionId: response.data.id };
}
