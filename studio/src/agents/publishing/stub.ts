import { randomUUID } from 'node:crypto';
import { PRIVACY_STATUS, type UploadParams, type UploadResult } from './types';

// Testing-only stand-in for the real YouTube upload, used when
// YOUTUBE_STUB=1 — Week 1 Task 7's OAuth setup is still `Done — action
// needed` (no YOUTUBE_REFRESH_TOKEN configured in any session so far). Same
// convention as MEDIA_STUB/STOCK_FOOTAGE_STUB: a fake but plausibly-shaped
// youtubeVideoId, so Tasks 3/4 aren't blocked on a founder-side Google Cloud
// step outside this project's control.
export async function stubUploadVideo(_params: UploadParams): Promise<UploadResult> {
  return {
    youtubeVideoId: `stub-${randomUUID()}`,
    privacyStatus: PRIVACY_STATUS,
  };
}
