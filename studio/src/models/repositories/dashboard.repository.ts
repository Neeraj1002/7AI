import { prisma } from '../prisma-client';
import { Prisma } from '@prisma/client';
import { MVP_TENANT_ID } from '../../types';
import type {
  ContentPerformanceDashboard,
  CostDashboard,
  OperationalDashboard,
  QualityDashboard,
} from '../../types';

// Frontend track Task 1 (Tasks 1-3) — the four /dashboard/* aggregate
// queries (BUSINESS_LOGIC.md Section 3). Single-tenant for now
// (MVP_TENANT_ID), same assumption every other repository in this codebase
// makes. Kept in its own file rather than spread across the per-model
// repositories since these queries genuinely span
// PipelineRun/PipelineStage/UsageEvent/ReviewLog and don't belong to any one
// of them.
//
// `channelId` (optional on every function, added in Task 3): every screen in
// the app is channel-scoped per MOBILE_APP_DESIGN.md Section 4's explicit
// instruction, including the Dashboard — omitted (undefined) means "all
// channels for this tenant," matching today's single-channel reality without
// requiring the caller to know the one channel's id.

function channelFilterSql(channelId: string | undefined, column: Prisma.Sql): Prisma.Sql {
  return channelId ? Prisma.sql`AND ${column} = ${channelId}::uuid` : Prisma.empty;
}

export async function getOperationalDashboard(channelId?: string): Promise<OperationalDashboard> {
  const channelWhere = channelId ? { channelId } : {};
  const [funnelRows, needsAttentionRows, recentCompletedRows, completedCount, failedCount] =
    await Promise.all([
      prisma.pipelineRun.groupBy({
        by: ['currentStage'],
        where: { tenantId: MVP_TENANT_ID, ...channelWhere },
        _count: { _all: true },
      }),
      prisma.pipelineRun.findMany({
        where: { tenantId: MVP_TENANT_ID, status: 'needs_attention', ...channelWhere },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, channelId: true, briefText: true, lastError: true, updatedAt: true },
      }),
      prisma.pipelineRun.findMany({
        where: { tenantId: MVP_TENANT_ID, status: 'completed', ...channelWhere },
        orderBy: { completedAt: 'desc' },
        take: 10,
        select: { id: true, channelId: true, briefText: true, completedAt: true },
      }),
      prisma.pipelineRun.count({ where: { tenantId: MVP_TENANT_ID, status: 'completed', ...channelWhere } }),
      prisma.pipelineRun.count({ where: { tenantId: MVP_TENANT_ID, status: 'failed', ...channelWhere } }),
    ]);

  const terminalCount = completedCount + failedCount;

  return {
    stageFunnel: funnelRows.map((row) => ({
      stage: row.currentStage ?? '(none)',
      count: row._count._all,
    })),
    needsAttention: needsAttentionRows,
    recentCompletions: recentCompletedRows,
    successRate: {
      completed: completedCount,
      failed: failedCount,
      rate: terminalCount > 0 ? completedCount / terminalCount : null,
    },
  };
}

export async function getCostDashboard(channelId?: string): Promise<CostDashboard> {
  const channelWhere = channelId ? { channelId } : {};
  const [totalAgg, quota, byChannelRaw, byStageRaw, publishedCount] = await Promise.all([
    prisma.usageEvent.aggregate({
      where: { tenantId: MVP_TENANT_ID, ...channelWhere },
      _sum: { costUsd: true },
    }),
    prisma.agentQuota.findUnique({
      where: { tenantId_platform: { tenantId: MVP_TENANT_ID, platform: 'youtube' } },
    }),
    prisma.$queryRaw<{ channelId: string; channelName: string; spendUsd: Prisma.Decimal }[]>(
      Prisma.sql`
        SELECT c.id AS "channelId", c.name AS "channelName", COALESCE(SUM(ue."costUsd"), 0) AS "spendUsd"
        FROM channels c
        LEFT JOIN usage_events ue ON ue."channelId" = c.id
        WHERE c."tenantId" = ${MVP_TENANT_ID}::uuid ${channelFilterSql(channelId, Prisma.sql`c.id`)}
        GROUP BY c.id, c.name
        ORDER BY "spendUsd" DESC
      `,
    ),
    prisma.$queryRaw<{ stage: string; spendUsd: Prisma.Decimal }[]>(
      Prisma.sql`
        SELECT ps."stageName" AS "stage", COALESCE(SUM(ue."costUsd"), 0) AS "spendUsd"
        FROM pipeline_stages ps
        JOIN usage_events ue ON ue."stageId" = ps.id
        JOIN pipeline_runs pr ON pr.id = ps."pipelineRunId"
        WHERE pr."tenantId" = ${MVP_TENANT_ID}::uuid ${channelFilterSql(channelId, Prisma.sql`pr."channelId"`)}
        GROUP BY ps."stageName"
        ORDER BY "spendUsd" DESC
      `,
    ),
    prisma.pipelineStage.count({
      where: {
        stageName: 'publishing',
        status: 'completed',
        pipelineRun: { tenantId: MVP_TENANT_ID, ...channelWhere },
      },
    }),
  ]);

  const totalSpendUsd = totalAgg._sum.costUsd ? Number(totalAgg._sum.costUsd) : 0;

  return {
    totalSpendUsd,
    budgetCeilingUsd: quota ? Number(quota.budgetCeilingUsd) : null,
    byChannel: byChannelRaw.map((row) => ({
      channelId: row.channelId,
      channelName: row.channelName,
      spendUsd: Number(row.spendUsd),
    })),
    byStage: byStageRaw.map((row) => ({ stage: row.stage, spendUsd: Number(row.spendUsd) })),
    costPerPublishedVideo: {
      totalSpendUsd,
      publishedCount,
      costPerVideoUsd: publishedCount > 0 ? totalSpendUsd / publishedCount : null,
    },
  };
}

