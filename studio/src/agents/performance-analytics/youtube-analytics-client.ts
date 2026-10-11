import { OAuth2Client } from 'google-auth-library';
import { env } from '../../config/env';
import { NonTransientStageError, TransientStageError } from '../../run-pipeline/retry-with-backoff';
import { findDecryptedRefreshTokenForChannel } from '../../models/repositories/agent-credential.repository';
import type { LongFormMetrics, RetentionCurvePoint } from '../../types';

// The only file allowed to touch the YouTube Analytics API v2's reports.query
// endpoint — same boundary pattern as youtube-stats-client.ts (Data API) and
// every other capability layer's client.ts. A genuinely different API from
// the Data API videos.list call (different host, different OAuth scope,
// different response shape) — kept in its own file rather than folded into
// youtube-stats-client.ts for exactly that reason.

const YOUTUBE_ANALYTICS_REPORTS_URL = 'https://youtubeanalytics.googleapis.com/v2/reports';

// Sprint 3 Task 5 (M3) — same real per-channel credential resolution as
// youtube-client.ts/youtube-stats-client.ts, duplicated here rather than
// imported (this file's own header comment already establishes the
// "agents don't share hidden state" convention).
async function getOAuthClient(channelId: string): Promise<OAuth2Client> {
  if (!env.YOUTUBE_CLIENT_ID || !env.YOUTUBE_CLIENT_SECRET) {
    throw new NonTransientStageError(
      'YOUTUBE_CLIENT_ID/YOUTUBE_CLIENT_SECRET are not set — the OAuth application identity is not configured.',
    );
  }
  const refreshToken = await findDecryptedRefreshTokenForChannel(channelId);
  if (!refreshToken) {
    throw new NonTransientStageError(
      `Channel ${channelId} has no connected YouTube account — cannot fetch a real retention curve. Set YOUTUBE_ANALYTICS_STUB=1 to use the stub path instead.`,
    );
  }
  const client = new OAuth2Client(env.YOUTUBE_CLIENT_ID, env.YOUTUBE_CLIENT_SECRET, env.YOUTUBE_REDIRECT_URI);
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

// Google's real error shape for this endpoint, confirmed live against this
// project's actual credentials at implementation time (Sprint 2 Task 4) —
// not guessed. `details[].reason` is the reliable field; `errors[0].reason`
// is a second, older-style copy of similar information Google's APIs often
// include for backward compatibility.
type GoogleApiErrorBody = {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    errors?: { reason?: string }[];
    details?: { reason?: string }[];
  };
};

// Sprint 2 Task 4's own Failure Modes requirement: a real (non-stub) call
// without the scope/API-enablement must fail loudly and specifically — a
// clear "founder action needed" message, not a generic auth failure someone
// has to dig through a stack trace to diagnose. Two real, distinct causes
// confirmed live against this project's own credentials:
// (1) SERVICE_DISABLED/accessNotConfigured — the YouTube Analytics API
//     itself has never been enabled in the Google Cloud project (this is
//     what actually happens today, confirmed live — not hypothetical).
// (2) A scope-related PERMISSION_DENIED once the API is enabled but
//     yt-analytics.readonly still isn't granted — not yet observed live
//     (blocked by (1) happening first), but Google's documented shape for
//     this class of error, so detected the same way.
// Exported for direct testability — same reasoning youtube-client.ts's own
// mapGoogleError (publishing) already established: this exact
// classification was confirmed against a real, live error response at
// implementation time; a real regression test locks that in.
export function classifyAnalyticsError(error: unknown, context: Record<string, unknown>): Error {
  const httpError = error as { response?: { status?: number; data?: GoogleApiErrorBody } };
  const status = httpError.response?.status;
  const body = httpError.response?.data?.error;
  const reason = body?.details?.[0]?.reason ?? body?.errors?.[0]?.reason;

  if (status === 403 && (reason === 'SERVICE_DISABLED' || reason === 'accessNotConfigured')) {
    return new NonTransientStageError(
      `YouTube Analytics API call failed — the API itself is not enabled for this project's Google Cloud console (a real founder action, see KNOWN_ISSUES_AND_BLOCKERS.md §1, distinct from the OAuth scope grant). Raw: ${body?.message ?? 'unknown'}`,
      error,
      context,
    );
  }
  if (
    status === 403 &&
    (reason === 'insufficientPermissions' || body?.message?.toLowerCase().includes('insufficient'))
  ) {
    return new NonTransientStageError(
      `YouTube Analytics API call failed — insufficient OAuth scope (yt-analytics.readonly not granted, a real founder action, see KNOWN_ISSUES_AND_BLOCKERS.md §1). Raw: ${body?.message ?? 'unknown'}`,
      error,
      context,
    );
  }
  if (status === 429 || (typeof status === 'number' && status >= 500)) {
    return new TransientStageError(
      `YouTube Analytics API call failed (retryable): ${body?.message ?? String(error)}`,
      error,
      context,
    );
  }
  return new NonTransientStageError(
    `YouTube Analytics API call failed: ${body?.message ?? (error instanceof Error ? error.message : String(error))}`,
    error,
    context,
  );
}

