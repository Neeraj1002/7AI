import fs from 'node:fs/promises';
import { env } from '../config/env';
import { isR2Configured, uploadToR2 } from '../storage/r2-client';
import { findSrtPath } from './artifacts';
import { createPreviewCopy } from './preview';

// Sprint 4 Task 10 (R3): everything a long-form run needs before Gate 2 can show it: the small
// preview copy, and the subtitle file (so the download link works whether or not the later
// YouTube upload of it does). Stored beside the draft video in R2 when R2 is configured; the
// local paths are always recorded so the local /runs/:id/preview route works without R2.

export type LongFormGate2Artifacts = {
  previewPath: string;
  previewBytes: number;
  srtPath: string;
  r2PreviewKey?: string;
  r2SrtKey?: string;
};

export async function prepareLongFormGate2Artifacts(params: {
  runId: string;
  tenantId: string;
  attemptNumber: number;
  videoPath: string;
  videoGenOutput: unknown;
}): Promise<LongFormGate2Artifacts> {
  // A long-form video always has subtitles; one that cannot be found is a stage failure, never a
  // silent skip (a check that cannot run must fail loudly).
  const srtPath = await findSrtPath(params.videoGenOutput, params.videoPath);
  if (!srtPath) {
    throw new Error(`Long-form run ${params.runId} has no captions.srt next to its video - cannot prepare Gate 2`);
  }
  const previewPath = await createPreviewCopy(params.videoPath);
  const previewBytes = (await fs.stat(previewPath)).size;
  console.log(`[video_review] run ${params.runId}: preview copy ${(previewBytes / 1024 / 1024).toFixed(1)} MB`);

  const result: LongFormGate2Artifacts = { previewPath, previewBytes, srtPath };
  if (isR2Configured()) {
    const prefix = `videos/${env.NODE_ENV}/drafts/${params.tenantId}/${params.runId}/${params.attemptNumber}`;
    try {
      await uploadToR2({ key: `${prefix}.preview.mp4`, filePath: previewPath, contentType: 'video/mp4' });
      result.r2PreviewKey = `${prefix}.preview.mp4`;
      await uploadToR2({ key: `${prefix}.srt`, filePath: srtPath, contentType: 'application/x-subrip' });
      result.r2SrtKey = `${prefix}.srt`;
    } catch (error) {
      // Same posture as the draft upload: R2 is additive, the local files still serve the app.
      console.error(`[video_review] run ${params.runId}: R2 upload of preview/subtitles failed (non-blocking): ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return result;
}