// performance_snapshots (Week 4 Task 3, Performance Analytics Agent) isn't in
// this track's Prisma schema — the frontend track's own SCHEMA.md declares no
// schema changes, and adding a model this track doesn't own would blur that
// boundary. The table itself can still exist in the shared dev database once
// the backend track's migration has run there, so this reads it via a raw
// query and treats a missing table as "no data yet" (available: false)
// rather than an error — the same honest-empty-state the design doc asks for,
// extended to the one step earlier case where the table doesn't exist at all.
export async function getContentPerformanceDashboard(channelId?: string): Promise<ContentPerformanceDashboard> {
  const empty: ContentPerformanceDashboard = {
    available: false,
    totalVideosTracked: 0,
    totals: { views: 0, likes: 0, comments: 0 },
    bestPerformers: [],
    worstPerformers: [],
    trend: [],
  };

  try {
    const latestPerVideo = await prisma.$queryRaw<
      { youtubeVideoId: string; pipelineRunId: string; views: bigint; likes: bigint; comments: bigint }[]
    >(
      Prisma.sql`
        SELECT DISTINCT ON (ps."youtubeVideoId")
          ps."youtubeVideoId" AS "youtubeVideoId",
          ps."pipelineRunId" AS "pipelineRunId",
          ps.views, ps.likes, ps.comments
        FROM performance_snapshots ps
        JOIN pipeline_runs pr ON pr.id = ps."pipelineRunId"
        WHERE pr."tenantId" = ${MVP_TENANT_ID}::uuid ${channelFilterSql(channelId, Prisma.sql`pr."channelId"`)}
        ORDER BY ps."youtubeVideoId", ps."snapshotAt" DESC
      `,
    );

    if (latestPerVideo.length === 0) {
      return empty;
    }

    const totals = latestPerVideo.reduce(
      (acc, row) => ({
        views: acc.views + Number(row.views),
        likes: acc.likes + Number(row.likes),
        comments: acc.comments + Number(row.comments),
      }),
      { views: 0, likes: 0, comments: 0 },
    );

    const byViewsDesc = [...latestPerVideo].sort((a, b) => Number(b.views) - Number(a.views));

    const trendRaw = await prisma.$queryRaw<
      { youtubeVideoId: string; snapshotAt: Date; views: bigint; likes: bigint; comments: bigint }[]
    >(
      Prisma.sql`
        SELECT ps."youtubeVideoId" AS "youtubeVideoId", ps."snapshotAt" AS "snapshotAt",
               ps.views, ps.likes, ps.comments
        FROM performance_snapshots ps
        JOIN pipeline_runs pr ON pr.id = ps."pipelineRunId"
        WHERE pr."tenantId" = ${MVP_TENANT_ID}::uuid ${channelFilterSql(channelId, Prisma.sql`pr."channelId"`)}
        ORDER BY ps."snapshotAt" ASC
        LIMIT 200
      `,
    );

    return {
      available: true,
      totalVideosTracked: latestPerVideo.length,
      totals,
      bestPerformers: byViewsDesc.slice(0, 3).map((row) => ({
        youtubeVideoId: row.youtubeVideoId,
        pipelineRunId: row.pipelineRunId,
        views: Number(row.views),
        likes: Number(row.likes),
      })),
      worstPerformers: byViewsDesc
        .slice(-3)
        .reverse()
        .map((row) => ({
          youtubeVideoId: row.youtubeVideoId,
          pipelineRunId: row.pipelineRunId,
          views: Number(row.views),
          likes: Number(row.likes),
        })),
      trend: trendRaw.map((row) => ({
        youtubeVideoId: row.youtubeVideoId,
        snapshotAt: row.snapshotAt,
        views: Number(row.views),
        likes: Number(row.likes),
        comments: Number(row.comments),
      })),
    };
  } catch (error) {
    // Prisma wraps a failed raw query as PrismaClientKnownRequestError
    // code P2010, with the underlying Postgres error (42P01 = undefined_table
    // for "relation ... does not exist") in error.meta.code. That specific
    // case — the table just doesn't exist yet in this environment — is the
    // one this deliberately swallows into the empty shape; anything else is
    // a real bug and should surface.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2010' &&
      error.meta?.code === '42P01'
    ) {
      return empty;
    }
    throw error;
  }
}

