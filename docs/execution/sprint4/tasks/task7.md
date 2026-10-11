# Sprint 4 Task 7: Channel × Format Comparison Dashboard

> **Updated 2026-10-06 (founder instruction):** this task ships the API only (`dashboard.comparison`, types, tests). `compare.tsx` is built by the frontend agent (UI/UX Task 8, E2), not here. Branch is `sprint4_be`. See `reports/task7.md`.

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** Branch: `SPRINT4_BE`
(backend query + API) — a small frontend addition is folded into this task's own scope (see
Implementation) rather than a separate `_FE` task, since it's one new screen reusing the existing
dashboard-screen pattern rather than new interaction design.

**Objective**: Give the app a real side-by-side view of how channels (and, within a channel, formats)
compare — the single piece of this sprint most directly needed to answer "is this channel worth
continuing," and the reason this task is pulled forward in front of the rest of the source proposal's
Phase 4 scheduling (see Additional Notes).
**Duration**: 5-7 hours
**Depends On**: Sprint 4 Task 6 (`formatKey` on `PipelineRun.creationOptions`) for the format
breakdown; works without it for the channel-only breakdown (degrades gracefully — see Fix).
**Owning Component**: `studio/src/models/repositories/dashboard.repository.ts`,
`studio/src/api/routers/dashboard.ts`, `studio/src/types/dashboard.types.ts`, a new app screen.
**Success Criteria**: (1) A real query returns every active channel's totals (views/likes/comments,
video count) side by side, in one call — not one dashboard call per channel manually compared. (2)
Within a channel, rows further broken down by `formatKey` when present. (3) A channel/format with zero
tracked videos yet shows as zero, not omitted or erroring — the comparison should be usable from day
one of a new channel's life, not just once data exists.

## Task Requirement

### R19 — Comparison dashboard, grouped by channel and format

**Where**: `dashboard.repository.ts`'s existing `getContentPerformanceDashboard` is scoped to one
channel (or an unbroken-down "all channels" aggregate) — confirmed by reading the current function
signature (`tenantId, channelId?`) — there is no existing side-by-side, per-channel breakdown anywhere.

**Fix**: a new `getChannelComparisonDashboard(tenantId: string)` function, tenant-scoped like every
other dashboard query. Joins `PerformanceSnapshot` (latest snapshot per `youtubeVideoId`, the same
"most recent snapshot wins" logic `getContentPerformanceDashboard` already uses — reuse it, don't
reimplement) against `PipelineRun` (for `channelId` and `creationOptions->>'formatKey'`) and `Channel`
(for `name`). Returns:

```typescript
// types/dashboard.types.ts — new
export type ChannelComparisonDashboard = {
  channels: {
    channelId: string;
    channelName: string;
    videoCount: number;
    totals: { views: number; likes: number; comments: number };
    avgViewsPerVideo: number | null;
    byFormat: {
      formatKey: string | null; // null groups every run submitted without a format (Freeform)
      videoCount: number;
      totals: { views: number; likes: number; comments: number };
      avgViewsPerVideo: number | null;
    }[];
  }[];
};
```

A channel with zero published/tracked videos still appears, with every numeric field `0` and
`avgViewsPerVideo: null` (division-by-zero handled explicitly, not filtered out) — the whole point is
comparing a brand-new channel against established ones from day one, not only once it has history.
`byFormat` groups every run's `formatKey` (or `null` for Freeform), regardless of whether Sprint 4
Task 6 has landed — if `formatKey` was never set on any run yet (pre-Task-6, or a channel that never
uses formats), `byFormat` is simply `[{ formatKey: null, ...everything }]`, degrading gracefully rather
than requiring Task 6 as a hard dependency.

**Fix — API**: `dashboard.comparison` (new procedure, no input beyond the existing session), returning
`ChannelComparisonDashboard`. Real dollar revenue is explicitly out of scope here — see Additional
Notes below on what "profitable" can actually mean with today's real data.

**Verify**: a real tenant with 2+ channels, one with real tracked performance snapshots and one brand
new with none — a real `dashboard.comparison` call returns both, the new one with all-zero totals, not
omitted. A channel with runs split across 2 real `formatKey` values plus some Freeform runs → `byFormat`
correctly has 3 entries (2 named formats + one `null`/Freeform group), each with its own correct totals
(confirmed by a direct Postgres cross-check against the same data, not just trusting the query's own
output).

## Schema Impact
No schema changes — this is a read-only aggregation over existing tables
(`PerformanceSnapshot`/`PipelineRun`/`Channel`), the same posture every existing `dashboard.repository.ts`
function already has.

## Business Logic / State Transition
No new control flow — purely additive read.

## Implementation

### Files to Modify
- `studio/src/models/repositories/dashboard.repository.ts` — `getChannelComparisonDashboard`
- `studio/src/api/routers/dashboard.ts` — `comparison` procedure
- `studio/src/types/dashboard.types.ts` — `ChannelComparisonDashboard`
- New app screen (e.g. `app/app/(app)/compare.tsx`), reusing the existing dashboard screen's tab/card
  pattern (`dashboard.tsx` — read it first for the established chart/card components before building
  new ones) — a simple table/card-per-channel view, each with an expandable per-format breakdown. No
  new design system, no new charting library.

## Testing

```bash
npm run build && npm run lint && npx tsc --noEmit
npx vitest run dashboard
```

## Report Template
`docs/execution/sprint4/reports/task7.md`.

## Additional Notes

**What "profitable" can actually mean right now**: nothing in this schema captures ad revenue, and
YouTube doesn't expose real monetization data until a channel clears Partner Program thresholds (1,000
subscribers + either 10M Shorts views in 90 days or 4,000 watch hours) — none of which any channel here
will hit in the founder's own 2-3 week solo-testing window. This dashboard is deliberately built around
views/likes/comments (and, once Sprint 2 Task 4's `retentionCurve`/`watchTimeMinutes` are actually
populated — still blocked on the real founder OAuth re-consent tracked in
`KNOWN_ISSUES_AND_BLOCKERS.md` §1 — those too) as the real, honest proxy metrics for "is this
worth continuing," not a revenue figure that doesn't exist yet. Worth saying plainly in the report
so nobody mistakes this view for a profit-and-loss statement.

**Why this task is pulled forward ahead of the rest of this sprint's original phasing**: the source
proposal's own rollout plan put analytics-by-format in a later phase. Given the actual near-term goal
(comparing channels/formats to decide what's worth continuing), a way to see that comparison matters
more, sooner, than most of the pipeline-quality work in Tasks 2-5 — this task can, in practice, be
built and merged in parallel with Tasks 2-5 rather than strictly after them, since it depends only on
Task 1's schema (for `profileVersionId`, unused directly by this task's first cut) and Task 6's
`formatKey` (degrades gracefully without it, per R19's Fix above).

## Links & References
- `dashboard.repository.ts`'s existing `getContentPerformanceDashboard` — the snapshot-selection logic
  this task reuses rather than reimplementing.
- `sprint4/tasks/task6.md` — `formatKey`, this task's optional-but-preferred grouping key.
