import OpenAI from 'openai';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env';
import { NonTransientStageError, TransientStageError } from '../run-pipeline/retry-with-backoff';
import { resolveImagePricing } from './registry';
import type { GenerateStillsParams, GeneratedStillsResult } from './types';
import { DATA_DIR } from '../config/paths';

// The only file allowed to touch OpenAI's image-generation endpoint — same
// boundary pattern as llm/media/stock-footage/publishing's client.ts files.
// Reuses the OPENAI_API_KEY credential already configured for media/ (see
// registry.ts's comment for the real provider decision this task made).

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return client;
}

const AI_VISUALS_TMP_DIR = path.resolve(DATA_DIR, 'ai-visuals-tmp');

async function ensureTmpDir(): Promise<void> {
  await fs.mkdir(AI_VISUALS_TMP_DIR, { recursive: true });
}

function mapOpenAiError(error: unknown, context: Record<string, unknown>): Error {
  if (error instanceof OpenAI.APIError) {
    if (error.status !== undefined && (error.status === 429 || error.status >= 500)) {
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
const STILL_SIZE = '1024x1536' as const;
const STILL_QUALITY = 'low' as const;

export async function generateStillsViaProvider(
  params: GenerateStillsParams & { model: string },
): Promise<GeneratedStillsResult> {
  await ensureTmpDir();
  const context = { provider: 'openai', model: params.model };
  const pricing = resolveImagePricing(params.model);

  try {
    const imagePaths: string[] = [];
    let totalCostUsd = 0;

    // One request per still, not a single n>1 call — OpenAI's images.generate
    // applies one prompt to all n images in a batch; each still here needs
    // its own distinct scene description from the production plan.
    for (const prompt of params.scenePrompts) {
      const response = await getClient().images.generate({
        model: params.model,
        prompt,
        size: STILL_SIZE,
        quality: STILL_QUALITY,
        n: 1,
      });
      const image = response.data?.[0];
      if (!image?.b64_json) {
        throw new NonTransientStageError('OpenAI image generation returned no usable image data', undefined, context);
      }
      const imagePath = path.join(AI_VISUALS_TMP_DIR, `${randomUUID()}.png`);
      await fs.writeFile(imagePath, Buffer.from(image.b64_json, 'base64'));
      imagePaths.push(imagePath);
      totalCostUsd += pricing.perImageUsd;
    }

    return {
      imagePaths,
      provider: 'openai',
      model: params.model,
      costUsd: totalCostUsd.toFixed(6),
    };
  } catch (error) {
    if (error instanceof TransientStageError || error instanceof NonTransientStageError) throw error;
    throw mapOpenAiError(error, context);
  }
}
