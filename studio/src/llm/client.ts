import { generateText, streamText, APICallError, NoObjectGeneratedError, Output } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { env } from '../config/env';
import { NonTransientStageError, TransientStageError } from '../run-pipeline/retry-with-backoff';
import { resolveModelFacts } from './models';
import { resolvePricing } from './registry';
import type { LLMMessage, LLMProvider, LLMRequest, LLMUsage, ProviderCallResult, Reasoning } from './types';

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

// LLM Registry task (R1): the thinking setting is always sent, never left to the provider's default
// (Claude Sonnet 5 reasons by default and the reasoning counts against the output limit).
function buildThinking(model: string, reasoning: Reasoning) {
  const facts = resolveModelFacts(model);
  if (reasoning === 'off') {
    if (facts.thinking === 'adaptive-between-tools') {
      // The provider rejects `disabled` here and wants `between_tools`, which the installed
      // @ai-sdk/anthropic cannot send. Fail before the call instead of paying for default reasoning.
      throw new NonTransientStageError(
        `${model} can only be run without up-front reasoning with thinking type 'between_tools', which the installed @ai-sdk/anthropic cannot send. Upgrade the SDK (or send it through the client) before moving a purpose to this model.`,
      );
    }
    return { type: 'disabled' as const };
  }
  if (facts.thinking !== 'extended') {
    throw new NonTransientStageError(`${model} rejects a manual reasoning budget; it reasons adaptively.`);
  }
  return { type: 'enabled' as const, budgetTokens: reasoning.budgetTokens };
}

function usageOf(raw: { inputTokens?: number; outputTokens?: number; outputTokenDetails?: { reasoningTokens?: number } } | undefined): LLMUsage {
  const reasoningTokens = raw?.outputTokenDetails?.reasoningTokens;
  return {
    inputTokens: raw?.inputTokens ?? 0,
    outputTokens: raw?.outputTokens ?? 0,
    ...(typeof reasoningTokens === 'number' ? { reasoningTokens } : {}),
  };
}

export async function callProviderModel(params: {
  provider: LLMProvider;
  model: string;
  system: string;
  messages: LLMMessage[];
  maxOutputTokens: number;
  reasoning: Reasoning;
  // The retry at a large limit streams, as the provider documents for requests above ~21k output tokens.
  stream?: boolean;
  outputSchema?: LLMRequest['outputSchema'];
}): Promise<ProviderCallResult> {
  // Built before the try so its refusal is not re-wrapped as an unrecognized provider error.
  const thinking = buildThinking(params.model, params.reasoning);
  try {
    const request = {
      model: resolveModel(params.provider, params.model),
      system: params.system,
      messages: toModelMessages(params.messages),
      maxOutputTokens: params.maxOutputTokens,
      maxRetries: 0, // The stage wrapper owns bounded retries and capacity stops.
      providerOptions: { anthropic: { thinking } },
      // Bugs Task 11 (R3) — schema-constrained decoding where the provider supports
      // it for this model (the SDK moves constraints the provider's schema
      // dialect lacks, e.g. minLength, into the schema description).
      ...(params.outputSchema ? { output: Output.object({ schema: params.outputSchema }) } : {}),
    };

    if (params.stream) {
      let streamError: unknown;
      const streamed = streamText({ ...request, onError: ({ error }) => { streamError = error; } });
      try {
        const [text, rawUsage, finishReason] = await Promise.all([streamed.text, streamed.usage, streamed.finishReason]);
        const usage = usageOf(rawUsage);
        return {
          text,
          usage,
          stopReason: finishReason,
          costUsd: computeCostUsd(params.model, usage.inputTokens, usage.outputTokens),
        };
      } catch (error) {
        throw streamError ?? error;
      }
    }

    const result = await generateText(request);

    const usage = usageOf(result.usage);

    return {
      text: result.text,
      usage,
      stopReason: result.finishReason,
      costUsd: computeCostUsd(params.model, usage.inputTokens, usage.outputTokens),
    };
  } catch (error) {
    // Bugs Task 11 (R3) — with an output schema the SDK itself parses the reply and
    // throws NoObjectGeneratedError when the text is not the object (cut off at
    // the cap, or failing the schema). The model call still completed and was
    // billed, so return it as an ordinary text result: the caller's own parse,
    // retry and usage accounting then handle it like any other unusable reply,
    // instead of the real usage being lost inside an error.
    if (params.outputSchema && NoObjectGeneratedError.isInstance(error) && typeof error.text === 'string' && error.usage) {
      const usage = usageOf(error.usage);
      return {
        text: error.text,
        usage,
        stopReason: error.finishReason ?? 'unknown',
        costUsd: computeCostUsd(params.model, usage.inputTokens, usage.outputTokens),
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
