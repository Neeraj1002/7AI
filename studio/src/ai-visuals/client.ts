import OpenAI from 'openai';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env';
import { NonTransientStageError, TransientStageError } from '../run-pipeline/retry-with-backoff';
import { priceStill, resolveImagePricing } from './registry';
import { STILL_SIZE_PORTRAIT, STILL_QUALITY, type StillSize } from './sizes';
import { stillCacheKey, stillCachePath, cachedStillExists } from './cache';
import type { GenerateStillsParams, GeneratedStillsResult } from './types';
import { DATA_DIR } from '../config/paths';

// The only file allowed to touch OpenAI's image-generation endpoint — same
// boundary pattern as llm/media/stock-footage/publishing's client.ts files.
// Reuses the OPENAI_API_KEY credential already configured for media/ (see
// registry.ts's comment for the real provider decision this task made).

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: env.OPENAI_API_KEY, maxRetries: 0 });
  }
  return client;
}

const AI_VISUALS_TMP_DIR = path.resolve(DATA_DIR, 'ai-visuals-tmp');

async function ensureTmpDir(): Promise<void> {
  await fs.mkdir(AI_VISUALS_TMP_DIR, { recursive: true });
}

function mapOpenAiError(error: unknown, context: Record<string, unknown>): Error {
  if (error instanceof OpenAI.APIError) {
    context.statusCode = error.status;
    context.providerErrorMessage = error.message;
    if (typeof error.code === 'string') context.providerErrorCode = error.code;
    if (error.code === 'insufficient_quota') {
      context.recoveryKind = 'provider_capacity';
      return new NonTransientStageError(`OpenAI image capacity exhausted: ${error.message}`, error, context);
    }
    if (error.status !== undefined && (error.status === 429 || error.status >= 500)) {
      if (error.status === 429) context.recoveryKind = 'rate_limit_exhausted';
      return new TransientStageError(`OpenAI image generation failed (retryable): ${error.message}`, error, context);
    }
    return new NonTransientStageError(`OpenAI image generation failed: ${error.message}`, error, context);
  }
  return new NonTransientStageError('OpenAI image generation failed with an unrecognized error', error, context);
}

// Portrait, closest of the GPT image models' fixed sizes to the project's
// 1080x1920 target — the shared scale/crop step in video-generation/index.ts
// already handles the exact-size mismatch, the same way it already does for
// stock-footage clips that don't natively match 1080x1920 either.
// (Sprint 4 Task 9: the sizes now live in ./sizes.ts; portrait stays the default.)

// Sprint 4 Task 8 (R6) — measured on a real run: this org's gpt-image limit is
// 5 images/minute, and the faster default pacing sends 6-20 per attempt. A 429
// on still 17 of 18 must not throw away (and re-bill) the 16 already generated,
// which is what letting it propagate to the pipeline-level retry would do. So
// a rate limit is waited out per still, honouring the provider's own hint.
const RATE_LIMIT_MAX_ATTEMPTS = 6;
const RATE_LIMIT_DEFAULT_WAIT_MS = 15_000;

export function rateLimitWaitMs(message: string): number {
  const m = /try again in (\d+(?:\.\d+)?)\s*(ms|s)(?![a-z])/i.exec(message);
  if (!m) return RATE_LIMIT_DEFAULT_WAIT_MS;
  const value = parseFloat(m[1]);
  // +1s of slack: the hint is the time until one slot frees, not a guarantee.
  return Math.ceil((m[2].toLowerCase() === 'ms' ? value : value * 1000) + 1000);
}

async function generateOneStill(model: string, prompt: string, size: StillSize): Promise<OpenAI.Images.ImagesResponse> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return (await getClient().images.generate({
        model,
        prompt,
        size,
        quality: STILL_QUALITY,
        n: 1,
      })) as OpenAI.Images.ImagesResponse;
    } catch (error) {
      if (error instanceof OpenAI.APIError && error.status === 429 && error.code !== 'insufficient_quota' && attempt < RATE_LIMIT_MAX_ATTEMPTS) {
        const waitMs = rateLimitWaitMs(error.message);
        console.warn(`[ai-visuals] rate limited (attempt ${attempt}/${RATE_LIMIT_MAX_ATTEMPTS}) — waiting ${(waitMs / 1000).toFixed(0)}s, keeping stills generated so far`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }
      throw error;
    }
  }
}

