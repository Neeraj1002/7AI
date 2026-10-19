// What the client must know about each model it can call: the output ceiling,
// how the model's hidden reasoning is controlled, and when a request has to
// stream. Read from Anthropic's model and thinking documentation on
// 2026-10-19, never from memory:
//   https://platform.claude.com/docs/en/models/overview
//   https://platform.claude.com/docs/en/models/sonnet-5/overview
//   https://platform.claude.com/docs/en/models/haiku-4-5/overview
//   https://platform.claude.com/docs/en/build-with-claude/thinking
// Part B (R7) added the pinned id and structured-output columns, read on 2026-10-19 from:
//   https://platform.claude.com/docs/en/models/overview  ("Every Claude model ID is a pinned snapshot, including
//     the dateless IDs used from the 4.6 generation on"; Claude Haiku 4.5 is the one model in use whose id is an
//     alias of a dated snapshot, `claude-haiku-4-5-20251001`)
//   https://platform.claude.com/docs/en/build-with-claude/structured-outputs  (its `supportedModels` list names
//     claude-sonnet-5-5, claude-sonnet-5 and claude-haiku-4-5-20251001)

export type ThinkingControl =
  // Adaptive thinking is ON when the request says nothing, and `thinking: { type: "disabled" }` turns it off
  // (Claude Sonnet 5). A manual `budget_tokens` is a 400 error.
  | 'adaptive-disableable'
  // Adaptive thinking is on by default and `disabled` is a 400 error; the lowest setting is
  // `thinking: { type: "between_tools" }` (Claude Sonnet 5.5). `budget_tokens` is a 400 error. The installed @ai-sdk/anthropic cannot express it,
  // so client.ts rewrites a `disabled` request for these models on the wire.
  | 'adaptive-between-tools'
  // Thinking is OFF unless the request enables it with a `budget_tokens` (Claude Haiku 4.5).
  | 'extended';

export type ModelFacts = {
  // Synchronous Messages API limit.
  maxOutputTokens: number;
  thinking: ThinkingControl;
  // Above this many requested output tokens the provider documents that a request should stream
  // ("The SDK requires streaming when max_tokens is greater than 21,333, to avoid HTTP timeouts").
  streamingAboveTokens: number;
  // The id the provider pins to a snapshot. For a dateless id (Sonnet 5, Sonnet 5.5) it is the id itself; for
  // an alias (Haiku 4.5) it is the dated snapshot the alias points at. The registry still calls the alias; a
  // test keeps this column honest.
  pinnedId: string;
  // Whether the model takes a hidden-reasoning setting at all (all three do: Sonnet 5 and 5.5 adaptively,
  // Haiku 4.5 with a manual budget). `thinking` above says how it is controlled.
  supportsReasoning: boolean;
  // Whether the provider accepts a JSON-schema output request for this model (output_config.format).
  supportsStructuredOutput: boolean;
};

export const MODEL_FACTS: Record<string, ModelFacts> = {
  'claude-sonnet-5': { maxOutputTokens: 128_000, thinking: 'adaptive-disableable', streamingAboveTokens: 21_333, pinnedId: 'claude-sonnet-5', supportsReasoning: true, supportsStructuredOutput: true },
  // `claude-haiku-4-5` is an alias of the pinned snapshot `claude-haiku-4-5-20251001`.
  'claude-haiku-4-5': { maxOutputTokens: 64_000, thinking: 'extended', streamingAboveTokens: 21_333, pinnedId: 'claude-haiku-4-5-20251001', supportsReasoning: true, supportsStructuredOutput: true },
  // Not used by any purpose on this branch (Sprint 5 Task 6 round 3 and Task 8 R9 move purposes to it). Listed so
  // that move finds its thinking rule here instead of a 400 from the provider.
  'claude-sonnet-5-5': { maxOutputTokens: 128_000, thinking: 'adaptive-between-tools', streamingAboveTokens: 21_333, pinnedId: 'claude-sonnet-5-5', supportsReasoning: true, supportsStructuredOutput: true },
};

export function resolveModelFacts(model: string): ModelFacts {
  const facts = MODEL_FACTS[model];
  if (!facts) {
    throw new Error(`No model facts for model '${model}' - add one to llm/models.ts's MODEL_FACTS.`);
  }
  return facts;
}
