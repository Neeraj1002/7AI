import { prisma } from '../prisma-client';
import { Prisma } from '@prisma/client';
import type { PipelineRun as PrismaPipelineRun } from '@prisma/client';
import type {
  CreatePipelineRunInput,
  IntakeParsed,
  PipelineRun,
  PipelineRunStatus,
  StageName,
} from '../../types';

function toDomainRun(row: PrismaPipelineRun): PipelineRun {
  return {
    id: row.id,
    tenantId: row.tenantId,
    channelId: row.channelId,
    status: row.status as PipelineRunStatus,
    currentStage: (row.currentStage as StageName | null) ?? null,
    briefText: row.briefText,
    intakeParsed: (row.intakeParsed as IntakeParsed | null) ?? null,
    retryCount: row.retryCount,
    lastError: row.lastError,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function createPipelineRun(input: CreatePipelineRunInput): Promise<PipelineRun> {
  const row = await prisma.pipelineRun.create({
    data: {
      tenantId: input.tenantId,
      channelId: input.channelId,
      briefText: input.briefText,
      status: 'pending',
    },
  });
  return toDomainRun(row);
}

export async function findPipelineRunById(id: string): Promise<PipelineRun | null> {
  const row = await prisma.pipelineRun.findUnique({ where: { id } });
  return row ? toDomainRun(row) : null;
}

export async function listRunsByStatus(status: PipelineRunStatus): Promise<PipelineRun[]> {
  const rows = await prisma.pipelineRun.findMany({ where: { status } });
  return rows.map(toDomainRun);
}

export type PipelineRunPatch = Partial<{
  status: PipelineRunStatus;
  currentStage: StageName | null;
  intakeParsed: IntakeParsed | null;
  retryCount: number;
  lastError: string | null;
  startedAt: Date;
  completedAt: Date;
}>;

export async function updatePipelineRun(id: string, patch: PipelineRunPatch): Promise<PipelineRun> {
  const data: Prisma.PipelineRunUpdateInput = {
    ...(patch.status !== undefined && { status: patch.status }),
    ...(patch.currentStage !== undefined && { currentStage: patch.currentStage }),
    ...(patch.intakeParsed !== undefined && {
      intakeParsed:
        patch.intakeParsed === null ? Prisma.JsonNull : (patch.intakeParsed as Prisma.InputJsonValue),
    }),
    ...(patch.retryCount !== undefined && { retryCount: patch.retryCount }),
    ...(patch.lastError !== undefined && { lastError: patch.lastError }),
    ...(patch.startedAt !== undefined && { startedAt: patch.startedAt }),
    ...(patch.completedAt !== undefined && { completedAt: patch.completedAt }),
  };
  const row = await prisma.pipelineRun.update({ where: { id }, data });
  return toDomainRun(row);
}
