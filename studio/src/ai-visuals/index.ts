// Public surface of the AI-visuals capability layer (image-generation-backed
// still frames for the 'ai-stills' visualSource). Call sites import only
// from here — never from client.ts or registry.ts directly — mirroring
// studio/src/media/'s and studio/src/stock-footage/'s import-boundary
// pattern.

import { generateStillsViaProvider } from './client';
import { stubGenerateStills } from './stub';
import { resolveAiVisualsPurpose } from './registry';
import { env } from '../config/env';
import type { GenerateStillsParams, GeneratedStillsResult } from './types';

export type {
  AiVisualsPurpose,
  AiVisualsProvider,
  GenerateStillsParams,
  GeneratedStillsResult,
} from './types';

// AI_VISUALS_STUB=1 swaps the real OpenAI call for the stub in ./stub.ts —
// same pattern MEDIA_STUB/STOCK_FOOTAGE_STUB use, applied at this layer's
// own public surface so video-generation/index.ts never needs to know or
// care which mode is active.
export async function generateStills(params: GenerateStillsParams): Promise<GeneratedStillsResult> {
  if (env.AI_VISUALS_STUB === '1') {
    return stubGenerateStills(params);
  }
  const { model } = resolveAiVisualsPurpose('still-generation');
  return generateStillsViaProvider({ ...params, model });
}
