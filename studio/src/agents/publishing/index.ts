import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { callLLM, extractJsonText, type LLMResponse } from '../../llm';
import { NonTransientStageError } from '../../run-pipeline/retry-with-backoff';
import { uploadVideoViaProvider, setThumbnailViaProvider } from './youtube-client';
import { stubUploadVideo, stubSetThumbnail } from './stub';
import { env } from '../../config/env';
import { buildMetadataUserMessage, scrubDescription, type PackagingParams } from './packaging';
import { PublishingMetadataSchema, type PublishingMetadata, type UploadParams, type UploadResult } from './types';

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

const SYSTEM_PROMPT = `You are optimizing YouTube Shorts metadata (title, description, tags, and cover
frame) from a sanctioned script and its hashtags — platform-specific optimization, not creative
writing (the script itself is already finished and approved).

Respond with ONLY a JSON object:
{"title": string, "description": string, "tags": string[], "coverFrameTimestampRatio": number}
"title" is under 100 characters, attention-grabbing, and accurate to the content — no clickbait
that misrepresents what the video actually shows.
"description" is 1-3 sentences summarizing the content; can restate the hashtags inline.
"tags" is 5-15 short keyword phrases relevant to the topic, no leading '#' character.
"coverFrameTimestampRatio" is a number from 0 to 1 (0 = the very first frame, 1 = the very last)
choosing where through the video to grab a still frame for the custom cover thumbnail — pick a
moment that reads well as a static image outside the Shorts feed (a clear visual, ideally near the
hook, not the first ~5% or last ~5% of the video where a fade-in/fade-out or a mid-word caption
transition is more likely). This matters wherever the Short surfaces outside the Shorts feed itself
(search results, channel page, embeds).
Respond with raw JSON only — no markdown code fences, no commentary.`;

export async function generatePublishingMetadata(
  params: { scriptText: string; hashtags: string[] } & PackagingParams,
): Promise<{ metadata: PublishingMetadata; llm: LLMResponse }> {
  const llm = await callLLM({
    purpose: 'metadata-generation',
    system: SYSTEM_PROMPT,
    // Sprint 4 Task 5 (R17): packaging guidance is appended only when the channel
    // set it; with none, this is exactly the old message.
    messages: [{ role: 'user', content: buildMetadataUserMessage(params) }],
    maxTokens: 512,
  });

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(extractJsonText(llm.text));
  } catch (error) {
    throw new NonTransientStageError(
      `Metadata generation did not return valid JSON: ${llm.text.slice(0, 200)}`,
      error,
    );
  }

  const result = PublishingMetadataSchema.safeParse(parsedJson);
  if (!result.success) {
    throw new NonTransientStageError(`Metadata generation output failed schema validation: ${result.error.message}`);
  }

  // Whatever the model wrote, a placeholder never reaches YouTube.
  const description = scrubDescription(result.data.description, params);
  return { metadata: { ...result.data, description: description || result.data.description }, llm };
}

// YOUTUBE_STUB=1 swaps the real upload for the stub in ./stub.ts — no
// YOUTUBE_REFRESH_TOKEN has been available in any session so far (Week 1
// Task 7's OAuth still open). Same pattern MEDIA_STUB/STOCK_FOOTAGE_STUB use.
export async function uploadVideo(params: UploadParams): Promise<UploadResult> {
  if (env.YOUTUBE_STUB === '1') {
    return stubUploadVideo(params);
  }
  return uploadVideoViaProvider(params);
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
