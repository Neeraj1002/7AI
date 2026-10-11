# Sprint 4 Task 7: Channel × Format Comparison Dashboard (API only)

**Date**: 2026-10-06
**Status**: Complete (backend API). `compare.tsx` is NOT built here; see Deviations.
**Files Created**: 2 (this report, `dashboard-comparison.test.ts`)
**Files Modified**: 3 (`dashboard.repository.ts`, `routers/dashboard.ts`, `types/dashboard.types.ts`)
**Tests**: All passing (165 / 165; 4 new)
**Branch**: `sprint4_be`

## What Was Done

New procedure `dashboard.comparison` (no input; tenant from the session) returning
`ChannelComparisonDashboard`: every **active** channel of the tenant, each with `videoCount`, `totals`
(views/likes/comments), `avgViewsPerVideo` (`null` when no videos) and `byFormat[]` keyed on
`PipelineRun.creationOptions->>'formatKey'` (`null` = Freeform). A channel with no data stays in the list
with zeros. A format that a channel has runs for but no tracked video yet appears with zeros. Named
formats sort by views descending, Freeform last. Works before Task 6 lands: with no `formatKey` anywhere,
`byFormat` is `[{ formatKey: null, ... }]`.

The aggregation is a pure function, `buildChannelComparison`, so it is unit-tested without a DB. The
"latest snapshot per video wins" selection is the same `DISTINCT ON (youtubeVideoId) ... ORDER BY
snapshotAt DESC` as `getContentPerformanceDashboard`; a missing `performance_snapshots` table (42P01)
is treated as "no data yet", same as that function.

This is a views/likes/comments proxy view, **not a P&L**: no ad-revenue data exists, and YouTube exposes
none until Partner Program thresholds are cleared. Retention/watch-time can be added once Sprint 2
Task 4's fields are populated (blocked on the founder OAuth re-consent).

## Files Created/Modified

- Created: `studio/src/models/repositories/dashboard-comparison.test.ts`, this report
- Modified: `studio/src/models/repositories/dashboard.repository.ts` (`buildChannelComparison`,
  `getChannelComparisonDashboard`), `studio/src/api/routers/dashboard.ts` (`comparison`),
  `studio/src/types/dashboard.types.ts` (`ChannelComparisonDashboard`, `ComparisonFormatRow`,
  `ComparisonTotals`), `docs/execution/sprint4/STATUS.md`, `docs/execution/sprint4/tasks/task7.md`

## Schema Changes Applied

None.

## Test Results

```
npx vitest run dashboard  -> 4 passed (new)
npx vitest run            -> 26 files, 165 tests passed
npx tsc --noEmit, npm run lint, npm run build -> clean
```

Real check on `sevenai_dev` (throwaway tenant `ZZ_TASK7_VERIFY`, fully deleted afterwards; leftover
count 0). Two channels: `ZZ_TASK7_ESTABLISHED` with 4 videos (2 `listicle`, 1 `story`, 1 Freeform, each
with an older snapshot that must lose to the newest) and `ZZ_TASK7_BRANDNEW` with nothing.
`dashboard.comparison`'s function returned both channels; the new one with all zeros and
`avgViewsPerVideo: null`; the established one with 3 `byFormat` entries: story 500 (1 video), listicle
400 (2), null 40 (1); channel total 940 views, avg 235. An independent SQL cross-check against the same
rows gave listicle 2 / 400, story 1 / 500, Freeform 1 / 40, matching. The older snapshots were correctly ignored.
Not exercised through HTTP/tRPC with a real session (the router line is a one-liner over the verified function).

## Deviations from Spec

- **`compare.tsx` not built.** Per the founder's instruction, this task ships the API only; the frontend
  agent builds the screen (UI/UX Task 8, E2). Overrides the task doc.
- The snapshot-selection SQL is repeated in the new function instead of extracted into a shared helper,
  because Sprint3_CLOSURE (PR #48) also edits `getContentPerformanceDashboard` in the same file and a
  refactor now would guarantee a merge conflict. It can be deduplicated after that PR merges.
- Only `isActive` channels are listed ("every active channel").

## Overlap check with Sprint3_CLOSURE (PR #48), as requested

Read from `docs/execution/bugs/Sprint3/closureTask.md` (which exists only on `origin/SPRINT4_TASK8_BE`
commit `9cf2f5e`, not in the `Sprint3_CLOSURE` worktree or `main`).
- **R6 clip-skip**: Task 8 R5 (on `main`) already skips clip IDs already used within one render
  (`stock-shotlist.ts` `excludeSourceIds`, `client.ts` `pickUnusedVideo`). Closure R6 (commit `c7b5c07`)
  adds the same `excludeSourceIds` across *revise attempts* in `stock-footage/client.ts` and `types.ts`.
  Same two files, same option name: expect a **merge conflict** in PR #48; its R6 should be reconciled
  with Task 8's version rather than both kept. Its own text says to verify instead of rebuilding if Task 8
  covers it.
- **R1 step 7 image cost**: closure R1 records the cost already spent on a *failed* attempt
  (`agents/video-generation/index.ts`, `usage-event.repository.ts`). Task 8 only added per-still
  rate-limit retry; no overlap in code. Task 8's heavier image spend is what makes that fix matter.
- Files PR #48 also touches that this sprint will touch: `dashboard.repository.ts`, `dashboard.ts`,
  `dashboard.types.ts` (this task: appended at the end, so conflicts should be trivial import/export
  lines), `channels.ts` and `runs.ts` (Tasks 1, 2, 6).

## Sign-Off

- Task Objective: Met (API)
- Schema Impact: None
- Business Logic: No new control flow
- Tests: Passing
- Ready for Integration: Yes
