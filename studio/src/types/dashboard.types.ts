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
  successRate: { completed: number; failed: number; rate: number | null };
};

export type CostDashboard = {
  totalSpendUsd: number;
  budgetCeilingUsd: number | null;
  byChannel: { channelId: string; channelName: string; spendUsd: number }[];
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
