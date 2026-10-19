import { generateText, streamText, APICallError, NoObjectGeneratedError, Output } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { env } from '../config/env';
import { NonTransientStageError, TransientStageError } from '../run-pipeline/retry-with-backoff';
import { isTimeoutLike } from './failure-policy';
import { MODEL_FACTS, resolveModelFacts } from './models';
import { resolvePricing } from './registry';
import type { LLMMessage, LLMProvider, LLMRequest, LLMUsage, ProviderCallResult, Reasoning } from './types';

// The only file allowed to import Vercel AI SDK or a provider SDK — see
// docs/decisions/LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md. Everything this
// module returns is this project's own shape (types.ts); everything it
// catches is translated to the existing TransientStageError/NonTransientStageError
// taxonomy from run-pipeline/retry-with-backoff.ts before it leaves this file.
// Swapping the underlying library means rewriting this one file, no call site
// changes.

// Claude Sonnet 5.5 rejects `thinking: { type: "disabled" }` and takes `{ type: "between_tools" }` as its
// lowest setting. The installed @ai-sdk/anthropic only knows adaptive / enabled / disabled, so the request
// is built as `disabled` and rewritten on the wire for the models whose facts say so (llm/models.ts).
export function rewriteThinkingBody(body: unknown): unknown {
  if (typeof body !== 'string') return body;
  try {
    const parsed = JSON.parse(body) as { model?: string; thinking?: { type?: string } };
    if (parsed.thinking?.type === 'disabled' && parsed.model && MODEL_FACTS[parsed.model]?.thinking === 'adaptive-between-tools') {
      return JSON.stringify({ ...parsed, thinking: { type: 'between_tools' } });
    }
  } catch {
    // Not JSON: leave it exactly as the SDK built it.
  }
  return body;
}

let anthropicProvider: ReturnType<typeof createAnthropic> | null = null;
function getAnthropicProvider() {
  if (!anthropicProvider) {
    anthropicProvider = createAnthropic({
      apiKey: env.ANTHROPIC_API_KEY,
      fetch: (input, init) => fetch(input, init ? { ...init, body: rewriteThinkingBody(init.body) as typeof init.body } : init),
    });
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
    // Sent as `disabled` for every model; rewriteThinkingBody turns it into `between_tools` where the
    // model requires that (Claude Sonnet 5.5 rejects `disabled`).
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

// R6 - reply part kinds with counts, in the provider's own words mapped to plain ones ('reasoning' -> 'thinking'),
// for example 'thinking:1,text:0'. text and thinking are always listed so an empty reply reads as text:0.
export function describeBlocks(parts: ReadonlyArray<{ type: string }> | undefined, fallback: { text: string; reasoningTokens?: number }): string {
  const counts = new Map<string, number>([['thinking', 0], ['text', 0]]);
  if (parts) {
    for (const part of parts) {
      const kind = part.type === 'reasoning' ? 'thinking' : part.type === 'text' ? 'text' : part.type;
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
  } else {
    // A structured request that the SDK could not turn into an object returns no parts: infer what we can.
    counts.set('text', fallback.text.length > 0 ? 1 : 0);
    counts.set('thinking', (fallback.reasoningTokens ?? 0) > 0 ? 1 : 0);
  }
  return [...counts.entries()].map(([kind, count]) => `${kind}:${count}`).join(',');
}

const KEPT_HEADERS = ['request-id', 'x-request-id', 'retry-after', 'anthropic-ratelimit-requests-remaining', 'anthropic-ratelimit-output-tokens-remaining'];

// R6 - the response metadata kept for a failed call: ids, model, timestamp, a few headers and the provider's own
// metadata. Never the prompt and never the reply body (the reply is kept separately, capped, by the stage).
export function responseMetaOf(
  response: { id?: string; modelId?: string; timestamp?: Date; headers?: Record<string, string> } | undefined,
  providerMetadata: unknown,
): Record<string, unknown> {
  const headers: Record<string, string> = {};
  for (const key of KEPT_HEADERS) {
    const value = response?.headers?.[key];
    if (typeof value === 'string') headers[key] = value;
  }
  return {
    ...(response?.id ? { id: response.id } : {}),
    ...(response?.modelId ? { modelId: response.modelId } : {}),
    ...(response?.timestamp ? { timestamp: response.timestamp.toISOString() } : {}),
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
    ...(providerMetadata ? { providerMetadata } : {}),
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
        const [text, rawUsage, finishReason, finalStep] = await Promise.all([streamed.text, streamed.usage, streamed.finishReason, streamed.finalStep]);
        const usage = usageOf(rawUsage);
        return {
          text,
          usage,
          stopReason: finishReason,
          rawFinishReason: finalStep.rawFinishReason ?? null,
          blocks: describeBlocks(finalStep.content, { text, reasoningTokens: usage.reasoningTokens }),
          responseMeta: responseMetaOf(finalStep.response, finalStep.providerMetadata),
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
      rawFinishReason: result.rawFinishReason ?? null,
      blocks: describeBlocks(result.content, { text: result.text, reasoningTokens: usage.reasoningTokens }),
      responseMeta: responseMetaOf(result.response, result.providerMetadata),
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
        rawFinishReason: null,
        blocks: describeBlocks(undefined, { text: error.text, reasoningTokens: usage.reasoningTokens }),
        responseMeta: responseMetaOf(error.response, undefined),
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
      // R5: the headers the retry policy reads (retry-after) and R6's evidence keeps.
      if (error.responseHeaders) context.responseHeaders = error.responseHeaders;
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
    // R5: a timeout or a dropped connection that did not arrive as an APICallError is as transient as one that did.
    if (isTimeoutLike(error)) {
      throw new TransientStageError(`LLM provider call failed (timeout or network error): ${error instanceof Error ? error.message : String(error)}`, error, context);
    }
    throw new NonTransientStageError('LLM provider call failed with an unrecognized error', error, context);
  }
}
