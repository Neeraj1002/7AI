# Week 4 Task 3: Performance Analytics Agent

**Date**: 2026-09-09
**Status**: Complete
**Files Created**: 6
**Files Modified**: 6
**Tests**: All Passing (build/lint/typecheck clean; real migration applied; real initial snapshot + periodic poll + concurrency guard all exercised)

## What Was Done

Migrated `performance_snapshots` exactly per `docs/execution/week4/SCHEMA.md` and built the
Performance Analytics agent (`studio/src/agents/performance-analytics/`), same boundary shape as
every other capability layer (`types.ts`, `youtube-stats-client.ts` — the only file touching the
YouTube Data API v3's `videos.list` endpoint, `stub.ts`, `index.ts`).

Two distinct triggers, per `BUSINESS_LOGIC.md` Section 3:
1. **Initial snapshot** — `runAnalyticsStage` (state-machine.ts) calls `recordSnapshot` right
   after `publishing` completes. This is what advances `PipelineRun.status` to `completed` for the
   **first time in the project** — the nine-stage chain (`intake → ... → analytics`) is now fully
   reachable.
2. **Periodic poll** — `runPeriodicPoll` re-polls every `completed` run's video on a schedule,
   independent of any single run's state machine, per Section 8.3 ("batch over real-time").
   Wired as a plain `setInterval` in `studio/src/index.ts` (`ANALYTICS_POLL_INTERVAL_MS`, default
   6h) — "cron + Postgres, no magic," no new job-queue dependency, matching the convention the
   task file names.

**`watchTimeMinutes`/`retentionPct` are left `null`**, stated plainly rather than attempted and
silently failing: the YouTube Analytics API needs a separate `yt-analytics.readonly` OAuth scope
that `scripts/youtube-oauth.ts` never requested (only `youtube.upload`/`youtube.readonly`). Per
`SCHEMA.md`'s own note, this wasn't meant to block Week 4 on a second OAuth scope request — `views`/
`likes`/`comments` (from the Data API, same scope as Publishing's upload) are what's populated.

## Files Created/Modified

- Created:
  - `studio/src/agents/performance-analytics/types.ts`, `youtube-stats-client.ts`, `stub.ts`, `index.ts`
  - `studio/src/models/repositories/performance-snapshot.repository.ts`
  - `studio/src/types/performance-snapshot.types.ts`
- Modified:
  - `studio/src/models/schema.prisma` — new `PerformanceSnapshot` model + back-relations on
    `Tenant`/`Channel`/`PipelineRun`
  - `studio/src/models/migrations/20260909100827_week4_performance_snapshot/migration.sql` — generated
  - `studio/src/types/index.ts` — re-export
  - `studio/src/run-pipeline/state-machine.ts` — new `runAnalyticsStage`
  - `studio/src/run-pipeline/resume-on-startup.ts` — `analytics` added to the resumer map
  - `studio/scripts/dry-run.ts` — new `analytics <runId>` and `poll` commands
  - `studio/src/index.ts` — starts the periodic poller alongside the Telegram bot

## Schema Changes Applied

`npx prisma migrate dev --name week4_performance_snapshot` — one new table, `performance_snapshots`,
matching `SCHEMA.md` field-for-field (including the nullable watch-time/retention columns and both
named indexes). Applied cleanly to the existing dev database. Idempotency (a no-op on a DB that
already has it) is Prisma's own migration-tracking guarantee (`_prisma_migrations`), same as every
prior migration in this project — not independently re-verified beyond that standard mechanism.

## Test Results

```
npm run typecheck   -> clean
npm run lint        -> clean
npm run build       -> clean
```

Ran under `YOUTUBE_STUB=1` (Week 1 Task 7's OAuth still open, same as Task 2) against the real run
Task 2 published (`b24001a6-...`, `youtubeVideoId: "stub-ec8b1fa7-..."`):

- `npx tsx scripts/dry-run.ts analytics <runId>` — real DB row confirms
  `PipelineRun.status = 'completed'`, `currentStage = null`, `completedAt` set. Analytics stage
  output: `{ snapshotId, views: 135, likes: 2, comments: 8 }`.
- `npx tsx scripts/dry-run.ts poll` — a second, independent snapshot written for the same
  now-`completed` run (`views: 484, likes: 5, comments: 4`), proving the periodic path works
  independent of the state machine.
- **Concurrency guard**: a targeted test called `runPeriodicPoll()` twice via `Promise.all` in one
  process. Real output: the first call proceeded (`polled: 1, skipped: false`), the second was
  turned away while the first was still running (`polled: 0, skipped: true`) — confirmed via the DB
  read afterward: exactly 3 total snapshot rows for the run (1 initial + 2 successful poll calls),
  not 4. No duplicate/overlapping write occurred.
- All three real rows have plausible, non-zero `views`/`likes`/`comments` and `watchTimeMinutes`/
  `retentionPct` both `null`, exactly as expected without the Analytics API scope.

## Deviations from Spec

- `youtube-stats-client.ts` duplicates a small `OAuth2Client` constructor already present in
  `studio/src/agents/publishing/youtube-client.ts`, rather than importing it from there — per
  `AGENT_FLEET_DESIGN.md` Principle 5 ("Agents never call each other directly or share hidden
  state"), Publishing and Performance Analytics are separate agents and shouldn't import each
  other's internals even for a few shared lines.
- `youtube-stats-client.ts`/`stub.ts` weren't named in the task file's file list (only an
  `index.ts` "or equivalent" was) — added to keep the "only one file touches the external API"
  boundary convention consistent with every other capability layer, same reasoning as Task 2.

## Sign-Off

- Task Objective: Met — a snapshot is written immediately after publish (advancing the run to
  `completed`), and periodic polling continues writing snapshots for `completed` runs on a
  schedule, idempotently.
- Schema Impact: Matches `SCHEMA.md` exactly.
- Business Logic: Matches `BUSINESS_LOGIC.md` Sections 1, 3 — `publishing → analytics → completed`
  confirmed for real; ongoing polling confirmed independent of the state machine.
- Tests: Passing.
- Ready for Integration: Yes.
- **Still stubbed, pending tonight's key**: real YouTube Data API stats (Week 1 Task 7's OAuth,
  same as Task 2 — this task's own `views`/`likes`/`comments` numbers are only real once that
  lands). `watchTimeMinutes`/`retentionPct` will stay `null` even after tonight's key, since the
  Analytics API scope was never requested — a separate, later founder decision if wanted.
