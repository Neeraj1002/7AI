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
  // Sprint 4 Task 9 (R1): a Short is 30/45/60; a long-form video is whole minutes, 120..900.
  // Validated at the API edge (formats/video-kind.ts); stored as the resolved value.
  targetDurationSec: z.number().int().positive().optional(),
  // Sprint 4 Task 9 (R1): 'long' is stored only for a long-form run; absent means 'short'.
  videoKind: z.enum(['short', 'long']).optional(),
  // Sprint 4 Task 9 (R7): per-video spend limit in USD, long-form only. Checked in PR B.
  maxCostUsd: z.number().positive().optional(),
  // Sprint 4 Task 2 (R5): explicit source URLs/citations the brief relies on.
  // Shown at Gate 1; never inferred from the free-text brief.
  sources: z.array(z.string()).optional(),
  // Sprint 4 Task 6: a key from formats/manifest.ts. Validated at the API edge.
  formatKey: z.string().optional(),
  // Bugs Task 12 - run-owned bookkeeping, NOT user choices (stripped by runs.rerun):
  // manual Retry/Revise count per stage (R2) and the one-shot AI-stills fallback marker (R1).
  manualRetries: z.record(z.string(), z.number().int().nonnegative()).optional(),
  plannerContractRecoveryUsed: z.boolean().optional(),
  videoFallbackUsed: z.boolean().optional(),
  // Sprint 5 Task 8 (R2/R8) - run-owned bookkeeping, stripped by runs.rerun: the clean-attempt estimate
  // and the automatic-retry spend allowance (D1) set when the run was created, and the preflight
  // check that last stopped the run before any spend (null once it passes).
  // Sprint 5 Task 8 (R13): the per-run YouTube visibility (publishing reads it before Gate 2's choice, and Gate 2
  // writes its own choice back here), and the history of runs.updateSettings changes. No migration: JSON options.
  privacyStatus: z.enum(['private', 'unlisted', 'public']).optional(),
  settingsChanges: z
    .array(
      z.object({
        at: z.string(),
        by: z.object({ userId: z.string().nullable(), name: z.string().nullable() }),
        changes: z.array(z.object({ label: z.string(), from: z.string(), to: z.string() })),
      }),
    )
    .optional(),
  estimateUsd: z.number().nonnegative().optional(),
  retryAllowanceUsd: z.number().nonnegative().optional(),
  preflightBlock: z
    .object({
      stage: z.string(),
      at: z.string(),
      issues: z.array(z.object({ check: z.string(), setting: z.string(), message: z.string() })),
    })
    .nullable()
    .optional(),
  // Sprint 4 Task 12 (R1): the settings the run really used and where each came from, written once
  // when the run is created. Absent on older runs. Read-only; runs.rerun recomputes it.
  resolvedOptions: z
    .object({
      voice: z.object({ key: z.string(), label: z.string(), from: z.string() }),
      visualSource: z.object({ value: z.string(), label: z.string(), from: z.string() }),
      music: z.object({ label: z.string(), from: z.string() }),
      targetSeconds: z.object({ value: z.number(), from: z.string() }),
      videoKind: z.enum(['short', 'long']),
      formatKey: z.string().nullable(),
    })
    .optional(),
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
