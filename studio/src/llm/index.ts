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

// Sprint 5 Task 8 (R2): the cheapest real call the account can make (one output token on the cheap
// tier, well under a hundredth of a cent). Preflight uses it to learn that a workspace usage limit
// or a rejected key is in force before the first paid step, instead of at the review. Throws the
// same classified errors every other call does (recoveryKind on the error context).
export async function probeLLMProvider(): Promise<void> {
  const { provider, model } = resolvePurpose('intake-parsing');
  await callProviderModel({
    provider,
    model,
    system: 'Reply with OK.',
    messages: [{ role: 'user', content: 'ping' }],
    maxTokens: 1,
  });
}
