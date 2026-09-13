import { randomUUID } from 'node:crypto';
import type { UploadParams, UploadResult } from './types';

// Testing-only stand-in for the real YouTube upload, used when
// YOUTUBE_STUB=1 — Week 1 Task 7's OAuth setup is still `Done — action
// needed` (no YOUTUBE_REFRESH_TOKEN configured in any session so far). Same
// convention as MEDIA_STUB/STOCK_FOOTAGE_STUB: a fake but plausibly-shaped
// youtubeVideoId, so Tasks 3/4 aren't blocked on a founder-side Google Cloud
// step outside this project's control.
//
// Honors the real params.privacyStatus (Week 5 Task 5, D2) rather than a
// hardcoded constant, so YOUTUBE_STUB=1 testing stays realistic about what
// privacy status a run would actually publish at.
export async function stubUploadVideo(params: UploadParams): Promise<UploadResult> {
  return {
    youtubeVideoId: `stub-${randomUUID()}`,
    privacyStatus: params.privacyStatus,
  };
}
