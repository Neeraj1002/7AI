import { prisma } from '../prisma-client';
import type { Prisma, PerformanceSnapshot as PrismaPerformanceSnapshot } from '@prisma/client';
import type { CreatePerformanceSnapshotInput, PerformanceSnapshot } from '../../types';

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
export async function listCompletedRunsWithPublishedVideo(): Promise<
  { pipelineRunId: string; tenantId: string; channelId: string; youtubeVideoId: string }[]
> {
  const stages = await prisma.pipelineStage.findMany({
    where: {
      stageName: 'publishing',
      status: 'completed',
      pipelineRun: { status: 'completed' },
    },
    orderBy: { attemptNumber: 'desc' },
    include: { pipelineRun: { select: { tenantId: true, channelId: true } } },
  });

  // A run may have multiple publishing rows only in pathological cases (it
  // shouldn't, given the resume-safety checkpoint) — de-dupe by run id,
  // keeping the highest attemptNumber (already the query's sort order).
  const seen = new Set<string>();
  const results: { pipelineRunId: string; tenantId: string; channelId: string; youtubeVideoId: string }[] = [];
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
    });
  }
  return results;
}
