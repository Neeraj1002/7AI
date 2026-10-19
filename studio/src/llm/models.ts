// What the client must know about each model it can call: the output ceiling,
// how the model's hidden reasoning is controlled, and when a request has to
// stream. Read from Anthropic's model and thinking documentation on
// 2026-10-19, never from memory:
//   https://platform.claude.com/docs/en/models/overview
//   https://platform.claude.com/docs/en/models/sonnet-5/overview
//   https://platform.claude.com/docs/en/models/haiku-4-5/overview
//   https://platform.claude.com/docs/en/build-with-claude/thinking
// Part B of the LLM Registry task (R7) extends this table (pinned ids,
// structured-output support); Part A needs only these fields.

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
};

export const MODEL_FACTS: Record<string, ModelFacts> = {
  'claude-sonnet-5': { maxOutputTokens: 128_000, thinking: 'adaptive-disableable', streamingAboveTokens: 21_333 },
  // `claude-haiku-4-5` is an alias of the pinned snapshot `claude-haiku-4-5-20251001`.
  'claude-haiku-4-5': { maxOutputTokens: 64_000, thinking: 'extended', streamingAboveTokens: 21_333 },
  // Not used by any purpose on this branch (Sprint 5 Task 6 round 3 and Task 8 R9 move purposes to it). Listed so
  // that move finds its thinking rule here instead of a 400 from the provider.
  'claude-sonnet-5-5': { maxOutputTokens: 128_000, thinking: 'adaptive-between-tools', streamingAboveTokens: 21_333 },
};

export function resolveModelFacts(model: string): ModelFacts {
  const facts = MODEL_FACTS[model];
  if (!facts) {
    throw new Error(`No model facts for model '${model}' - add one to llm/models.ts's MODEL_FACTS.`);
  }
  return facts;
}
