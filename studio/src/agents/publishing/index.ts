import { callLLM, extractJsonText, type LLMResponse } from '../../llm';
import { NonTransientStageError } from '../../run-pipeline/retry-with-backoff';
import { uploadVideoViaProvider } from './youtube-client';
import { stubUploadVideo } from './stub';
import { env } from '../../config/env';
import { PublishingMetadataSchema, type PublishingMetadata, type UploadParams, type UploadResult } from './types';

// Publishing agent — AGENT_FLEET_DESIGN.md Section 4.7. Two responsibilities:
// (1) generate optimized title/description/tags from the sanctioned script —
// nothing upstream produces these (Script Generation only outputs
// script/captions/hashtags), per docs/execution/week4/BUSINESS_LOGIC.md
// Section 2's flagged architecture call; (2) upload to YouTube as `private`.
// Only youtube-client.ts touches the YouTube Data API v3 — same boundary
// pattern as llm/media/stock-footage's client.ts files.

export type { PublishingMetadata, UploadParams, UploadResult } from './types';
export { PRIVACY_STATUS } from './types';

const SYSTEM_PROMPT = `You are optimizing YouTube Shorts metadata (title, description, tags) from a
sanctioned script and its hashtags — platform-specific optimization, not creative writing (the
script itself is already finished and approved).

Respond with ONLY a JSON object:
{"title": string, "description": string, "tags": string[]}
"title" is under 100 characters, attention-grabbing, and accurate to the content — no clickbait
that misrepresents what the video actually shows.
"description" is 1-3 sentences summarizing the content; can restate the hashtags inline.
"tags" is 5-15 short keyword phrases relevant to the topic, no leading '#' character.
Respond with raw JSON only — no markdown code fences, no commentary.`;

export async function generatePublishingMetadata(params: {
  scriptText: string;
  hashtags: string[];
}): Promise<{ metadata: PublishingMetadata; llm: LLMResponse }> {
  const llm = await callLLM({
    purpose: 'metadata-generation',
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `Script: ${params.scriptText}\nHashtags: ${params.hashtags.join(', ')}` }],
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

  return { metadata: result.data, llm };
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
