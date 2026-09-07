import { generateText, APICallError } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { env } from '../config/env';
import { NonTransientStageError, TransientStageError } from '../run-pipeline/retry-with-backoff';
import type { LLMMessage, LLMProvider, LLMResponse } from './types';

// The only file allowed to import Vercel AI SDK or a provider SDK — see
// docs/decisions/LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md. Everything this
// module returns is this project's own shape (types.ts); everything it
// catches is translated to the existing TransientStageError/NonTransientStageError
// taxonomy from run-pipeline/retry-with-backoff.ts before it leaves this file.
// Swapping the underlying library means rewriting this one file, no call site
// changes.

let anthropicProvider: ReturnType<typeof createAnthropic> | null = null;
function getAnthropicProvider() {
  if (!anthropicProvider) {
    anthropicProvider = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return anthropicProvider;
}

function resolveModel(provider: LLMProvider, model: string) {
  switch (provider) {
    case 'anthropic':
      return getAnthropicProvider()(model);
    default: {
      const exhaustive: never = provider;
      throw new NonTransientStageError(`Unknown LLM provider '${exhaustive as string}'`);
    }
  }
}

export async function callProviderModel(params: {
  provider: LLMProvider;
  model: string;
  system: string;
  messages: LLMMessage[];
  maxTokens: number;
}): Promise<LLMResponse> {
  try {
    const result = await generateText({
      model: resolveModel(params.provider, params.model),
      system: params.system,
      messages: params.messages,
      maxOutputTokens: params.maxTokens,
    });

    return {
      text: result.text,
      usage: {
        inputTokens: result.usage.inputTokens ?? 0,
        outputTokens: result.usage.outputTokens ?? 0,
      },
      stopReason: result.finishReason,
    };
  } catch (error) {
    // APICallError.isRetryable is the AI SDK's own transient/permanent
    // classification (rate limits, timeouts, 5xx vs. auth/validation 4xx) —
    // reuse it rather than re-deriving status-code logic per provider.
    if (APICallError.isInstance(error)) {
      if (error.isRetryable) {
        throw new TransientStageError(`LLM provider call failed (retryable): ${error.message}`, error);
      }
      throw new NonTransientStageError(`LLM provider call failed: ${error.message}`, error);
    }
    throw new NonTransientStageError('LLM provider call failed with an unrecognized error', error);
  }
}