type YoutubeAnalyticsReportResponse = {
  columnHeaders?: { name?: string }[];
  rows?: (number | string)[][];
};

// Real endpoint, real query shape: dimensions=elapsedVideoTimeRatio,
// metrics=audienceWatchRatio, filtered to one video — YouTube's own
// documented audience-retention report. `ids=channel==MINE` (not a specific
// channel id) is the documented form for the authenticated user's own
// channel, matching this project's single-channel-per-token posture
// (SCHEMA.md Section 2).
export async function fetchRetentionCurveViaProvider(channelId: string, youtubeVideoId: string): Promise<RetentionCurvePoint[]> {
  const context = { provider: 'youtube-analytics' };
  try {
    const client = await getOAuthClient(channelId);
    const url = new URL(YOUTUBE_ANALYTICS_REPORTS_URL);
    url.searchParams.set('ids', 'channel==MINE');
    // A video's retention curve is fixed once it stops accumulating new
    // watch sessions in any meaningful way — a wide, open start date (well
    // before this project existed) through today is simpler and just as
    // correct as trying to track the video's own real publish date here.
    url.searchParams.set('startDate', '2020-01-01');
    url.searchParams.set('endDate', new Date().toISOString().slice(0, 10));
    url.searchParams.set('metrics', 'audienceWatchRatio');
    url.searchParams.set('dimensions', 'elapsedVideoTimeRatio');
    url.searchParams.set('filters', `video==${youtubeVideoId}`);

    const response = await client.request<YoutubeAnalyticsReportResponse>({ url: url.toString() });
    const rows = response.data.rows ?? [];
    return rows.map((row) => ({
      elapsedVideoTimeRatio: Number(row[0]),
      audienceWatchRatio: Number(row[1]),
    }));
  } catch (error) {
    if (error instanceof TransientStageError || error instanceof NonTransientStageError) throw error;
    throw classifyAnalyticsError(error, context);
  }
}

// Sprint 4 Task 10 (R6): the long-form numbers, one reports.query call for the whole life of the
// video (same open date range as the retention report). averageViewDuration (seconds),
// averageViewPercentage and estimatedMinutesWatched are documented video-report metrics. Google's
// Analytics API v2 has no thumbnail-impressions click-through metric (checked against the metrics
// reference on 2026-10-11), so impressionsClickThroughRate is returned as null, never estimated.
export function parseLongFormMetricsResponse(data: YoutubeAnalyticsReportResponse): LongFormMetrics {
  const headers = (data.columnHeaders ?? []).map((h) => h.name);
  const row = data.rows?.[0];
  const pick = (name: string): number | null => {
    const i = headers.indexOf(name);
    const v = i >= 0 && row ? Number(row[i]) : NaN;
    return Number.isFinite(v) ? v : null;
  };
  return {
    averageViewDurationSec: pick('averageViewDuration'),
    averageViewPercentage: pick('averageViewPercentage'),
    estimatedMinutesWatched: pick('estimatedMinutesWatched'),
    impressionsClickThroughRate: null,
  };
}

export async function fetchLongFormMetricsViaProvider(channelId: string, youtubeVideoId: string): Promise<LongFormMetrics> {
  const context = { provider: 'youtube-analytics' };
  try {
    const client = await getOAuthClient(channelId);
    const url = new URL(YOUTUBE_ANALYTICS_REPORTS_URL);
    url.searchParams.set('ids', 'channel==MINE');
    url.searchParams.set('startDate', '2020-01-01');
    url.searchParams.set('endDate', new Date().toISOString().slice(0, 10));
    url.searchParams.set('metrics', 'averageViewDuration,averageViewPercentage,estimatedMinutesWatched');
    url.searchParams.set('filters', `video==${youtubeVideoId}`);
    const response = await client.request<YoutubeAnalyticsReportResponse>({ url: url.toString() });
    return parseLongFormMetricsResponse(response.data);
  } catch (error) {
    if (error instanceof TransientStageError || error instanceof NonTransientStageError) throw error;
    throw classifyAnalyticsError(error, context);
  }
}
