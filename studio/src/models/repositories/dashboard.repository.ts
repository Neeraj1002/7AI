import { prisma } from '../prisma-client';
import { currentBudgetWindowStart, loadChannelBudgetView, NoBudgetConfiguredError, nextBudgetWindowStart } from '../../run-pipeline/budget-gate';
import { Prisma } from '@prisma/client';
import type {
  ContentPerformanceDashboard,
  CostDashboard,
  GateAnalyticsDashboard,
  OperationalDashboard,
  QualityDashboard,
} from '../../types';

// Frontend track Task 1 (Tasks 1-3) — the four /dashboard/* aggregate
// queries (BUSINESS_LOGIC.md Section 3). Kept in its own file rather than
// spread across the per-model repositories since these queries genuinely
// span PipelineRun/PipelineStage/UsageEvent/ReviewLog and don't belong to
// any one of them.
//
// Sprint 3 Task 1 (J3) — every function now takes a real `tenantId` (the
// caller's session tenant), replacing the hardcoded MVP_TENANT_ID this file
// used to read directly — these are reached via api/routers/dashboard.ts's
// publicProcedures, so they're squarely inside J3's "every publicProcedure
// currently reading MVP_TENANT_ID reads ctx.tenantId instead" scope, even
// though the hardcoded read lived one layer down from the router itself.
//
// `channelId` (optional on every function, added in Task 3): every screen in
// the app is channel-scoped per MOBILE_APP_DESIGN.md Section 4's explicit
// instruction, including the Dashboard — omitted (undefined) means "all
// channels for this tenant," matching today's single-channel reality without
// requiring the caller to know the one channel's id.

function channelFilterSql(channelId: string | undefined, column: Prisma.Sql): Prisma.Sql {
  return channelId ? Prisma.sql`AND ${column} = ${channelId}::uuid` : Prisma.empty;
}

export async function getOperationalDashboard(tenantId: string, channelId?: string): Promise<OperationalDashboard> {
  const channelWhere = channelId ? { channelId } : {};
  const [funnelRows, needsAttentionRows, recentCompletedRows, completedCount, failedCount, needsAttentionCount, publishedCount] =
    await Promise.all([
      prisma.pipelineRun.groupBy({
        by: ['currentStage'],
        where: { tenantId, ...channelWhere },
        _count: { _all: true },
      }),
      prisma.pipelineRun.findMany({
        where: { tenantId, status: 'needs_attention', ...channelWhere },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, channelId: true, briefText: true, lastError: true, updatedAt: true },
      }),
      prisma.pipelineRun.findMany({
        where: { tenantId, status: 'completed', ...channelWhere },
        orderBy: { completedAt: 'desc' },
        take: 10,
        select: { id: true, channelId: true, briefText: true, completedAt: true },
      }),
      prisma.pipelineRun.count({ where: { tenantId, status: 'completed', ...channelWhere } }),
      prisma.pipelineRun.count({ where: { tenantId, status: 'failed', ...channelWhere } }),
      prisma.pipelineRun.count({ where: { tenantId, status: 'needs_attention', ...channelWhere } }),
      // A run counts as published only when it is completed AND its publishing stage completed.
      prisma.pipelineRun.count({
        where: {
          tenantId,
          status: 'completed',
          ...channelWhere,
          stages: { some: { stageName: 'publishing', status: 'completed' } },
        },
      }),
    ]);

  // Bugs Closure R3 (D2) — a run stuck in needs_attention is a stopped run, not a missing one.
  const terminalCount = completedCount + failedCount + needsAttentionCount;

  return {
    stageFunnel: funnelRows.map((row) => ({
      stage: row.currentStage ?? '(none)',
      count: row._count._all,
    })),
    needsAttention: needsAttentionRows,
    recentCompletions: recentCompletedRows,
    successRate: {
      completed: completedCount,
      needsAttention: needsAttentionCount,
      failed: failedCount,
      rate: terminalCount > 0 ? completedCount / terminalCount : null,
    },
    // Bugs Closure R3 (D3) — published videos / runs that have stopped.
    publishedRate: {
      published: publishedCount,
      stopped: terminalCount,
      rate: terminalCount > 0 ? publishedCount / terminalCount : null,
    },
  };
}

