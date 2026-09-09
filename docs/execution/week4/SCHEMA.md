# Week 4 Schema Delta

**Status**: One new table this week — `PerformanceSnapshot`, for Performance Analytics' basic polling/logging. No changes to existing tables.

## 1. PerformanceSnapshot

Not named at field level anywhere yet — `AGENT_FLEET_DESIGN.md` 4.8 only says "track views, watch time, retention, engagement... basic polling/logging only." Proposed here for Task 2 to implement, same "proposed, open to sign-off" treatment as `PipelineRun`/`AgentQuota` before it.

```typescript
type PerformanceSnapshot = {
  id: string;                    // UUID, primary key
  tenantId: string;              // FK -> tenants.id
  channelId: string;             // FK -> channels.id
  pipelineRunId: string;         // FK -> pipeline_runs.id
  youtubeVideoId: string;        // the platform's own video ID, from Publishing (Task 1)

  views: number;
  likes: number;
  comments: number;
  watchTimeMinutes?: number;     // nullable — see note below
  retentionPct?: number;         // nullable — see note below

  snapshotAt: Date;              // when this poll happened (a video accumulates many rows over time)
  createdAt: Date;
};
```

```sql
CREATE TABLE performance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenantId UUID NOT NULL REFERENCES tenants(id),
  channelId UUID NOT NULL REFERENCES channels(id),
  pipelineRunId UUID NOT NULL REFERENCES pipeline_runs(id),
  youtubeVideoId VARCHAR(255) NOT NULL,

  views BIGINT NOT NULL DEFAULT 0,
  likes BIGINT NOT NULL DEFAULT 0,
  comments BIGINT NOT NULL DEFAULT 0,
  watchTimeMinutes NUMERIC(10,2),
  retentionPct NUMERIC(5,2),

  snapshotAt TIMESTAMP NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_snapshots_video_time ON performance_snapshots(youtubeVideoId, snapshotAt);
CREATE INDEX idx_snapshots_run ON performance_snapshots(pipelineRunId);
```

**Why `watchTimeMinutes`/`retentionPct` are nullable, not required**: `views`/`likes`/`comments` come from the YouTube Data API v3 (`videos.list`, `part=statistics`) — the same API/OAuth scope Publishing (Task 1) already needs to upload. Watch-time and retention live in the separate YouTube Analytics API, which needs its own scope (`yt-analytics.readonly`) and, per Week 1 Task 7's experience, Google-side approval can have its own lead time. Rather than block Week 4 on a second OAuth setup, Task 2 starts with Data API stats (always populated) and adds Analytics API fields only if the scope is already available — nullable so the schema doesn't force a decision about that lead time this week. Task 2's report should state plainly which fields it actually populated.

**No new `AgentCredential` table**: still single-channel MVP, so the env-var stopgap from `docs/execution/week1/SCHEMA.md` stays in place per that doc's own note ("`AgentCredential` is a Week 2+ task once a second channel makes env-var-per-channel unworkable" — still one channel, so still not yet).

## Reference
- `AGENT_FLEET_DESIGN.md` Section 4.8
- `docs/execution/week1/SCHEMA.md` — `AgentCredential` deferral, still applicable
- `docs/execution/week1/STATUS.md` — Task 7 (YouTube OAuth), the credential this week's Publishing agent depends on
