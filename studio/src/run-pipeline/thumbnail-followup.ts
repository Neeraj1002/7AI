import fs from 'node:fs/promises';
import path from 'node:path';
import { YOUTUBE_SUGGESTED } from '../packaging/constants';
import type { PackageRecord, PackagingOutput } from '../packaging/build';
import { thumbnailsDir } from '../packaging/build';

// Sprint 6 Task 1 (R6): the thumbnail step after a video is published, for a run that went through Gate 2 packaging.
// It is a separate follow-up: whatever happens here, the video stays published, `coverFrameSet` says only whether a
// custom thumbnail really went to YouTube, and the file stays on disk for download. The 403 on `thumbnails.set` is
// Task 8 R11.5's; this only reports it truthfully.

export const YOUTUBE_THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024;

export type ThumbnailInfo = { source: 'package' | 'youtube-suggested' | 'frame-grab'; packageId?: string; file?: string };
export type FollowupState = 'pending' | 'started' | 'succeeded' | 'uncertain' | 'failed';

export type ThumbnailFollowupResult = { coverFrameSet: boolean; coverFrameMessage?: string; thumbnail: ThumbnailInfo };

export async function applyThumbnailFollowup(params: {
  runId: string;
  packaging: PackagingOutput;
  chosen: PackageRecord | null;
  alreadySet: boolean;
  state: FollowupState;
  setThumbnail: (imagePath: string) => Promise<void>;
  mark: (state: FollowupState) => Promise<void>;
  readState: () => Promise<FollowupState | undefined>;
  failureMessage: (error: unknown) => string;
  log?: (message: string) => void;
}): Promise<ThumbnailFollowupResult> {
  const { packaging, chosen } = params;
  if (!chosen) {
    // Nothing custom was chosen (YouTube's was kept, no choice was made, or there were no options): nothing is
    // uploaded and nothing claims a custom thumbnail is live.
    return {
      coverFrameSet: false,
      thumbnail: { source: 'youtube-suggested' },
      coverFrameMessage:
        packaging.choice?.packageId === YOUTUBE_SUGGESTED
          ? "You kept YouTube's suggested thumbnail."
          : "No custom thumbnail was chosen, so YouTube's suggested thumbnail is live.",
    };
  }
  const file = path.join(thumbnailsDir(params.runId), chosen.files.full);
  const thumbnail: ThumbnailInfo = { source: 'package', packageId: chosen.id, file: chosen.files.full };
  if (params.alreadySet) return { coverFrameSet: true, thumbnail };
  // After an unresolved earlier attempt the provider's outcome is unknown; it is not tried again by itself.
  if (params.state === 'started' || params.state === 'uncertain') return { coverFrameSet: false, thumbnail };
  try {
    // YouTube takes a thumbnail up to 2 MB; ours are about 200 KB. Refuse before any call if one is not.
    const size = (await fs.stat(file)).size;
    if (size > YOUTUBE_THUMBNAIL_MAX_BYTES) throw new Error(`The chosen thumbnail is ${(size / 1048576).toFixed(1)} MB; YouTube accepts up to 2 MB.`);
    await params.mark('started');
    await params.setThumbnail(file);
    await params.mark('succeeded');
    return { coverFrameSet: true, thumbnail };
  } catch (error) {
    // After 'started' the outcome is unknown ('uncertain'); a refusal before any call is a plain failure.
    const started = (await params.readState()) === 'started';
    await params.mark(started ? 'uncertain' : 'failed');
    params.log?.(`chosen thumbnail upload failed (non-blocking, video already uploaded successfully) - ${error instanceof Error ? error.message : String(error)}`);
    return { coverFrameSet: false, coverFrameMessage: params.failureMessage(error), thumbnail };
  }
}
