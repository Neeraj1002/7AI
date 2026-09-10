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
