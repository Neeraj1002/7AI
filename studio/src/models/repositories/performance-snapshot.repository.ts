import { prisma } from '../prisma-client';
import type { Prisma, PerformanceSnapshot as PrismaPerformanceSnapshot } from '@prisma/client';
import type { CreatePerformanceSnapshotInput, LongFormMetrics, PerformanceSnapshot, RetentionCurvePoint } from '../../types';

function toDomainSnapshot(row: PrismaPerformanceSnapshot): PerformanceSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    channelId: row.channelId,
    pipelineRunId: row.pipelineRunId,
    youtubeVideoId: row.youtubeVideoId,
    views: Number(row.views),
    likes: Number(row.likes),
    comments: Number(row.comments),
    watchTimeMinutes: row.watchTimeMinutes ? row.watchTimeMinutes.toString() : null,
    retentionPct: row.retentionPct ? row.retentionPct.toString() : null,
    retentionCurve: (row.retentionCurve as RetentionCurvePoint[] | null) ?? null,
    longFormMetrics: (row.longFormMetrics as LongFormMetrics | null) ?? null,
    snapshotAt: row.snapshotAt,
    createdAt: row.createdAt,
  };
}

export async function insertPerformanceSnapshot(
  input: CreatePerformanceSnapshotInput,
): Promise<PerformanceSnapshot> {
  const row = await prisma.performanceSnapshot.create({
    data: {
      tenantId: input.tenantId,
      channelId: input.channelId,
      pipelineRunId: input.pipelineRunId,
      youtubeVideoId: input.youtubeVideoId,
      views: input.views,
      likes: input.likes,
      comments: input.comments,
      watchTimeMinutes: input.watchTimeMinutes as Prisma.Decimal.Value | undefined,
      retentionPct: input.retentionPct as Prisma.Decimal.Value | undefined,
      retentionCurve: input.retentionCurve as Prisma.InputJsonValue | undefined,
      longFormMetrics: input.longFormMetrics as Prisma.InputJsonValue | undefined,
      snapshotAt: input.snapshotAt,
    },
  });
  return toDomainSnapshot(row);
}

export async function findLatestSnapshotForRun(pipelineRunId: string): Promise<PerformanceSnapshot | null> {
  const row = await prisma.performanceSnapshot.findFirst({
    where: { pipelineRunId },
    orderBy: { snapshotAt: 'desc' },
  });
  return row ? toDomainSnapshot(row) : null;
}

// Backs the periodic poller (Section 8.3 "batch over real-time") — every
// PipelineRun that has actually published a video, independent of any single
// run's own state machine (a run stays `completed` forever; polling keeps
// accumulating snapshots against it on its own schedule).
export type PublishedVideoTarget = {
  pipelineRunId: string;
  tenantId: string;
  channelId: string;
  youtubeVideoId: string;
  publishedAt: Date | null;
  // Sprint 4 Task 10 (R6): from the run's creationOptions; a run without it is a Short.
  videoKind: 'short' | 'long';
};

// Bugs Task 12 (R10.7) - newest snapshot per run, so the poll can stop after its final snapshot.
export async function latestSnapshotAtByRun(runIds: string[]): Promise<Map<string, Date>> {
  if (runIds.length === 0) return new Map();
  const rows = await prisma.performanceSnapshot.groupBy({
    by: ['pipelineRunId'],
    where: { pipelineRunId: { in: runIds } },
    _max: { snapshotAt: true },
  });
  const out = new Map<string, Date>();
  for (const r of rows) if (r._max.snapshotAt) out.set(r.pipelineRunId, r._max.snapshotAt);
  return out;
}

export async function listCompletedRunsWithPublishedVideo(): Promise<PublishedVideoTarget[]> {
  const stages = await prisma.pipelineStage.findMany({
    where: {
      stageName: 'publishing',
      status: 'completed',
      // Sprint 3 Task 8 (R3.10) — an archived channel has had its credential
      // deleted, so polling its videos could only ever log "no connected
      // YouTube account" on every tick, forever. Existing snapshots stay
      // readable; this only stops new polling.
      pipelineRun: { status: 'completed', channel: { isActive: true } },
    },
    orderBy: { attemptNumber: 'desc' },
    include: { pipelineRun: { select: { tenantId: true, channelId: true, creationOptions: true } } },
  });

  // A run may have multiple publishing rows only in pathological cases (it
  // shouldn't, given the resume-safety checkpoint) — de-dupe by run id,
  // keeping the highest attemptNumber (already the query's sort order).
  const seen = new Set<string>();
  const results: PublishedVideoTarget[] = [];
  for (const stage of stages) {
    if (seen.has(stage.pipelineRunId)) continue;
    seen.add(stage.pipelineRunId);
    const output = stage.output as { youtubeVideoId?: string } | null;
    if (!output?.youtubeVideoId) continue;
    results.push({
      pipelineRunId: stage.pipelineRunId,
      tenantId: stage.pipelineRun.tenantId,
      channelId: stage.pipelineRun.channelId,
      youtubeVideoId: output.youtubeVideoId,
      publishedAt: stage.completedAt ?? null,
      videoKind: (stage.pipelineRun.creationOptions as { videoKind?: string } | null)?.videoKind === 'long' ? 'long' : 'short',
    });
  }
  return results;
}
