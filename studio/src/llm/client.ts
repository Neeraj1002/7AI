import { generateText, APICallError, NoObjectGeneratedError, Output } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { env } from '../config/env';
import { NonTransientStageError, TransientStageError } from '../run-pipeline/retry-with-backoff';
import { resolvePricing } from './registry';
import type { LLMMessage, LLMProvider, LLMRequest, ProviderCallResult } from './types';

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

function computeCostUsd(model: string, inputTokens: number, outputTokens: number): string {
  const pricing = resolvePricing(model);
  const cost =
    (inputTokens / 1_000_000) * pricing.inputPerMillionUsd +
    (outputTokens / 1_000_000) * pricing.outputPerMillionUsd;
  return cost.toFixed(6);
}

// Translates this project's own LLMMessage (text + optional attachments)
// into the AI SDK's message shape. A message with no attachments passes
// through as a plain string (unchanged behavior for every pre-Week-3-Task-3
// call site); one with attachments becomes a content-part array using
// `FilePart` (not the deprecated `ImagePart`).
function toModelMessages(messages: LLMMessage[]) {
  return messages.map((message) => {
    if (!message.attachments || message.attachments.length === 0) {
      return { role: message.role, content: message.content };
    }
    return {
      role: message.role,
      content: [
        { type: 'text' as const, text: message.content },
        ...message.attachments.map((attachment) => ({
          type: 'file' as const,
          data: attachment.dataBase64,
          mediaType: attachment.mediaType,
        })),
      ],
    };
  });
}

export async function callProviderModel(params: {
  provider: LLMProvider;
  model: string;
  system: string;
  messages: LLMMessage[];
  maxTokens: number;
  outputSchema?: LLMRequest['outputSchema'];
}): Promise<ProviderCallResult> {
  try {
    const result = await generateText({
      model: resolveModel(params.provider, params.model),
      system: params.system,
      messages: toModelMessages(params.messages),
      maxOutputTokens: params.maxTokens,
      maxRetries: 0, // The stage wrapper owns bounded retries and capacity stops.
      // Bugs Task 11 (R3) — schema-constrained decoding where the provider supports
      // it for this model (the SDK moves constraints the provider's schema
      // dialect lacks, e.g. minLength, into the schema description).
      ...(params.outputSchema ? { output: Output.object({ schema: params.outputSchema }) } : {}),
    });

    const inputTokens = result.usage.inputTokens ?? 0;
    const outputTokens = result.usage.outputTokens ?? 0;

    return {
      text: result.text,
      usage: { inputTokens, outputTokens, ...(result.usage.outputTokenDetails?.reasoningTokens !== undefined ? { reasoningTokens: result.usage.outputTokenDetails.reasoningTokens } : {}) },
      stopReason: result.finishReason,
      ...(result.response?.modelId ? { responseModel: result.response.modelId } : {}),
      ...(result.rawFinishReason ? { rawStopReason: result.rawFinishReason } : {}),
      costUsd: computeCostUsd(params.model, inputTokens, outputTokens),
    };
  } catch (error) {
    // Bugs Task 11 (R3) — with an output schema the SDK itself parses the reply and
    // throws NoObjectGeneratedError when the text is not the object (cut off at
    // the cap, or failing the schema). The model call still completed and was
    // billed, so return it as an ordinary text result: the caller's own parse,
    // retry and usage accounting then handle it like any other unusable reply,
    // instead of the real usage being lost inside an error.
    if (params.outputSchema && NoObjectGeneratedError.isInstance(error) && typeof error.text === 'string' && error.usage) {
      const inputTokens = error.usage.inputTokens ?? 0;
      const outputTokens = error.usage.outputTokens ?? 0;
      return {
        text: error.text,
        usage: { inputTokens, outputTokens, ...(error.usage.outputTokenDetails?.reasoningTokens !== undefined ? { reasoningTokens: error.usage.outputTokenDetails.reasoningTokens } : {}) },
        stopReason: error.finishReason ?? 'unknown',
        ...(error.response?.modelId ? { responseModel: error.response.modelId } : {}),
        costUsd: computeCostUsd(params.model, inputTokens, outputTokens),
      };
    }
    // Attach provider/model so a caller that needs to write a UsageEvent row
    // on failure (Week 2 Task 4) has it without re-resolving the registry —
    // token counts aren't available for a call that never completed.
    const context: Record<string, unknown> = { provider: params.provider, model: params.model };

    // APICallError.isRetryable is the AI SDK's own transient/permanent
    // classification (rate limits, timeouts, 5xx vs. auth/validation 4xx) —
    // reuse it rather than re-deriving status-code logic per provider.
    if (APICallError.isInstance(error)) {
      // Bugs Task 11 (R3) — the HTTP status, so a caller can tell a request the
      // provider refused (400/422) from an outage (5xx) without parsing text.
      if (typeof error.statusCode === 'number') context.statusCode = error.statusCode;
      // Anthropic documents both temporary throttling and workspace spend
      // limits as 429/rate_limit_error. The SDK does not expose a stable
      // sub-code for the latter, so recognise only the provider's verified,
      // specific workspace-limit message; ambiguous 429s still get bounded
      // automatic retry and become manually resumable only if that is spent.
      context.providerErrorMessage = error.message;
      context.providerResponseBody = error.responseBody;
      const detail = `${error.message} ${error.responseBody ?? ""}`.toLowerCase();
      if (
        params.provider === 'anthropic' && error.statusCode === 429 &&
        detail.includes('workspace api usage limit')
      ) {
        context.recoveryKind = 'provider_capacity';
        throw new NonTransientStageError(`LLM provider capacity exhausted: ${error.message}`, error, context);
      }
      if (error.isRetryable) {
        if (error.statusCode === 429) context.recoveryKind = 'rate_limit_exhausted';
        throw new TransientStageError(`LLM provider call failed (retryable): ${error.message}`, error, context);
      }
      throw new NonTransientStageError(`LLM provider call failed: ${error.message}`, error, context);
    }
    throw new NonTransientStageError('LLM provider call failed with an unrecognized error', error, context);
  }
}
