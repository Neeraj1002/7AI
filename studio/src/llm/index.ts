// Public surface of the LLM / text-completion layer. Call sites import only
// from here — never from client.ts or registry.ts directly — and declare a
// *purpose*, never a model or provider. See
// docs/decisions/LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md for the full
// rationale, and AGENT_FLEET_DESIGN.md Section 5.1/8.1 for how this fits the
// broader design.

import { callProviderModel } from './client';
import { resolvePurpose } from './registry';
import type { LLMMessage, LLMRequest, LLMResponse, Purpose } from './types';

export type { Purpose, LLMMessage, LLMResponse, LLMUsage, LLMRequest } from './types';
export { extractJsonText, extractJsonObjectText, describeJsonError } from './extract-json';
export { resolvePurpose, resolvePricing } from './registry';

export async function callLLM(req: {
  purpose: Purpose;
  system: string;
  messages: LLMMessage[];
  maxTokens: number;
  outputSchema?: LLMRequest['outputSchema'];
}): Promise<LLMResponse> {
  const { provider, model } = resolvePurpose(req.purpose);
  const result = await callProviderModel({
    provider,
    model,
    system: req.system,
    messages: req.messages,
    maxTokens: req.maxTokens,
    outputSchema: req.outputSchema,
  });
  return { ...result, provider, model };
}

/** Explicit comparison seam; the normal purpose registry is unchanged. */
export async function callScriptReviewForEvaluation(req: Parameters<typeof callLLM>[0], model: 'claude-haiku-4-5' | 'claude-sonnet-5-5'): Promise<LLMResponse> {
  if (req.purpose !== 'script-review') throw new Error('Evaluation override is limited to script-review');
  const provider = 'anthropic' as const;
  const result = await callProviderModel({ ...req, provider, model });
  return { ...result, provider, model };
}
