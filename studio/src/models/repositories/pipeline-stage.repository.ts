import { prisma } from '../prisma-client';
import type { Prisma, PipelineStage as PrismaPipelineStage } from '@prisma/client';
import type { PipelineStage, StageName, StageStatus } from '../../types';

// Accepts either the singleton client or an interactive-transaction client
// (`prisma.$transaction(async (tx) => ...)`) — B1's fix for the
// completeStage/currentStage write race (KNOWN_ISSUES_AND_BLOCKERS.md §2):
// call sites that need a stage-completion write and the PipelineRun advance
// to commit atomically pass `tx`; everything else keeps using the singleton
// via the default parameter, unchanged.
export type DbClient = Prisma.TransactionClient | typeof prisma;

function toDomainStage(row: PrismaPipelineStage): PipelineStage {
  return {
    id: row.id,
    pipelineRunId: row.pipelineRunId,
    stageName: row.stageName as StageName,
    status: row.status as StageStatus,
    attemptNumber: row.attemptNumber,
    input: (row.input as Record<string, unknown> | null) ?? null,
    output: (row.output as Record<string, unknown> | null) ?? null,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    error: row.error,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// The row most recently created for this run, across all stage names — this is
// what resume-on-startup.ts reads to find where a crashed run left off
// (BUSINESS_LOGIC.md Section 1, "idempotent resume").
export async function findLatestStageForRun(pipelineRunId: string): Promise<PipelineStage | null> {
  const row = await prisma.pipelineStage.findFirst({
    where: { pipelineRunId },
    orderBy: [{ createdAt: 'desc' }],
  });
  return row ? toDomainStage(row) : null;
}

// Full stage history for a run (every attempt, every stage name) — backs the
// API's run-detail endpoint (frontend track Task 1), which needs the whole
// timeline, not just the latest attempt per stage the way the state machine
// itself does.
export async function listStagesForRun(pipelineRunId: string): Promise<PipelineStage[]> {
  const rows = await prisma.pipelineStage.findMany({
    where: { pipelineRunId },
    orderBy: [{ createdAt: 'asc' }],
  });
  return rows.map(toDomainStage);
}

export async function findLatestAttempt(
  pipelineRunId: string,
  stageName: StageName,
): Promise<PipelineStage | null> {
  const row = await prisma.pipelineStage.findFirst({
    where: { pipelineRunId, stageName },
    orderBy: { attemptNumber: 'desc' },
  });
  return row ? toDomainStage(row) : null;
}

export async function createStageAttempt(params: {
  pipelineRunId: string;
  stageName: StageName;
  attemptNumber: number;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
}): Promise<PipelineStage> {
  const row = await prisma.pipelineStage.create({
    data: {
      pipelineRunId: params.pipelineRunId,
      stageName: params.stageName,
      attemptNumber: params.attemptNumber,
      input: params.input as Prisma.InputJsonValue,
      ...(params.output ? { output: params.output as Prisma.InputJsonValue } : {}),
      status: 'running',
      startedAt: new Date(),
    },
  });
  return toDomainStage(row);
}

export async function completeStage(
  id: string,
  output: Record<string, unknown>,
  client: DbClient = prisma,
): Promise<PipelineStage> {
  const row = await client.pipelineStage.update({
    where: { id },
    data: { status: 'completed', output: output as Prisma.InputJsonValue, completedAt: new Date() },
  });
  return toDomainStage(row);
}

// Overwrites a still-`running` stage's `output` without marking it complete —
// a durable mid-attempt checkpoint. Week 4 Task 2's publishing stage is the
// first stage with a real, non-repeatable external side effect (a YouTube
// upload): if the process crashes between a successful upload and the
// stage's normal completion, resume-on-startup.ts would otherwise re-run the
// whole stage and upload a second time. Checkpointing the youtubeVideoId here
// as soon as the upload call returns lets a resumed run detect "this already
// happened" and skip straight to completion instead of re-uploading.
export async function recordStageProgress(
  id: string,
  partialOutput: Record<string, unknown>,
): Promise<PipelineStage> {
  const row = await prisma.pipelineStage.update({
    where: { id },
    data: { output: partialOutput as Prisma.InputJsonValue },
  });
  return toDomainStage(row);
}

// Sprint 3 Task 12 (R2) — merges new fields into a stage's `output` JSON
// after it's already `completed` (confirmed by reading this whole file
// first: nothing existing does this — `recordStageProgress` above
// overwrites `output` wholesale, and only while the stage is still
// `running`). Read-merge-write, same reasoning as
// `channel.repository.ts`'s `updateChannelBrandAssets`/
// `updateChannelApprovalGateConfig` — a naive replace would silently erase
// whatever the stage's own real output already held (e.g. `videoPath`,
// `plan`). Used by the drafts/final R2-upload best-effort steps to attach
// `r2DraftKey`/`r2FinalKey` etc. without touching anything else already
// there.
export async function patchStageOutput(
  id: string,
  partial: Record<string, unknown>,
): Promise<PipelineStage> {
  const current = await prisma.pipelineStage.findUniqueOrThrow({ where: { id }, select: { output: true } });
  const merged = { ...((current.output ?? {}) as Record<string, unknown>), ...partial };
  const row = await prisma.pipelineStage.update({
    where: { id },
    data: { output: merged as Prisma.InputJsonValue },
  });
  return toDomainStage(row);
}

export async function failStage(
  id: string,
  error: string,
  client: DbClient = prisma,
  // Bugs Task 11 (R1) — optional diagnostic payload for the failures that
  // have one (the raw reply of an unparseable script). Omitted for every
  // other failure. Durable progress is retained and an old recovery marker is cleared.
  output?: Record<string, unknown>,
): Promise<PipelineStage> {
  // A running stage can have durable progress (long-form plan/progress) before
  // it fails. Failure diagnostics are additive; replacing output here would
  // erase the very checkpoints an eligible resume needs.
  const current = await client.pipelineStage.findUnique({ where: { id }, select: { output: true } });
  const row = await client.pipelineStage.update({
    where: { id },
    data: {
      status: 'failed',
      error,
      completedAt: new Date(),
      ...((output || current?.output) ? { output: { ...((current?.output ?? {}) as Record<string, unknown>), recovery: null, ...output } as Prisma.InputJsonValue } : {}),
    },
  });
  return toDomainStage(row);
}

// Records that a stage attempt was never run (e.g. the budget gate refused it,
// Week 2 Task 4) — distinct from `failed`, which means an attempt started and
// errored. `input`/`error` capture what would have run and why it didn't.
export async function createSkippedStageAttempt(params: {
  pipelineRunId: string;
  stageName: StageName;
  attemptNumber: number;
  input: Record<string, unknown>;
  reason: string;
}): Promise<PipelineStage> {
  const row = await prisma.pipelineStage.create({
    data: {
      pipelineRunId: params.pipelineRunId,
      stageName: params.stageName,
      attemptNumber: params.attemptNumber,
      input: params.input as Prisma.InputJsonValue,
      status: 'skipped',
      error: params.reason,
      completedAt: new Date(),
    },
  });
  return toDomainStage(row);
}

// Bugs Task 10 (R1) — the newest attempt that actually produced output.
// findLatestAttempt can land on a budget-skipped row, which has none.
export async function findLatestCompletedAttempt(
  pipelineRunId: string,
  stageName: StageName,
): Promise<PipelineStage | null> {
  const row = await prisma.pipelineStage.findFirst({
    where: { pipelineRunId, stageName, status: 'completed' },
    orderBy: { attemptNumber: 'desc' },
  });
  return row ? toDomainStage(row) : null;
}

// Sprint 5 Task 8 (R7): the measured narration pace (words per minute) of the latest finished long video
// this tenant narrated with `voice`, or null. Read from the video_generation attempt that recorded it
// (input.resolvedVoice, output.measuredWordsPerMinute); no new storage.
export async function findLatestMeasuredPace(tenantId: string, voice: string): Promise<number | null> {
  const rows = await prisma.pipelineStage.findMany({
    where: {
      stageName: 'video_generation',
      status: 'completed',
      input: { path: ['resolvedVoice'], equals: voice },
      pipelineRun: { tenantId },
    },
    orderBy: { completedAt: 'desc' },
    take: 5,
    select: { output: true },
  });
  for (const row of rows) {
    const pace = (row.output as { measuredWordsPerMinute?: unknown } | null)?.measuredWordsPerMinute;
    if (typeof pace === 'number' && Number.isFinite(pace)) return pace;
  }
  return null;
}

// Sprint 5 Task 8 (R11.2): an attempt row left 'running' after a restart or crash stays 'running' forever, which
// the Run screen then shows as work in progress (run 9ab4fbe5). These close such rows as failed, keeping their
// output. Publishing rows are left alone: publishing has its own receipt-based reconciliation.
const NEVER_RECONCILED: StageName[] = ['publishing'];

// Closes the 'running' attempts of one run. `except` names stages to leave (a gate waiting for its answer).
export async function failInterruptedStages(pipelineRunId: string, message: string, except: StageName[] = []): Promise<number> {
  const result = await prisma.pipelineStage.updateMany({
    where: { pipelineRunId, status: 'running', stageName: { notIn: [...NEVER_RECONCILED, ...except] } },
    data: { status: 'failed', error: message, completedAt: new Date() },
  });
  return result.count;
}

// Startup sweep: 'running' attempts of runs that are no longer running (parked, failed, cancelled, done).
// A run waiting at a gate is skipped, since its 'running' gate row is the open gate.
export async function failOrphanedRunningStages(): Promise<number> {
  const rows = await prisma.pipelineStage.findMany({
    where: {
      status: 'running',
      stageName: { notIn: NEVER_RECONCILED },
      pipelineRun: { status: { in: ['needs_attention', 'failed', 'completed'] } },
    },
    select: { id: true, pipelineRun: { select: { lastError: true } } },
  });
  let closed = 0;
  for (const row of rows) {
    const cancelled = row.pipelineRun.lastError === 'Cancelled by user';
    const result = await prisma.pipelineStage.updateMany({
      where: { id: row.id, status: 'running' },
      data: {
        status: 'failed',
        error: cancelled ? 'Cancelled by user' : 'Interrupted: the server restarted or stopped while this attempt was running',
        completedAt: new Date(),
      },
    });
    closed += result.count;
  }
  return closed;
}
