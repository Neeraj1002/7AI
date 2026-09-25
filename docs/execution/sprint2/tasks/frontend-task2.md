# Sprint 2 Frontend Task 2: Content-Quality Signals in Run Detail & Dashboard

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** Branch: `SPRINT2_FE`,
same track-naming note as `frontend-task1.md`.

**Objective**: Surface the content-quality signals Sprint 2's backend already captures but the app
never shows — Script Review's hook score, Publishing's cover-frame/synthetic-media outcome, and
Performance Analytics' real retention curve — so the app is actually where a user would go to see
whether Sprint 2's own stated goals (a stronger cold open, a working custom thumbnail, real retention
data) are landing.
**Duration**: 5-7 hours
**Depends On**: `sprint2-fe-task1.md` not required as a hard dependency, but natural to do second in
the same branch/PR — this task's Run Detail change touches the same screen file.
**Owning Component**: `app/app/(app)/run/[id].tsx`, `app/app/(app)/dashboard.tsx`.
**Success Criteria**: (1) A real run's Script Review section shows its real `hookScore`/`hookNotes`
alongside the existing score/notes. (2) A real published run's summary shows whether its custom cover
frame was actually set and whether it's flagged as synthetic media — both real, not placeholder.
(3) The Dashboard's content-performance group shows a real per-video retention curve once real
`PerformanceSnapshot.retentionCurve` data exists (Sprint 2 Task 4/G1 is still founder-blocked per
`SPRINT1_PENDING.md`'s Sprint 2 section — this task must degrade honestly, not fake data, exactly the
same discipline Frontend Track Task 3 already established for the content-performance group's
original empty state).

## Task Requirement

### FE3 — Hook score in the Gate 1 / Script Review section
**Where**: `run/[id].tsx`'s Gate 1 card reads `scriptReviewStage?.output?.score` /
`...notes` only (confirmed by reading the file) — `sprint2/SCHEMA.md`'s Task 4 (G3) added
`hookScore`/`hookNotes` to that exact same stage output (`ScriptReviewOutputSchema`), never
surfaced here.

**Fix**: one more line in the same card, `Hook score: {hookScore}/10 — {hookNotes}`, read from
`scriptReviewStage?.output?.hookScore`/`hookNotes` the same way the existing `reviewScore`/
`reviewNotes` are read — no new query, this field already arrives in `runs.get`'s existing response
shape (`PipelineStage.output` is a `Json` column already returned whole).

**Verify**: a real run whose Script Review stage actually set `hookScore`/`hookNotes` (any run
executed since Sprint 2 Task 4 shipped) shows the real value in the app, cross-checked against a
direct read of that stage's `output` column.

### FE4 — Cover frame / synthetic-media outcome on a completed run
**Where**: `run/[id].tsx` renders `gate2Passed` as a bare "Outcome: {gate2Outcome}" line and nothing
about `publishing`/`analytics` stages at all (confirmed — the file only ever reads
`script_generation`/`script_review`/`gate1`/`video_review`/`gate2` stage names via `latestStage`).
Sprint 2 Task 5 (H1) added `coverFrameSet: boolean` to the `publishing` stage's own output;
`containsSyntheticMedia` (Task 2, E4) lives there too.

**Fix**: a new, always-collapsed-until-relevant "Published" card, shown once a `publishing` stage
exists in `stages` (`latestStage(stages, 'publishing')`), reading `output.youtubeVideoId` (rendered
as a real `https://youtube.com/watch?v=...` link), `output.coverFrameSet`, and
`output.containsSyntheticMedia` — plain booleans rendered as real/honest labels ("Custom thumbnail:
not set — see known issue" rather than hiding a false value, since Sprint 2's own report for this
exact field states it's currently blocked by a real, external 403 — this card should read as
accurate given that, not as if something is broken in the app).

**Verify**: a real published run (from any real end-to-end test since Sprint 2 Task 5/6 shipped)
shows its real `youtubeVideoId` as a working link and its real `coverFrameSet`/
`containsSyntheticMedia` values, cross-checked against the stage's own `output` column directly.

### FE5 — Real per-video retention curve in the Dashboard's content-performance group
**Where**: `dashboard.tsx`'s content-performance group (per Frontend Track Task 3's own spec:
"views/likes/comments trend, best/worst performers, watch-time/retention where available... expect
this to be sparse or empty... render that honestly") predates Sprint 2 Task 4's real
`retentionCurve` field entirely — it was built against the original single `retentionPct` summary
number, not a real timestamp-level curve.

**Fix**: for a video whose `PerformanceSnapshot.retentionCurve` is non-null, render a real line chart
(reuse whatever charting library Frontend Track Task 3 already chose and justified — check its report
before introducing a second one) of `audienceWatchRatio` against `elapsedVideoTimeRatio`. For every
video where it's still `null` (the common case today, since G1's founder action — Google Cloud
Console enablement + `yt-analytics.readonly` scope — is confirmed still open per
`SPRINT1_PENDING.md`), the existing honest-empty-state treatment stays exactly as Task 3 built it —
this task must not synthesize a fake curve to make the screen look more finished than the real data
currently is.

**Verify**: if any real non-null `retentionCurve` exists in the dev database by the time this task
runs, the chart renders it correctly, cross-checked point-for-point against a direct Postgres read.
If none exists yet (the more likely case, given G1's status), the report states that plainly and
verifies the empty-state path instead — don't claim the chart was proven against real data it never
actually saw.

## Schema Impact
None — this task only reads existing columns Sprint 2 already migrated.

## Business Logic / State Transition
None new — this task is read-only display of already-recorded stage/snapshot data.

## Testing
```bash
npm run build && npm run lint && npm run typecheck
npx expo start
```
Plus FE3/FE4/FE5's real verification above — cross-check every rendered value against a direct
Postgres read, the same discipline every prior frontend task in this project has used.

## Documentation reconciliation
- Same STATUS.md location chosen by `sprint2-fe-task1.md`, this task's row.
- `docs/execution/week5/SPRINT1_PENDING.md`: no change expected — this task doesn't close G1/H1,
  it just makes their real current state visible inside the app instead of only in Telegram/reports.

## Report Template
`execution/sprint2/reports/frontend-task2.md`, standard shape. State FE5's real data availability
plainly — don't claim the retention chart was proven against real data if none existed at test time.