export async function getQualityDashboard(channelId?: string): Promise<QualityDashboard> {
  const [scoreRows, videoGenAttempts, gate1Rows, gate2Rows] = await Promise.all([
    prisma.$queryRaw<{ score: string; count: bigint }[]>(
      Prisma.sql`
        SELECT rl.verdict AS "score", COUNT(*) AS "count"
        FROM review_logs rl
        WHERE rl."tenantId" = ${MVP_TENANT_ID}::uuid AND rl.agent = 'script-review'
          ${channelFilterSql(channelId, Prisma.sql`rl."channelId"`)}
        GROUP BY rl.verdict
        ORDER BY rl.verdict
      `,
    ),
    prisma.$queryRaw<{ pipelineRunId: string; maxAttempt: number }[]>(
      Prisma.sql`
        SELECT ps."pipelineRunId" AS "pipelineRunId", MAX(ps."attemptNumber") AS "maxAttempt"
        FROM pipeline_stages ps
        JOIN pipeline_runs pr ON pr.id = ps."pipelineRunId"
        WHERE pr."tenantId" = ${MVP_TENANT_ID}::uuid AND ps."stageName" = 'video_generation'
          ${channelFilterSql(channelId, Prisma.sql`pr."channelId"`)}
        GROUP BY ps."pipelineRunId"
      `,
    ),
    prisma.$queryRaw<{ verdict: string; count: bigint }[]>(
      Prisma.sql`
        SELECT rl.verdict, COUNT(*) AS "count"
        FROM review_logs rl
        JOIN pipeline_stages ps ON ps.id = rl."stageId"
        WHERE rl."tenantId" = ${MVP_TENANT_ID}::uuid AND rl.agent = 'human' AND ps."stageName" = 'gate1'
          ${channelFilterSql(channelId, Prisma.sql`rl."channelId"`)}
        GROUP BY rl.verdict
      `,
    ),
    prisma.$queryRaw<{ verdict: string; count: bigint }[]>(
      Prisma.sql`
        SELECT rl.verdict, COUNT(*) AS "count"
        FROM review_logs rl
        JOIN pipeline_stages ps ON ps.id = rl."stageId"
        WHERE rl."tenantId" = ${MVP_TENANT_ID}::uuid AND rl.agent = 'human' AND ps."stageName" = 'gate2'
          ${channelFilterSql(channelId, Prisma.sql`rl."channelId"`)}
        GROUP BY rl.verdict
      `,
    ),
  ]);

  const runsReachedVideoGen = videoGenAttempts.length;
  const runsWithRegen = videoGenAttempts.filter((row) => row.maxAttempt > 1).length;

  const gate1Rates = { approve: 0, edit: 0, reject: 0 };
  for (const row of gate1Rows) {
    if (row.verdict === 'approve' || row.verdict === 'edit' || row.verdict === 'reject') {
      gate1Rates[row.verdict] = Number(row.count);
    }
  }

  const gate2Rates = { approve: 0, revise: 0, reject: 0 };
  for (const row of gate2Rows) {
    if (row.verdict === 'approve' || row.verdict === 'revise' || row.verdict === 'reject') {
      gate2Rates[row.verdict] = Number(row.count);
    }
  }

  return {
    scriptReviewScoreDistribution: scoreRows.map((row) => ({
      score: Number(row.score),
      count: Number(row.count),
    })),
    videoRegenRate: {
      runsReachedVideoGen,
      runsWithRegen,
      rate: runsReachedVideoGen > 0 ? runsWithRegen / runsReachedVideoGen : null,
    },
    gate1Rates,
    gate2Rates,
  };
}