export async function generateStillsViaProvider(
  params: GenerateStillsParams & { model: string },
): Promise<GeneratedStillsResult> {
  await ensureTmpDir();
  const context = { provider: 'openai', model: params.model };
  const pricing = resolveImagePricing(params.model);

  // Declared outside the try so a failure part-way still reports what the
  // stills already generated cost (Bugs Closure 2, P5): they were billed.
  const imagePaths: string[] = [];
  let totalCostUsd = 0;
  try {

    // One request per still, not a single n>1 call — OpenAI's images.generate
    // applies one prompt to all n images in a batch; each still here needs
    // its own distinct scene description from the production plan.
    let skippedPromptCount = 0;
    let cachedCount = 0;
    const promptIndexes: number[] = [];
    const size = params.size ?? STILL_SIZE_PORTRAIT;
    if (params.cacheDir) await fs.mkdir(params.cacheDir, { recursive: true });
    const total = params.scenePrompts.length;
    let finished = 0;
    params.onProgress?.({ done: 0, total });
    for (let index = 0; index < params.scenePrompts.length; index += 1) {
      const prompt = params.scenePrompts[index];
      // Sprint 4 Task 9 (R5.4): a still already paid for (an earlier attempt, a restart) costs nothing.
      const cachePath = params.cacheDir
        ? stillCachePath(params.cacheDir, stillCacheKey({ model: params.model, size, quality: STILL_QUALITY, prompt }))
        : undefined;
      if (cachePath && (await cachedStillExists(cachePath)) &&
        (!params.validateCachedStill || await params.validateCachedStill(cachePath))) {
        imagePaths.push(cachePath);
        promptIndexes.push(index);
        cachedCount += 1;
        finished += 1;
        params.onProgress?.({ done: finished, total });
        continue;
      }
      let response: OpenAI.Images.ImagesResponse;
      try {
        response = await generateOneStill(params.model, prompt, size);
      } catch (error) {
        // A provider safety refusal of one scene (e.g. a minor in a medical
        // setting) is a property of that prompt, not an outage: skip the still
        // and keep the rest. Not billed, so not added to the cost either.
        if (error instanceof OpenAI.APIError && error.code === 'moderation_blocked') {
          skippedPromptCount += 1;
          finished += 1;
          params.onProgress?.({ done: finished, total });
          console.warn(`[ai-visuals] still skipped — provider safety system blocked prompt: ${prompt.slice(0, 120)}`);
          continue;
        }
        throw error;
      }
      const image = response.data?.[0];
      if (!image?.b64_json) {
        throw new NonTransientStageError('OpenAI image generation returned no usable image data', undefined, context);
      }
      const imagePath = cachePath ?? path.join(AI_VISUALS_TMP_DIR, `${randomUUID()}.png`);
      // Write within the destination directory and publish with one rename:
      // a killed process never leaves a half-written image that looks cached.
      const partial = `${imagePath}.${randomUUID()}.partial`;
      try {
        // Flush to disk before the rename: the response is paid for, so a crash after this
        // point must leave a complete cached still for the restart to reuse.
        const handle = await fs.open(partial, 'wx');
        try {
          await handle.writeFile(Buffer.from(image.b64_json, 'base64'));
          await handle.sync();
        } finally {
          await handle.close();
        }
        await fs.rename(partial, imagePath);
      } finally {
        await fs.unlink(partial).catch(() => undefined);
      }
      imagePaths.push(imagePath);
      promptIndexes.push(index);
      const stillCostUsd = priceStill(pricing, response.usage);
      totalCostUsd += stillCostUsd;
      finished += 1;
      params.onProgress?.({ done: finished, total });
      await params.onStillGenerated?.({ index, costUsd: stillCostUsd, model: params.model });
    }

    if (imagePaths.length === 0) {
      throw new NonTransientStageError(
        `OpenAI image generation: every one of the ${params.scenePrompts.length} scene prompts was blocked by the provider's safety system`,
        undefined,
        context,
      );
    }

    return {
      imagePaths,
      provider: 'openai',
      model: params.model,
      costUsd: totalCostUsd.toFixed(6),
      ...(skippedPromptCount > 0 && { skippedPromptCount }),
      ...(params.cacheDir && { cachedCount, promptIndexes }),
    };
  } catch (error) {
    const partial = { partialStillCount: imagePaths.length, partialCostUsd: totalCostUsd.toFixed(6) };
    if (error instanceof TransientStageError || error instanceof NonTransientStageError) {
      // Merge into the thrower's own context (the retry logic reads the class, not this).
      (error as { context?: Record<string, unknown> }).context = { ...error.context, ...partial };
      throw error;
    }
    throw mapOpenAiError(error, { ...context, ...partial });
  }
}
