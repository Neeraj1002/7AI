// Week 4 Task 3 addition — see docs/execution/week4/SCHEMA.md Section 1.
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
  snapshotAt: Date;
};
