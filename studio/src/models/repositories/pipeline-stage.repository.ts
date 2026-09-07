import { prisma } from '../prisma-client';
import type { Prisma, PipelineStage as PrismaPipelineStage } from '@prisma/client';
import type { PipelineStage, StageName, StageStatus } from '../../types';

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
}): Promise<PipelineStage> {
  const row = await prisma.pipelineStage.create({
    data: {
      pipelineRunId: params.pipelineRunId,
      stageName: params.stageName,
      attemptNumber: params.attemptNumber,
      input: params.input as Prisma.InputJsonValue,
      status: 'running',
      startedAt: new Date(),
    },
  });
  return toDomainStage(row);
}

export async function completeStage(
  id: string,
  output: Record<string, unknown>,
): Promise<PipelineStage> {
  const row = await prisma.pipelineStage.update({
    where: { id },
    data: { status: 'completed', output: output as Prisma.InputJsonValue, completedAt: new Date() },
  });
  return toDomainStage(row);
}

export async function failStage(id: string, error: string): Promise<PipelineStage> {
  const row = await prisma.pipelineStage.update({
    where: { id },
    data: { status: 'failed', error, completedAt: new Date() },
  });
  return toDomainStage(row);
}
