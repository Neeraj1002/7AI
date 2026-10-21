// Frontend track Task 1 — response shapes for the four /dashboard/* groups
// (MOBILE_APP_DESIGN.md Section 4, BUSINESS_LOGIC.md Section 3). Documented
// here as the single source of truth Task 3's app screen builds against.

export type OperationalDashboard = {
  stageFunnel: { stage: string; count: number }[];
  needsAttention: {
    id: string;
    channelId: string;
    briefText: string;
    lastError: string | null;
    updatedAt: Date;
  }[];
  recentCompletions: { id: string; channelId: string; briefText: string; completedAt: Date | null }[];
  // D2: rate is over every stopped run (completed + needsAttention + failed).
  // Bugs Task 12 (R3): rate = published / (published + failed + rejected); cancelled is excluded.
  successRate: {
    completed: number;
    needsAttention: number;
    published: number;
    failed: number;
    rejected: number;
    cancelled: number;
    rate: number | null;
  };
  // D3: published videos / stopped runs.
  publishedRate: { published: number; stopped: number; rate: number | null };
};

export type CostDashboard = {
  totalSpendUsd: number; // lifetime — still the basis of costPerPublishedVideo
  // Bugs Closure R1 (D1) — the budget is weekly; these are what the gate compares.
  weekSpendUsd: number;
  budgetWindow: { startsAt: string; resetsAt: string };
  budgetCeilingUsd: number | null; // the weekly pooled ceiling
  byChannel: {
    channelId: string;
    channelName: string;
    spendUsd: number;
    weekSpendUsd: number;
    effectiveCeilingUsd: number | null;
  }[];
  byStage: { stage: string; spendUsd: number }[];
  costPerPublishedVideo: { totalSpendUsd: number; publishedCount: number; costPerVideoUsd: number | null };
};

export type ContentPerformanceDashboard = {
  available: boolean;
  totalVideosTracked: number;
  totals: { views: number; likes: number; comments: number };
  bestPerformers: { youtubeVideoId: string; pipelineRunId: string; views: number; likes: number }[];
  worstPerformers: { youtubeVideoId: string; pipelineRunId: string; views: number; likes: number }[];
  trend: { youtubeVideoId: string; snapshotAt: Date; views: number; likes: number; comments: number }[];
};

export type QualityDashboard = {
  scriptReviewScoreDistribution: { score: number; count: number }[];
  videoRegenRate: { runsReachedVideoGen: number; runsWithRegen: number; rate: number | null };
  gate1Rates: { approve: number; edit: number; reject: number };
  gate2Rates: { approve: number; revise: number; reject: number };
};

// Sprint 4 Task 7: side-by-side channel x format comparison. A views/likes/
// comments proxy view, NOT a P&L (no ad-revenue data exists yet).
export type ComparisonTotals = { views: number; likes: number; comments: number };

// Sprint 5 Task 8 (R11.4): the watch numbers Sprint 4 Task 10 stores for long videos
// (performance_snapshots.longFormMetrics). Averages are over the videos that have a measurement; null for
// Shorts and for a group with none. Click-through is not here because the Analytics API offers none.
export type LongFormWatch = {
  videosMeasured: number;
  avgViewDurationSec: number | null;
  avgViewPercentage: number | null;
  estimatedMinutesWatched: number;
};

export type ComparisonFormatRow = {
  formatKey: string | null; // null = every run submitted without a format (Freeform)
  // Sprint 4 Task 10 (R6): Shorts and long-form are never averaged together, so a Freeform group
  // that has both kinds is two rows.
  videoKind: 'short' | 'long';
  videoCount: number;
  totals: ComparisonTotals;
  avgViewsPerVideo: number | null;
  longFormWatch: LongFormWatch | null;
};

export type ChannelComparisonDashboard = {
  channels: {
    channelId: string;
    channelName: string;
    videoCount: number;
    totals: ComparisonTotals;
    // null when the channel has both kinds and no videoKind filter was sent (see byVideoKind).
    avgViewsPerVideo: number | null;
    byVideoKind: { videoKind: 'short' | 'long'; videoCount: number; totals: ComparisonTotals; avgViewsPerVideo: number | null; longFormWatch: LongFormWatch | null }[];
    byFormat: ComparisonFormatRow[];
  }[];
};
// Bugs Closure R3 (D3). medianDecisionSeconds blends per-verdict medians weighted by count (approximate).
export type GateOutcome = { approved: number; revised: number; rejected: number; medianDecisionSeconds: number | null };
export type GateAnalyticsDashboard = { gate1: GateOutcome; gate2: GateOutcome };
