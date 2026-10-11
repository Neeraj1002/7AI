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

// Bugs Closure R3 (D3). medianDecisionSeconds blends per-verdict medians weighted by count (approximate).
export type GateOutcome = { approved: number; revised: number; rejected: number; medianDecisionSeconds: number | null };
export type GateAnalyticsDashboard = { gate1: GateOutcome; gate2: GateOutcome };
