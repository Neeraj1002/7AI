// Week 4 Task 3 addition — see docs/execution/week4/SCHEMA.md Section 1.

// Sprint 2 Task 4 (G2) — the real dimension/metric pair the YouTube
// Analytics API's audience-retention report returns.
export type RetentionCurvePoint = {
  elapsedVideoTimeRatio: number;
  audienceWatchRatio: number;
};

// Sprint 4 Task 10 (R6). The YouTube Analytics API (v2) offers no thumbnail-impressions click-through
// metric, so that one is always null rather than guessed.
export type LongFormMetrics = {
  averageViewDurationSec: number | null;
  averageViewPercentage: number | null;
  estimatedMinutesWatched: number | null;
  impressionsClickThroughRate: null;
};

export type PerformanceSnapshot = {
  id: string;
  tenantId: string;
  channelId: string;
  pipelineRunId: string;
  youtubeVideoId: string;

  views: number;
  likes: number;
  comments: number;
  watchTimeMinutes: string | null; // NUMERIC as string, matching UsageEvent.costUsd's DB representation
  retentionPct: string | null;
  retentionCurve: RetentionCurvePoint[] | null;
  longFormMetrics: LongFormMetrics | null;

  snapshotAt: Date;
  createdAt: Date;
};

export type CreatePerformanceSnapshotInput = {
  tenantId: string;
  channelId: string;
  pipelineRunId: string;
  youtubeVideoId: string;
  views: number;
  likes: number;
  comments: number;
  watchTimeMinutes?: string;
  retentionPct?: string;
  retentionCurve?: RetentionCurvePoint[];
  longFormMetrics?: LongFormMetrics;
  snapshotAt: Date;
};
