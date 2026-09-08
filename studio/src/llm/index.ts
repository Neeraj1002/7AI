// Public surface of the LLM / text-completion layer. Call sites import only
// from here — never from client.ts or registry.ts directly — and declare a
// *purpose*, never a model or provider. See
// docs/decisions/LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md for the full
// rationale, and AGENT_FLEET_DESIGN.md Section 5.1/8.1 for how this fits the
// broader design.

import { callProviderModel } from './client';
import { resolvePurpose } from './registry';
import type { LLMMessage, LLMResponse, Purpose } from './types';

export type { Purpose, LLMMessage, LLMResponse, LLMUsage, LLMRequest } from './types';
export { extractJsonText } from './extract-json';

export async function callLLM(req: {
  purpose: Purpose;
  system: string;
  messages: LLMMessage[];
  maxTokens: number;
}): Promise<LLMResponse> {
  const { provider, model } = resolvePurpose(req.purpose);
  const result = await callProviderModel({
    provider,
    model,
    system: req.system,
    messages: req.messages,
    maxTokens: req.maxTokens,
  });
  return { ...result, provider, model };
}
