# Sprint 2 Task 4: Retention-Curve Capture + Hook-First Script Rubric

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.**

**Objective**: Start capturing YouTube's real timestamp-level retention curve now, before
Continuous Learning exists to read it; add an explicit first-two-seconds hook score to Script
Review.
**Duration**: 5-7 hours of build time; G1 below is externally gated on a founder action, not on
effort.
**Depends On**: None. Track C (this task, Task 5, Task 6) has near-zero coupling to Track B (Tasks
1-3) per `SPRINT_ROADMAP.md` — can run in parallel with, or before, any of them.
**Owning Component**: Performance Analytics (`agents/performance-analytics/`), Script Review,
Shared Schema.
**Success Criteria**: (1) A real published video's `retentionCurve` is confirmed non-null and
correctly shaped via a direct Analytics API query, once the founder grants the scope in G1. (2)
Until then, the stub path's shape matches the Analytics API's documented response. (3) `hookScore`
distinguishes a strong cold open from a slow, logo-first intro on paired fixture scripts.

## Task Requirement

### G1 — Founder action required first: the `yt-analytics.readonly` OAuth scope
**Where**: `docs/execution/KNOWN_ISSUES_AND_BLOCKERS.md` §6 already flags this —
`watchTimeMinutes`/`retentionPct` exist in `PerformanceSnapshot` but have never been populated for
real; the current YouTube OAuth token only carries `youtube.upload`/`youtube.readonly` (Week 1 Task
7's original request). The YouTube Analytics API — distinct from the Data API `videos.list` calls
already working — needs `https://www.googleapis.com/auth/yt-analytics.readonly` explicitly granted.

This is a real, external, founder-blocking step — same posture Week 1 Task 7 and
`MVP_PART2_MULTI_USER_AND_FLEXIBLE_CREATION.md`'s quota-increase note both use: hand this off first.
Unlike a quota increase, re-authorizing the existing OAuth app with an added scope is same-day once
the founder clicks through consent — the actual risk is forgetting to ask, not a queue. Until
granted, G2 below is built and tested against the YouTube Analytics API's documented response shape
with a stub (`*_STUB=1`, same convention every other external integration in this project uses) —
don't block the whole task on the founder's click.

### G2 — Real retention-curve capture
**Where**: `PerformanceSnapshot` currently stores one `retentionPct` per snapshot — a single
number, not a curve. **Schema**: add `PerformanceSnapshot.retentionCurve Json?` (nullable — an array
of `{ elapsedVideoTimeRatio: number, audienceWatchRatio: number }` points, the real
dimension/metric pair the YouTube Analytics API's audience-retention report returns). **Fix**:
`agents/performance-analytics/` (wherever `recordSnapshot` lives) gains a real call to the
Analytics API's `reports.query` for the audience-retention report, alongside the existing Data-API
`views`/`likes`/`comments` polling call — same periodic-poll cadence
(`ANALYTICS_POLL_INTERVAL_MS`) already in place, not a new schedule. Nothing reads `retentionCurve`
yet — that's expected and correct, per the design doc's own "cheap now, expensive to reconstruct
later" reasoning; Continuous Learning (a later sprint) is what eventually reads it. **Verify**: once
G1's scope is granted, one real published video's `retentionCurve` is confirmed non-null and shaped
as real, monotonic-in-time elapsed-ratio points via a direct query — same "confirm via the real
API, not just the DB row" discipline this project already holds for `privacyStatus`. Until then,
verify the stub path's shape against the Analytics API's documented schema.

### G3 — Hook-first script rubric dimension
**Where**: `agents/script-review/index.ts`'s `ScriptReviewOutputSchema`/`SYSTEM_PROMPT` score
quality/engagement/clarity/brand/video-gen-fit as one bundle — nothing isolates the first 1-2
seconds specifically, which is disproportionately what determines whether a Short survives the
first swipe per the design doc. **Fix**: add `hookScore: z.number().min(0).max(10)` (separate from
the bundled `score`, not folded into it — a script can score fine overall while still opening weak)
plus `hookNotes: string`. The system prompt gains an explicit paragraph naming known Shorts
retention patterns to check the opening against: a cold open (no slow intro), no logo/branding
before content starts, a question or visual surprise stated immediately — same "extend the existing
cheap-tier call, don't add a new one" principle Week 5 Task 4's C3 (`factualConcerns`) already
established on this same call. **Verify**: a script with a genuinely strong cold open scores
`hookScore` distinctly higher than a fixture script with a slow, logo-first intro on the same
underlying topic/quality — same paired-comparison technique C3's fact-check verification used.

## Schema Impact
Tables Modified
- `performance_snapshots` — new `retentionCurve` Json column (nullable, no backfill — every existing
  row is correctly `null`).

Migration File
A real Prisma migration for G2. No schema change for G3 (`PipelineStage.output` Json already
carries the review payload).

## Business Logic / State Transition

### What this task implements
G2 adds a second Analytics-API call to the existing periodic poll cycle, gated entirely on scope
availability (stub until G1 closes). G3 adds a new scored dimension to an existing review call — no
new state transitions in either case.

### Failure Modes & Handling
Before G1 closes, a real (non-stub) attempt to call the Analytics API without the scope should fail
loudly and specifically (a clear "scope not granted" error, not a generic auth failure) so it's
obviously a founder-action gap, not a code bug, if someone runs this prematurely.

## Testing
```bash
npm run build && npm run lint && npm run typecheck && npm test
```
Plus G1 (stub-verified until granted, then real) and G3's paired comparison above.

### Documentation reconciliation
- `docs/execution/sprint2/SCHEMA.md`, `BUSINESS_LOGIC.md`, `STATUS.md`.
- `docs/execution/KNOWN_ISSUES_AND_BLOCKERS.md`: add G1 as a founder-action-required row (Sprint 2's
  equivalent of §1) until the scope is granted; move it once closed, same convention §1 already
  used for Week 1 Task 7's OAuth.

## Report Template
`execution/sprint2/reports/task4.md`, standard shape. State G1's status plainly (granted/not yet) —
don't let G2's report imply real data exists if it's still stub-verified only.
