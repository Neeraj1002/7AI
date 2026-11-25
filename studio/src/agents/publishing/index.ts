import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { callLLM, describeJsonError, extractJsonText, type LLMResponse, type RetryGuard } from '../../llm';
import { NonTransientStageError } from '../../run-pipeline/retry-with-backoff';
import { llmUsageContext } from '../../run-pipeline/stage-failure';
import { getOAuthClient, setThumbnailViaProvider, uploadCaptionsViaProvider, type CaptionsUploadParams } from './youtube-client';
import { uploadResumableVideo, type SessionHooks } from './resumable-upload';
import { stubUploadVideo, stubSetThumbnail, stubUploadCaptions } from './stub';
import { env } from '../../config/env';
import { buildMetadataUserMessage, scrubDescription, type PackagingParams } from './packaging';
import { PublishingMetadataSchema, type PublishingMetadata, type UploadParams, type UploadResult } from './types';
import { SHORT_METADATA_SYSTEM_PROMPT as SYSTEM_PROMPT, LONG_METADATA_SYSTEM_PROMPT as LONG_FORM_SYSTEM_PROMPT } from '../../prompts/system-prompts';

const execFileAsync = promisify(execFile);

// Publishing agent — AGENT_FLEET_DESIGN.md Section 4.7. Two responsibilities:
// (1) generate optimized title/description/tags from the sanctioned script —
// nothing upstream produces these (Script Generation only outputs
// script/captions/hashtags), per docs/execution/week4/BUSINESS_LOGIC.md
// Section 2's flagged architecture call; (2) upload to YouTube at the
// founder's chosen privacy status — a real per-run Gate 2 choice as of Week 5
// Task 5 (D2), defaulting to `private` when unspecified.
// Only youtube-client.ts touches the YouTube Data API v3 — same boundary
// pattern as llm/media/stock-footage's client.ts files.

export type { PublishingMetadata, UploadParams, UploadResult, PrivacyStatus } from './types';
export { PrivacyStatusSchema, DEFAULT_PRIVACY_STATUS } from './types';
export { subtitlesFailureMessage, thumbnailFailureMessage, CAPTIONS_INSERT_QUOTA_UNITS } from './youtube-client';

// The reply shape, word for word the same in the Shorts and long-form metadata prompts.

// Sprint 4 Task 10 (R4): the 16:9 video is not a Short. Same JSON shape; a longer description, and
// never a #shorts tag. The chapter list and credit lines are appended afterwards, in code.
export async function generatePublishingMetadata(
  params: { scriptText: string; hashtags: string[]; videoKind?: 'short' | 'long'; fixNotes?: string; retryGuard?: RetryGuard } & PackagingParams,
): Promise<{ metadata: PublishingMetadata; llm: LLMResponse }> {
  const llm = await callLLM({
    purpose: 'metadata-generation',
    system: params.videoKind === 'long' ? LONG_FORM_SYSTEM_PROMPT : SYSTEM_PROMPT,
    // Sprint 4 Task 5 (R17): packaging guidance is appended only when the channel
    // set it; with none, this is exactly the old message.
    messages: [{ role: 'user', content: buildMetadataUserMessage(params) + (params.fixNotes ? `\n\nThe previous title, description or tags were rejected: ${params.fixNotes} Rewrite them so every figure matches the script exactly, including its hedge words.` : '') }],
    retryGuard: params.retryGuard,
  });

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(extractJsonText(llm.text));
  } catch (error) {
    throw new NonTransientStageError(
      `Metadata generation did not return valid JSON (${describeJsonError(error)})`,
      error,
      llmUsageContext(llm),
    );
  }

  const result = PublishingMetadataSchema.safeParse(parsedJson);
  if (!result.success) {
    throw new NonTransientStageError(`Metadata generation output failed schema validation: ${result.error.message}`, undefined, llmUsageContext(llm));
  }

  // Whatever the model wrote, a placeholder never reaches YouTube.
  const description = scrubDescription(result.data.description, params);
  return { metadata: { ...result.data, description: description || result.data.description }, llm };
}

export async function uploadVideoWithSession(
  params: UploadParams, fileSize: number, sessionUri: string | undefined, hooks: SessionHooks,
): Promise<UploadResult> {
  if (env.YOUTUBE_STUB === '1') {
    if (!sessionUri) await hooks.persistSession('stub://upload-session');
    await hooks.beforeBytes();
    return stubUploadVideo(params);
  }
  const client = await getOAuthClient(params.channelId);
  return uploadResumableVideo(client, params, fileSize, sessionUri, hooks);
}

// Sprint 2 Task 5 (H1) — reuses the exact frame-extraction technique
// Video Intelligence's own sample-frame extraction already established
// (video-intelligence/index.ts's extractSampleFramesBase64): ffmpeg
// `-ss <timestamp> -frames:v 1`, one real JPEG frame, no new pattern.
export async function extractCoverFrame(params: {
  videoPath: string;
  durationSeconds: number;
  coverFrameTimestampRatio: number;
}): Promise<string> {
  const timestampSeconds = Math.min(
    Math.max(params.coverFrameTimestampRatio * params.durationSeconds, 0),
    Math.max(params.durationSeconds - 0.1, 0),
  );
  const framePath = path.join(path.dirname(params.videoPath), `${path.basename(params.videoPath)}.cover-frame.jpg`);
  await execFileAsync(env.FFMPEG_PATH, [
    '-y',
    '-ss',
    timestampSeconds.toFixed(2),
    '-i',
    params.videoPath,
    '-frames:v',
    '1',
    '-q:v',
    '3',
    framePath,
  ]);
  return framePath;
}

// YOUTUBE_STUB=1 swaps the real thumbnails.set call for the stub — same
// flag uploadVideo above uses. Deliberately a separate function from
// uploadVideo, not folded into it: the caller (state-machine.ts) isolates
// this call's failure from the upload's own success/failure, so it needs
// its own call site to wrap independently.
export async function setThumbnail(params: { channelId: string; youtubeVideoId: string; imagePath: string }): Promise<void> {
  if (env.YOUTUBE_STUB === '1') {
    return stubSetThumbnail(params);
  }
  return setThumbnailViaProvider(params);
}

// Sprint 4 Task 10 (R4.4): best-effort subtitle upload after a long-form upload. Throws on failure;
// the caller (runPublishingStage) isolates it, records subtitlesUploaded:false and moves on.
export async function uploadCaptions(params: CaptionsUploadParams): Promise<{ captionId?: string }> {
  if (env.YOUTUBE_STUB === '1') {
    return stubUploadCaptions(params);
  }
  return uploadCaptionsViaProvider(params);
}
