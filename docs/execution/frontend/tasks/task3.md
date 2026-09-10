# Frontend Track Task 3: Dashboard Screen

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** It defines the Git Workflow (branch/commit/PR steps for this task), the `STATUS.md` update this task must make, and the section structure this file follows. This file states only this task's specifics — the template governs everything else, so don't skip it.

**Objective**: Build the Dashboard screen against Task 1's four `/dashboard/*` endpoints, covering operational health, cost, content performance, and quality signal.
**Duration**: 4–6 hours
**Depends On**: Task 1 (dashboard endpoints must exist and return real data) and Task 2 (this screen lives inside the same app, reusing its navigation/auth setup — don't stand up a second app shell).
**Owning Component**: Same app package as Task 2 (`app/`), a new screen within it.
**Success Criteria**: The Dashboard screen renders real numbers pulled from Task 1's endpoints — not sample/mock data — including an honest empty state for any group still thin on data (content performance especially, until Week 4 Task 3's `PerformanceSnapshot` rows accumulate).

## Task Requirement

Build one screen (which may itself be a few sub-sections or tabs) covering the four data groups already agreed with the founder, per `docs/design_doc/frontend/MOBILE_APP_DESIGN.md` Section 4 and `docs/execution/frontend/BUSINESS_LOGIC.md` Section 3:

1. **Operational health** — stage funnel (count of runs per stage), `needs_attention` list, recent completions, success/failure rate.
2. **Cost** — spend vs. `AgentQuota.budgetCeilingUsd`, by channel and by stage, cost-per-published-video.
3. **Content performance** — from `PerformanceSnapshot`: views/likes/comments trend, best/worst performers, watch-time/retention where available. Expect this to be sparse or empty until real videos have been published and polled a few times — render that honestly (an explicit "no data yet" state), not a chart full of zeros that reads as broken.
4. **Quality/review signal** — `ReviewLog` score distribution, video regen rate (the direct proxy for whether Week 4 Task 1's review-loop fix is actually working), gate approve/edit/reject rates.

### Context
`docs/design_doc/frontend/MOBILE_APP_DESIGN.md` Section 4, `docs/execution/frontend/BUSINESS_LOGIC.md` Section 3 (the `/dashboard/*` endpoint list), `docs/decisions/VIDEO_GENERATION_LOOP_AND_VISUAL_STRATEGY.md` (why video regen rate specifically matters as a metric — it's the evidence for whether that fix worked).

### Acceptance Criteria
- [ ] Charting library choice made and justified in the report — a plain web library (Recharts, Chart.js) will not render inside React Native; pick a React-Native-compatible option (Victory Native and react-native-gifted-charts are both reasonable starting points, but the final choice and reasoning are this task's call).
- [ ] All four data groups rendered from Task 1's real endpoints, channel-scoped consistent with the rest of the app (respects the channel switcher from Task 2).
- [ ] Content-performance group specifically handles the empty/thin-data case gracefully — confirm this by testing against whatever real data exists at the time (likely little to none), not by assuming it'll look fine.
- [ ] Video regen rate is visibly present in the quality-signal group, specifically because it's the metric that will show whether Week 4 Task 1's fix is working over time — don't bury it among other numbers.
- [ ] Pull-to-refresh or an equivalent manual refresh (this is a dashboard the founder will check periodically, not a real-time streaming view — no need to build websockets/polling infrastructure for this).

## Schema Impact
None.

## Business Logic / State Transition
None new.

### Reference
`docs/execution/frontend/tasks/task1.md` (the endpoints), `docs/execution/week4/BUSINESS_LOGIC.md` (Performance Analytics, the source of the content-performance group's data).

## Implementation

### Detailed Steps
1. Confirm Task 1's four `/dashboard/*` endpoints are live and Task 2's app shell/navigation/auth are in place before starting.
2. Pick and justify the charting library.
3. Build the four sections in the order they're likely to have real data: quality signal and operational health first (both have real data from Weeks 1–3 already), cost second, content performance last (most likely to still be empty at this point).
4. Test explicitly against sparse/empty data for content performance, not just against a fully-populated hypothetical.
5. Update `docs/execution/frontend/STATUS.md` with this task's row, closing out the frontend track's initial three tasks.

## Testing

### Test Commands
```bash
npm run build
npm run lint
npm run typecheck
npx expo start   # manual verification
```

### Expected Results
- Dashboard screen renders all four groups from real API data.
- Content-performance group shows a clear empty state rather than a broken-looking chart when no `PerformanceSnapshot` data exists yet.
- Video regen rate is visible and correctly computed (cross-check against a direct Postgres query on `ReviewLog`/regen attempt counts).

### How to Verify
1. Run all test commands above.
2. Cross-check at least one number from each group (e.g., stage funnel counts, a cost figure, the video regen rate) against a direct Postgres query to confirm the dashboard isn't silently wrong.
3. Confirm the screen doesn't crash or render garbage when content-performance data is empty.

## Additional Notes
This task closes out the frontend track's initial three-task scope (API layer → app scaffold → dashboard). No new external credentials needed.

## Links & References
- [docs/design_doc/frontend/MOBILE_APP_DESIGN.md](../../../design_doc/frontend/MOBILE_APP_DESIGN.md) — Section 4
- [docs/execution/frontend/BUSINESS_LOGIC.md](../BUSINESS_LOGIC.md) — Section 3
- [docs/execution/frontend/tasks/task1.md](task1.md), [task2.md](task2.md)
- [docs/decisions/VIDEO_GENERATION_LOOP_AND_VISUAL_STRATEGY.md](../../../decisions/VIDEO_GENERATION_LOOP_AND_VISUAL_STRATEGY.md)
