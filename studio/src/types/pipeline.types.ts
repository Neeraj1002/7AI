import { z } from 'zod';

// Single source of truth for the stage-name/status enums. The CHECK constraints in
// studio/src/models/migrations/*/migration.sql encode the same value lists — kept in sync
// by hand, per SCHEMA.md's "Enum Strategy" section.

export const STAGE_NAMES = [
  'intake',
  'script_generation',
  'script_review',
  'gate1',
  'video_generation',
  'video_review',
  'gate2',
  'publishing',
  'analytics',
] as const;
export type StageName = (typeof STAGE_NAMES)[number];

export const STAGE_STATUSES = ['pending', 'running', 'completed', 'failed', 'skipped'] as const;
export type StageStatus = (typeof STAGE_STATUSES)[number];

export const PIPELINE_RUN_STATUSES = [
  'pending',
  'running',
  'paused_gate1',
  'paused_gate2',
  'completed',
  'failed',
  'needs_attention',
] as const;
export type PipelineRunStatus = (typeof PIPELINE_RUN_STATUSES)[number];

export type PipelineRun = {
  id: string;
  tenantId: string;
  channelId: string;

  status: PipelineRunStatus;
  currentStage: StageName | null;

  briefText: string;
  intakeParsed: IntakeParsed | null;

  retryCount: number;
  lastError: string | null;

  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PipelineStage = {
  id: string;
  pipelineRunId: string;
  stageName: StageName;
  status: StageStatus;
  attemptNumber: number;

  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;

  startedAt: Date | null;
  completedAt: Date | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
};

// --- Intake stage payload shapes (BUSINESS_LOGIC.md Section 2) ---

export const IntakeInputSchema = z.object({
  briefText: z.string().min(1),
});
export type IntakeInput = z.infer<typeof IntakeInputSchema>;

export const IntakeParsedSchema = z.object({
  topic: z.string().min(1),
  constraints: z.array(z.string()),
});
export type IntakeParsed = z.infer<typeof IntakeParsedSchema>;

export const CreatePipelineRunInputSchema = z.object({
  tenantId: z.string().uuid(),
  channelId: z.string().uuid(),
  briefText: z.string().min(1),
});
export type CreatePipelineRunInput = z.infer<typeof CreatePipelineRunInputSchema>;
