import type { RetentionCurvePoint } from '../../types';
import type { VideoStats } from './types';

// Testing-only stand-in for the real YouTube Data API v3 stats fetch, used
// when YOUTUBE_STUB=1 — same flag Publishing's upload stub uses (both are
// blocked by the exact same missing YOUTUBE_REFRESH_TOKEN). Plausible,
// non-zero placeholder numbers, not empty/fake-shaped data — same posture as
// media/stub.ts.
export async function stubFetchVideoStats(_youtubeVideoId: string): Promise<VideoStats> {
  return {
    views: Math.floor(Math.random() * 500),
    likes: Math.floor(Math.random() * 50),
    comments: Math.floor(Math.random() * 10),
  };
}

// Sprint 2 Task 4 (G1/G2) — testing-only stand-in for the real YouTube
// Analytics API audience-retention report, used when
// YOUTUBE_ANALYTICS_STUB=1 (a separate flag from YOUTUBE_STUB — the real
// call is blocked by two distinct founder actions, not a missing
// credential; see youtube-analytics-client.ts). Shaped like a real
// retention curve, not arbitrary noise: 21 points (elapsedVideoTimeRatio
// 0.00, 0.05, ..., 1.00 — YouTube's real reports commonly bucket in
// similar fixed increments), audienceWatchRatio starting near 1.0 and
// trending downward with small realistic jitter, matching the real shape
// documented for this metric/dimension pair, not just plausible-sounding
// placeholder numbers.
export async function stubFetchRetentionCurve(_youtubeVideoId: string): Promise<RetentionCurvePoint[]> {
  const points: RetentionCurvePoint[] = [];
  for (let i = 0; i <= 20; i += 1) {
    const elapsedVideoTimeRatio = Math.round((i / 20) * 100) / 100;
    const baseline = 1 - elapsedVideoTimeRatio * 0.6; // gentle real-shaped decline
    const jitter = (Math.random() - 0.5) * 0.05;
    const audienceWatchRatio = Math.max(0, Math.round((baseline + jitter) * 1000) / 1000);
    points.push({ elapsedVideoTimeRatio, audienceWatchRatio });
  }
  return points;
}
