import { OAuth2Client } from 'google-auth-library';
import { env } from '../../config/env';
import { NonTransientStageError, TransientStageError } from '../../run-pipeline/retry-with-backoff';
import type { VideoStats } from './types';

// The only file allowed to touch the YouTube Data API v3's videos.list
// endpoint — same boundary pattern as every other capability layer's
// client.ts. Same credentials/scope as Publishing's upload
// (youtube.readonly, already requested by scripts/youtube-oauth.ts), so this
// duplicates a small OAuth2Client constructor rather than importing from
// studio/src/agents/publishing/ — agents don't call each other directly or
// share hidden state (AGENT_FLEET_DESIGN.md Principle 5).

const YOUTUBE_VIDEOS_LIST_URL = 'https://www.googleapis.com/youtube/v3/videos';

function getOAuthClient(): OAuth2Client {
  if (!env.YOUTUBE_CLIENT_ID || !env.YOUTUBE_CLIENT_SECRET || !env.YOUTUBE_REFRESH_TOKEN) {
    throw new NonTransientStageError(
      'YouTube OAuth credentials are not configured (YOUTUBE_CLIENT_ID/YOUTUBE_CLIENT_SECRET/YOUTUBE_REFRESH_TOKEN) — cannot fetch real stats. Set YOUTUBE_STUB=1 to use the stub path instead.',
    );
  }
  const client = new OAuth2Client(env.YOUTUBE_CLIENT_ID, env.YOUTUBE_CLIENT_SECRET, env.YOUTUBE_REDIRECT_URI);
  client.setCredentials({ refresh_token: env.YOUTUBE_REFRESH_TOKEN });
  return client;
}

function mapGoogleError(error: unknown, context: Record<string, unknown>): Error {
  const status =
    (error as { response?: { status?: number } })?.response?.status ?? (error as { status?: number })?.status;
  const message = error instanceof Error ? error.message : String(error);
  if (status === 429 || (typeof status === 'number' && status >= 500)) {
    return new TransientStageError(`YouTube stats fetch failed (retryable): ${message}`, error, context);
  }
  return new NonTransientStageError(`YouTube stats fetch failed: ${message}`, error, context);
}

type VideosListResponse = {
  items?: { statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }[];
};

export async function fetchVideoStatsViaProvider(youtubeVideoId: string): Promise<VideoStats> {
  const context = { provider: 'youtube' };
  try {
    const client = getOAuthClient();
    const url = new URL(YOUTUBE_VIDEOS_LIST_URL);
    url.searchParams.set('part', 'statistics');
    url.searchParams.set('id', youtubeVideoId);

    const response = await client.request<VideosListResponse>({ url: url.toString() });
    const stats = response.data.items?.[0]?.statistics;
    if (!stats) {
      throw new NonTransientStageError(
        `YouTube videos.list returned no statistics for video ${youtubeVideoId}`,
        undefined,
        context,
      );
    }
    return {
      views: Number(stats.viewCount ?? 0),
      likes: Number(stats.likeCount ?? 0),
      comments: Number(stats.commentCount ?? 0),
    };
  } catch (error) {
    if (error instanceof TransientStageError || error instanceof NonTransientStageError) throw error;
    throw mapGoogleError(error, context);
  }
}
