// One row per agent invocation — written from day one per Design Principle 7.
// See docs/execution/week2/SCHEMA.md Section 2 (original LLM-shaped fields)
// and docs/execution/week3/SCHEMA.md (the media-shaped-call extension).
export type UsageEvent = {
  id: string;
  tenantId: string;
  channelId: string;
  pipelineRunId: string | null;
  stageId: string | null;

  agent: string; // e.g. 'script-generation', matches the LLM layer's Purpose where applicable
  provider: string; // e.g. 'anthropic', from the LLM layer's registry resolution
  model: string; // e.g. 'claude-sonnet-5'

  inputTokens: number | null; // LLM-shaped calls only
  outputTokens: number | null; // LLM-shaped calls only
  characterCount: number | null; // TTS-shaped calls only (billed per character)
  audioDurationSeconds: string | null; // NUMERIC as string — transcription-shaped calls only
  costUsd: string; // NUMERIC as string — the one universal field every row has
  metadata: Record<string, unknown> | null; // e.g. { ttsCharacters, transcriptionSeconds, ffmpegCostUsd: 0 }

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
  inputTokens?: number;
  outputTokens?: number;
  characterCount?: number;
  audioDurationSeconds?: string;
  costUsd: string;
  metadata?: Record<string, unknown>;
};
