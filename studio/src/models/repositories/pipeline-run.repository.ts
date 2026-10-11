import { prisma } from '../prisma-client';
import { Prisma } from '@prisma/client';
import { markNotificationsResolvedByThreadKey } from './notification.repository';
import type { PipelineRun as PrismaPipelineRun } from '@prisma/client';
import type { DbClient } from './pipeline-stage.repository';
import type {
  CreatePipelineRunInput,
  CreationOptions,
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
    creationOptions: (row.creationOptions as CreationOptions | null) ?? null,
    profileVersionId: row.profileVersionId,
    retryCount: row.retryCount,
    lastError: row.lastError,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function createPipelineRun(
  input: CreatePipelineRunInput,
  profileVersionId: string | null = null,
): Promise<PipelineRun> {
  const row = await prisma.pipelineRun.create({
    data: {
      tenantId: input.tenantId,
      channelId: input.channelId,
      briefText: input.briefText,
      creationOptions: input.creationOptions as Prisma.InputJsonValue | undefined,
      profileVersionId,
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

// Backs the API's GET /runs (frontend track Task 1) and the Queue screen
// (Task 2), which both need multi-status filtering (e.g. "any of
// paused_gate1/paused_gate2/needs_attention") — listRunsByStatus above only
// takes one status, kept as-is since resume-on-startup.ts already depends on
// its exact signature.
//
// Bugs Task 3 (R1) — tenantId is optional here, not required, deliberately:
// gate-reminder.ts's background cron legitimately scans pending runs across
// every tenant (it's a system job, not a client session, and each run's own
// notification recipients are still resolved per-channel/tenant downstream).
// The actual leak this task closes is the *client-facing* caller —
// runs.ts's `list` tRPC procedure — which must always pass ctx.tenantId.
// Any new caller reachable from a signed-in session must do the same; only
// a trusted internal/system caller may omit it.
export async function listRuns(params: {
  tenantId?: string;
  statuses?: PipelineRunStatus[];
  stage?: StageName;
  channelId?: string;
}): Promise<PipelineRun[]> {
  const rows = await prisma.pipelineRun.findMany({
    where: {
      ...(params.tenantId && { tenantId: params.tenantId }),
      ...(params.statuses && params.statuses.length > 0 && { status: { in: params.statuses } }),
      ...(params.stage && { currentStage: params.stage }),
      ...(params.channelId && { channelId: params.channelId }),
    },
    orderBy: { updatedAt: 'desc' },
  });
  return rows.map(toDomainRun);
}

// Sprint 4 Task 5 (R20): the channel's most recent runs that got as far as an
// Intake topic, newest first, excluding the current run. Failed and pending runs
// are skipped (nothing was really made), everything else counts.
export async function listRecentRunTopicsForChannel(
  channelId: string,
  limit: number,
  excludeRunId: string,
): Promise<{ runId: string; topic: string; createdAt: Date }[]> {
  const rows = await prisma.pipelineRun.findMany({
    where: {
      channelId,
      id: { not: excludeRunId },
      status: { notIn: ['failed', 'pending'] },
      intakeParsed: { not: Prisma.DbNull },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { id: true, intakeParsed: true, createdAt: true },
  });
  return rows.flatMap((row) => {
    const topic = (row.intakeParsed as { topic?: unknown } | null)?.topic;
    return typeof topic === 'string' && topic.length > 0 ? [{ runId: row.id, topic, createdAt: row.createdAt }] : [];
  });
}

// The exact text runs.cancel writes; runs.ts's deriveEndReason string-matches it.
export const CANCELLED_BY_USER = 'Cancelled by user';

export type PipelineRunPatch = Partial<{
  status: PipelineRunStatus;
  currentStage: StageName | null;
  intakeParsed: IntakeParsed | null;
  retryCount: number;
  lastError: string | null;
  startedAt: Date;
  completedAt: Date;
  // Bugs Task 12 - shallow-merged into the stored creationOptions (never replaces user picks).
  creationOptionsMerge: Partial<CreationOptions>;
}>;

export async function updatePipelineRun(
  id: string,
  patch: PipelineRunPatch,
  client: DbClient = prisma,
): Promise<PipelineRun> {
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
  if (patch.creationOptionsMerge) {
    const current = await client.pipelineRun.findUnique({ where: { id }, select: { creationOptions: true } });
    data.creationOptions = {
      ...((current?.creationOptions as Record<string, unknown> | null) ?? {}),
      ...patch.creationOptionsMerge,
    } as Prisma.InputJsonValue;
  }
  // Bugs Task 10 (R1) — a cancelled run is final: a stage that was mid-flight
  // when the cancel landed must not resurrect it (a status/currentStage write
  // after its own long await). The cancel's own write passes, so re-cancelling
  // is idempotent; every other write to a cancelled run is dropped and the
  // stored (cancelled) row is returned instead.
  try {
    const row = await client.pipelineRun.update({
      where: {
        id,
        ...(patch.lastError !== CANCELLED_BY_USER && {
          NOT: { status: 'failed', lastError: CANCELLED_BY_USER },
        }),
      },
      data,
    });
    // Bugs Task 12 (R5f) - an ended run closes its open Inbox cards (a cancelled run's Gate 2 card
    // used to stay under "needs action"). Fire-and-forget: never blocks or fails the run write.
    if (patch.status === 'failed' || patch.status === 'completed') {
      void markNotificationsResolvedByThreadKey(id, new Date()).catch((error) => {
        console.error(`[pipeline-run] could not resolve notifications for ended run ${id}:`, error);
      });
    }
    return toDomainRun(row);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      const existing = await client.pipelineRun.findUnique({ where: { id } });
      if (existing) return toDomainRun(existing);
    }
    throw error;
  }
}
