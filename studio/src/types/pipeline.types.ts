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

// Sprint 2 Task 1 (D2) — explicit, structured creation choices a user picks
// when submitting a brief, kept deliberately separate from intakeParsed
// (which is what parse-brief.ts's LLM call *infers* from free-text prose).
// This task only ever sets `voice`; `visualSource`/`audioLayer` exist here
// now so Sprint 2 Task 2/3 extend this one object instead of adding
// parallel PipelineRun columns each time.
export const CreationOptionsSchema = z.object({
  voice: z.string().optional(),
  visualSource: z.string().optional(),
  audioLayer: z.string().optional(),
  // Sprint 3 Task 9 (R4) — a target narration length in seconds; additive,
  // never a behavior change for a run that doesn't set it (script-generation
  // falls back to its existing "30-60 seconds" framing when unset).
  targetDurationSec: z.union([z.literal(30), z.literal(45), z.literal(60)]).optional(),
  // Sprint 4 Task 2 (R5): explicit source URLs/citations the brief relies on.
  // Shown at Gate 1; never inferred from the free-text brief.
  sources: z.array(z.string()).optional(),
});
export type CreationOptions = z.infer<typeof CreationOptionsSchema>;

export type PipelineRun = {
  id: string;
  tenantId: string;
  channelId: string;

  status: PipelineRunStatus;
  currentStage: StageName | null;

  briefText: string;
  intakeParsed: IntakeParsed | null;
  creationOptions: CreationOptions | null;

  // Sprint 4 Task 1: snapshot of the channel active profile version at run
  // creation. null = the channel had no profile.
  profileVersionId: string | null;

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
  creationOptions: CreationOptionsSchema.optional(),
});
export type CreatePipelineRunInput = z.infer<typeof CreatePipelineRunInputSchema>;