export async function getCostDashboard(tenantId: string, channelId?: string): Promise<CostDashboard> {
  const channelWhere = channelId ? { channelId } : {};
  // Bugs Closure R1 (D1) — the same weekly window the budget gate enforces.
  const windowStart = currentBudgetWindowStart();
  const [totalAgg, weekAgg, effectiveCeilings, quota, byChannelRaw, byStageRaw, publishedCount] = await Promise.all([
    prisma.usageEvent.aggregate({
      where: { tenantId, ...channelWhere },
      _sum: { costUsd: true },
    }),
    prisma.usageEvent.aggregate({
      where: { tenantId, ...channelWhere, createdAt: { gte: windowStart } },
      _sum: { costUsd: true },
    }),
    loadChannelBudgetView(tenantId, 'youtube')
      .then((view) => view.ceilings)
      .catch((error) => {
        if (error instanceof NoBudgetConfiguredError) return new Map<string, number>();
        throw error;
      }),
    prisma.agentQuota.findUnique({
      where: { tenantId_platform: { tenantId, platform: 'youtube' } },
    }),
    prisma.$queryRaw<{ channelId: string; channelName: string; spendUsd: Prisma.Decimal; weekSpendUsd: Prisma.Decimal }[]>(
      Prisma.sql`
        SELECT c.id AS "channelId", c.name AS "channelName", COALESCE(SUM(ue."costUsd"), 0) AS "spendUsd",
               COALESCE(SUM(ue."costUsd") FILTER (WHERE ue."createdAt" >= ${windowStart.toISOString()}::timestamp), 0) AS "weekSpendUsd"
        FROM channels c
        LEFT JOIN usage_events ue ON ue."channelId" = c.id
        WHERE c."tenantId" = ${tenantId}::uuid ${channelFilterSql(channelId, Prisma.sql`c.id`)}
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
        WHERE pr."tenantId" = ${tenantId}::uuid ${channelFilterSql(channelId, Prisma.sql`pr."channelId"`)}
        GROUP BY ps."stageName"
        ORDER BY "spendUsd" DESC
      `,
    ),
    prisma.pipelineStage.count({
      where: {
        stageName: 'publishing',
        status: 'completed',
        pipelineRun: { tenantId, ...channelWhere },
      },
    }),
  ]);

  const totalSpendUsd = totalAgg._sum.costUsd ? Number(totalAgg._sum.costUsd) : 0;
  const weekSpendUsd = weekAgg._sum.costUsd ? Number(weekAgg._sum.costUsd) : 0;

  return {
    totalSpendUsd,
    weekSpendUsd,
    budgetWindow: { startsAt: windowStart.toISOString(), resetsAt: nextBudgetWindowStart().toISOString() },
    budgetCeilingUsd: quota ? Number(quota.budgetCeilingUsd) : null,
    byChannel: byChannelRaw.map((row) => ({
      channelId: row.channelId,
      channelName: row.channelName,
      spendUsd: Number(row.spendUsd),
      weekSpendUsd: Number(row.weekSpendUsd),
      // null for an inactive channel (the gate ignores those).
      effectiveCeilingUsd: effectiveCeilings.get(row.channelId) ?? null,
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
export async function getContentPerformanceDashboard(
  tenantId: string,
  channelId?: string,
): Promise<ContentPerformanceDashboard> {
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
        WHERE pr."tenantId" = ${tenantId}::uuid ${channelFilterSql(channelId, Prisma.sql`pr."channelId"`)}
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
        WHERE pr."tenantId" = ${tenantId}::uuid ${channelFilterSql(channelId, Prisma.sql`pr."channelId"`)}
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

export async function getQualityDashboard(tenantId: string, channelId?: string): Promise<QualityDashboard> {
  const [scoreRows, videoGenAttempts, gate1Rows, gate2Rows] = await Promise.all([
    prisma.$queryRaw<{ score: string; count: bigint }[]>(
      Prisma.sql`
        SELECT rl.verdict AS "score", COUNT(*) AS "count"
        FROM review_logs rl
        WHERE rl."tenantId" = ${tenantId}::uuid AND rl.agent = 'script-review'
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
        WHERE pr."tenantId" = ${tenantId}::uuid AND ps."stageName" = 'video_generation'
          ${channelFilterSql(channelId, Prisma.sql`pr."channelId"`)}
        GROUP BY ps."pipelineRunId"
      `,
    ),
    prisma.$queryRaw<{ verdict: string; count: bigint }[]>(
      Prisma.sql`
        SELECT rl.verdict, COUNT(*) AS "count"
        FROM review_logs rl
        JOIN pipeline_stages ps ON ps.id = rl."stageId"
        WHERE rl."tenantId" = ${tenantId}::uuid AND rl.agent = 'human' AND ps."stageName" = 'gate1'
          ${channelFilterSql(channelId, Prisma.sql`rl."channelId"`)}
        GROUP BY rl.verdict
      `,
    ),
    prisma.$queryRaw<{ verdict: string; count: bigint }[]>(
      Prisma.sql`
        SELECT rl.verdict, COUNT(*) AS "count"
        FROM review_logs rl
        JOIN pipeline_stages ps ON ps.id = rl."stageId"
        WHERE rl."tenantId" = ${tenantId}::uuid AND rl.agent = 'human' AND ps."stageName" = 'gate2'
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

// Bugs Closure R3 (D3) — per-gate resolution analytics, kept apart from the success rate.
// Time to decision = gate stage row created -> the human review_log written for it
// (median, seconds; null when the gate has no decisions yet).
export async function getGateAnalytics(tenantId: string, channelId?: string): Promise<GateAnalyticsDashboard> {
  const rows = await prisma.$queryRaw<{ gate: string; verdict: string; count: bigint; medianSeconds: number | null }[]>(
    Prisma.sql`
      SELECT ps."stageName" AS "gate", rl.verdict AS "verdict", COUNT(*) AS "count",
             percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (rl."timestamp" - ps."createdAt"))) AS "medianSeconds"
      FROM review_logs rl
      JOIN pipeline_stages ps ON ps.id = rl."stageId"
      WHERE rl."tenantId" = ${tenantId}::uuid AND rl.agent = 'human' AND ps."stageName" IN ('gate1', 'gate2')
        ${channelFilterSql(channelId, Prisma.sql`rl."channelId"`)}
      GROUP BY ps."stageName", rl.verdict
    `,
  );
  const empty = () => ({ approved: 0, revised: 0, rejected: 0, medianDecisionSeconds: null as number | null });
  const out: GateAnalyticsDashboard = { gate1: empty(), gate2: empty() };
  const weights = { gate1: { n: 0, sum: 0 }, gate2: { n: 0, sum: 0 } };
  for (const row of rows) {
    const key = row.gate === 'gate1' ? 'gate1' : 'gate2';
    const g = out[key];
    const n = Number(row.count);
    if (row.verdict === 'approve') g.approved += n;
    else if (row.verdict === 'edit' || row.verdict === 'revise') g.revised += n;
    else if (row.verdict === 'reject') g.rejected += n;
    if (row.medianSeconds !== null) {
      // Per-verdict medians are blended as a count-weighted mean: an approximation, noted on the type.
      weights[key].n += n;
      weights[key].sum += Number(row.medianSeconds) * n;
    }
  }
  for (const key of ['gate1', 'gate2'] as const) {
    const w = weights[key];
    out[key].medianDecisionSeconds = w.n > 0 ? Math.round(w.sum / w.n) : null;
  }
  return out;
}
