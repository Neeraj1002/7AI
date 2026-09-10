# Frontend Track Task 3: Dashboard Screen

**Date**: 2026-09-09
**Status**: Complete
**Files Created**: 1
**Files Modified**: 6 (Task 1's dashboard router/repository, gaining channel scoping — see Deviations)
**Tests**: All Passing

## What Was Done

Built one Dashboard screen (`app/app/(app)/dashboard.tsx`) covering all four groups from `MOBILE_APP_DESIGN.md` Section 4 / `BUSINESS_LOGIC.md` Section 3, consuming Task 1's four `/dashboard/*` endpoints — real data throughout, no sample/mock values. Sections are ordered per the task's own guidance: quality signal and operational health first, cost second, content performance last.

Before building the screen itself, discovered and fixed a real gap in Task 1's dashboard endpoints: they weren't channel-scoped at all, even though task3.md explicitly requires the Dashboard to "respect the channel switcher from Task 2." Added an optional `channelId` parameter to all four `dashboard.*` tRPC procedures and threaded it through every underlying query in `dashboard.repository.ts` (Prisma `where` clauses for the Prisma-based queries, a small `channelFilterSql` helper composing `Prisma.sql` fragments for the raw ones).

## Files Created/Modified

- Created: `app/app/(app)/dashboard.tsx`
- Modified: `studio/src/models/repositories/dashboard.repository.ts` (channel scoping), `studio/src/api/routers/dashboard.ts` (channel scoping), `app/app/(app)/_layout.tsx` (registered the route), `app/app/(app)/index.tsx` (added a "View Dashboard" link), `app/package.json`/`package-lock.json` (charting library), `docs/execution/frontend/STATUS.md`
- Dependencies added (`app/`): `react-native-gifted-charts`, `react-native-svg`, `expo-linear-gradient` (a runtime dependency of `react-native-gifted-charts` itself — see Deviations)

## Charting Library Choice

**`react-native-gifted-charts`**, one of the two options `task3.md` itself names as reasonable. Chosen over Victory Native (XL) because:
- It's built on `react-native-svg`, which has real (if imperfect) web support via `react-native-web` — relevant in this environment specifically because there's no Android/iOS simulator, so `expo start --web` is the only way to actually see a chart render during development (see Task 2's report for the same constraint). Victory Native XL renders via `@shopify/react-native-skia`, which does not have a comparable web story in this setup.
- It renders real native views (SVG), not a canvas/webview escape hatch — consistent with the whole app's "not a webview" framing from `MOBILE_APP_DESIGN.md` Section 2.
- Its API (`BarChart`, `LineChart`, plain array-of-`{value, label}` data) is simple enough to keep the screen's own code close to "plain lists and forms," matching the project's repeated "keep it minimal" instruction rather than reaching for a heavier charting framework's full feature surface.

Trade-off, stated honestly: it needed an unexpected runtime dependency (`expo-linear-gradient` — the package throws at import time if that's missing, even when no gradient fill is used) discovered only by actually running the app, not by reading its docs first.

## Test Results

```
npm run build       (both packages) — pass
npm run lint         (both packages) — pass, 0 warnings
npm run typecheck    (both packages) — pass, no errors
```

### Real end-to-end verification — via the actual running Dashboard screen

Navigated to `/dashboard` in the running app (same `expo start --web` + Browser-tool setup as Task 2, against the live orchestrator/API/Postgres) and confirmed all four groups render real numbers:

- **Quality signal**: video regen rate **43% (9 of 21 runs)**, Script Review score distribution chart (scores 6/7/8), Gate 1 rates (approve 18, edit 3, reject 2), Gate 2 rates (approve 5, revise 2, reject 1).
- **Operational health**: success rate **71% (5/7)**, stage funnel chart across all 7 stages, 22 needs-attention rows, 5 recent completions.
- **Cost**: total spend **$0.9114** of a $2.00 budget ceiling, cost-per-published-video **$0.1823** (5 published), by-channel and by-stage breakdowns.
- **Content performance**: `available: true` with real (stub-video) data — 5 videos tracked, 1403 total views, a views trend chart, best/worst performers by view count.

### Cross-checked against direct Postgres queries (acceptance criterion — one number per group, done for all four)

```
direct totalSpendUsd = 0.9114                         — matches Cost's $0.9114 exactly
direct completed = 5 failed = 2 rate = 0.714...        — matches Operational's 71% (5/7) exactly
direct video regen: reached=21 withRegen=9 (43%)       — matches Quality's 43% (9 of 21) exactly
direct videosTracked = 5                               — matches Content's "Videos tracked: 5" exactly
```

### Channel scoping verified as real, not cosmetic

Queried `dashboard.operational`, `dashboard.quality`, `dashboard.cost`, and `dashboard.content` via curl with a syntactically valid but non-existent `channelId` and confirmed every one returns a genuinely empty/zero shape (`stageFunnel: []`, `totalSpendUsd: 0`, `available: false`, etc.) rather than silently ignoring the filter — proving the parameter actually narrows the underlying queries.

### Content-performance empty state

The exact API response shape the screen's `content.data.available` check renders against was directly confirmed via the channel-scoping test above (`available: false` with an all-zero/empty payload for a channel with no data) — this is the same shape that would occur for any channel genuinely thin on `PerformanceSnapshot` data. The screen's conditional render (`available ? <charts> : <EmptyNote text="No content performance data yet...">`) was verified by code review; see Deviations for why the *rendered* empty state itself (as opposed to the API response feeding it) wasn't separately screenshotted.

## Deviations from Spec

1. **Task 1's dashboard endpoints weren't channel-scoped — fixed as part of this task.** This wasn't a Task 3 acceptance criterion by itself, but task3.md's requirement that the Dashboard "respect the channel switcher from Task 2" isn't satisfiable without it. Documented here rather than silently backfilling Task 1's report; `docs/execution/frontend/BUSINESS_LOGIC.md`/`SCHEMA.md` don't need updates since this doesn't change any schema or transition, only adds an optional query parameter.
2. **No screenshot of the rendered charts/empty-state exists in this report.** The Browser tool's screenshot capability timed out consistently in this session ("the page did not finish rendering in time... Claude's window is minimized or hidden"), so verification relied on the accessibility-tree text extraction (`get_page_text`) and network-request inspection instead — both confirm real data reached the real DOM (chart axis labels, category labels, and values were all present and correct), but a visual screenshot would have been the stronger artifact. The content-performance empty state specifically was verified at the API-response level (see Test Results) rather than as a rendered screenshot, for the same reason plus the practical one that the shared dev database currently has real data for every group, so there was no genuinely-empty channel to point the running app's channel switcher at.
3. **`expo-linear-gradient` added as an undeclared transitive requirement of `react-native-gifted-charts`.** Not mentioned in the task spec; discovered when the app crashed on the Dashboard route with "Gradient package was not found." No gradient fills are actually used by this screen — the dependency is required just to satisfy the library's own import-time check.
4. **Same environment constraint as Task 2**: no Android/iOS simulator or physical device was available, so this screen's real-device behavior (chart rendering via native SVG rather than the web SVG polyfill, pull-to-refresh's actual touch gesture) is implemented and type-checked but wasn't verified beyond the web-preview path.

## Sign-Off
- Task Objective: Met.
- Schema Impact: None (matches SCHEMA.md).
- Business Logic: None new (matches BUSINESS_LOGIC.md — Dashboard consumes existing data, introduces no transitions; the channel-scoping addition to Task 1's endpoints is a parameter, not new business logic).
- Tests: Passing; real E2E verification performed via the running app, with all four required Postgres cross-checks done.
- Ready for Integration: Yes — this closes out the frontend track's initial three-task scope.
