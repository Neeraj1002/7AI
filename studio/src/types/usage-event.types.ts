// One row per agent invocation — written from day one per Design Principle 7.
// See docs/execution/week2/SCHEMA.md Section 2.
export type UsageEvent = {
  id: string;
  tenantId: string;
  channelId: string;
  pipelineRunId: string | null;
  stageId: string | null;

  agent: string; // e.g. 'script-generation', matches the LLM layer's Purpose where applicable
  provider: string; // e.g. 'anthropic', from the LLM layer's registry resolution
  model: string; // e.g. 'claude-sonnet-5'

  inputTokens: number;
  outputTokens: number;
  costUsd: string; // NUMERIC as string

  createdAt: Date;
};

export type CreateUsageEventInput = {
  tenantId: string;
  channelId: string;
  pipelineRunId?: string;
  stageId?: string;
  agent: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: string;
};
