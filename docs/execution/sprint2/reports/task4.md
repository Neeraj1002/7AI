# Sprint 2 Task 4: Retention-Curve Capture + Hook-First Script Rubric

**Date**: 2026-09-15
**Status**: Complete (G1 explicitly **not granted** — stated plainly, per the task's own instruction)
**Files Created**: 2 (`studio/src/agents/performance-analytics/{youtube-analytics-client,youtube-analytics-client.test}.ts`)
**Files Modified**: 6
**Tests**: All Passing (`npm run build && npm run lint && npm run typecheck && npm test` — 66 tests,
all clean)

## G1 status — read this first

**Not granted.** Confirmed **live**, against this project's own real OAuth credentials, that the
actual blocker today is two separate, real things:

1. The YouTube Analytics API is **not enabled** for this project's Google Cloud console at all — a
   real call returns a genuine `403 PERMISSION_DENIED` (`reason: SERVICE_DISABLED`/
   `accessNotConfigured`): *"YouTube Analytics API has not been used in project 714472645139 before
   or it is disabled. Enable it by visiting
   https://console.developers.google.com/apis/api/youtubeanalytics.googleapis.com/overview?project=714472645139
   then retry."*
2. The OAuth token also doesn't carry `yt-analytics.readonly` (the original Week 1 Task 7 grant only
   requested `youtube.upload`/`youtube.readonly`) — not yet independently confirmed as its own
   distinct error, since (1) blocks the request before a scope check is even reached.

This is a real, live-confirmed finding, not an assumption carried over from the task spec — see
`KNOWN_ISSUES_AND_BLOCKERS.md` §1 for the full write-up. G2 below is fully built and verified
against a real stub, and the real (non-stub) path is verified to fail loudly and specifically
rather than silently — but **no real retention-curve data exists anywhere in this system as of this
report**, and this report does not imply otherwise.

## What Was Done

### G2 — Real retention-curve capture

Real Prisma migration (`prisma migrate dev --name sprint2_retention_curve`):
`PerformanceSnapshot.retentionCurve Json?`. New `youtube-analytics-client.ts` (the only file allowed
to touch the YouTube Analytics API v2's `reports.query` endpoint, mirroring every other capability
layer's client.ts boundary) queries the real, documented audience-retention report shape
(`dimensions=elapsedVideoTimeRatio`, `metrics=audienceWatchRatio`, `ids=channel==MINE`, filtered to
one video).

`recordSnapshot` (`performance-analytics/index.ts`) gains a second, **deliberately isolated** fetch:
`fetchRetentionCurve` is wrapped in its own try/catch, logging and returning `undefined` on any
failure rather than throwing — this is a real design decision, not just defensive habit. G1's
founder action is genuinely, currently ungranted, so every real snapshot taken before it closes
would otherwise throw and lose the `views`/`likes`/`comments` capture that's worked reliably since
Week 4, over a brand-new capability nothing even reads yet. `YOUTUBE_ANALYTICS_STUB=1` (a new,
separate flag from `YOUTUBE_STUB` — the real blocker here is fundamentally different, not a missing
credential) swaps in `stubFetchRetentionCurve`, which returns a real, plausibly-shaped 21-point
curve (elapsed ratios 0.00 through 1.00 in fixed 0.05 increments, watch ratio trending down from
~1.0 with realistic jitter) matching the Analytics API's documented response shape.

`classifyAnalyticsError` (exported, mirroring Publishing's own `mapGoogleError` precedent) turns a
real 403 into one of two clear, specific messages — "API not enabled" or "scope not granted" — each
pointing at `KNOWN_ISSUES_AND_BLOCKERS.md` §1, rather than a generic auth failure someone has to dig
through a stack trace to diagnose. This classification was built directly against the **real** error
response captured live (see Verification below), not guessed from documentation.

### G3 — Hook-first script rubric dimension

`ScriptReviewOutputSchema` gained `hookScore: z.number().min(0).max(10)` (separate from the bundled
`score`) and `hookNotes: z.string().min(1)`. The system prompt gained an explicit paragraph naming
the exact retention patterns to judge the opening against: a genuine cold open, no logo/branding
before content starts, and an immediate question/surprising claim rather than a generic wind-up.
`state-machine.ts`'s `runScriptReviewStage` threads a new `hookNote` into the same `ReviewLog.rationale`
text Gate 1 already reads, mirroring exactly how Week 5 Task 4's C3 (`factualConcerns`) surfaced its
own finding — the founder sees the hook assessment at Gate 1, not just in the raw stage output.

## Verification — real, live, per the task's own bar

1. **G1's real blocker, confirmed live, not assumed.** A direct real API call (temporary scratch
   script, deleted after) against this project's own real `YOUTUBE_CLIENT_ID`/`SECRET`/
   `REFRESH_TOKEN` returned the exact `403 SERVICE_DISABLED`/`accessNotConfigured` response quoted
   above — this is what informed `classifyAnalyticsError`'s design, not documentation alone.
2. **The stub path matches the documented response shape and writes a real DB row.** A real
   `recordSnapshot` call with `YOUTUBE_ANALYTICS_STUB=1` (against a real, existing `PipelineRun` and
   a real published `youtubeVideoId` from Week 5 Task 5's genuinely public video) produced a real
   `PerformanceSnapshot` row with a 21-point `retentionCurve`, `elapsedVideoTimeRatio` running 0 to
   1, `audienceWatchRatio` trending realistically downward.
3. **The real (non-stub) path fails loudly and specifically, and does not break the rest of the
   snapshot.** The same call without the stub flag hit the real, currently-403ing endpoint;
   `classifyAnalyticsError` correctly produced *"YouTube Analytics API call failed — the API itself
   is not enabled for this project's Google Cloud console (a real founder action, see
   KNOWN_ISSUES_AND_BLOCKERS.md §1, distinct from the OAuth scope grant)"* — logged, not thrown —
   and the resulting `PerformanceSnapshot` row still correctly captured real `views: 280, likes: 2,
   comments: 0` with `retentionCurve: null`. Exactly the isolation this task's own design required.
4. **`classifyAnalyticsError`'s classification is locked in by a real regression test**
   (`youtube-analytics-client.test.ts`, 6 assertions) built directly against the real captured error
   body, not a synthetic guess — plus the 429/500/unrecognized-error classification cases.
5. **G3's paired comparison, real, live, contrasting.** Two real `reviewScript` calls on the same
   underlying topic/quality (a phone-privacy Short) — a genuine cold open ("Your phone is listening
   to you right now — and no, that's not a conspiracy theory...") scored **`hookScore: 8`**, with
   notes explicitly praising the immediate tension and absence of preamble; a slow, generic,
   welcome-back-to-the-channel-style intro on the identical underlying content scored **`hookScore:
   2`**, with notes explicitly naming the "textbook slow wind-up" and generic channel-intro patter as
   the problem. A clear, well-reasoned 6-point gap, not a marginal difference.

## Files Created/Modified

- Created:
  - `studio/src/agents/performance-analytics/youtube-analytics-client.ts`
  - `studio/src/agents/performance-analytics/youtube-analytics-client.test.ts`
- Modified:
  - `studio/src/models/schema.prisma` — `PerformanceSnapshot.retentionCurve`
  - `studio/src/types/performance-snapshot.types.ts` — `RetentionCurvePoint`, domain type field
  - `studio/src/models/repositories/performance-snapshot.repository.ts` — persists/reads the new column
  - `studio/src/agents/performance-analytics/stub.ts` — `stubFetchRetentionCurve`
  - `studio/src/agents/performance-analytics/index.ts` — isolated `fetchRetentionCurve`, threaded into `recordSnapshot`
  - `studio/src/config/env.ts` — `YOUTUBE_ANALYTICS_STUB`
  - `studio/src/agents/script-review/index.ts` — `hookScore`/`hookNotes`, prompt paragraph
  - `studio/src/run-pipeline/state-machine.ts` — `hookNote` threaded into `ReviewLog.rationale`

## Schema Changes Applied

`PerformanceSnapshot.retentionCurve Json?` — real migration
(`20260915165246_sprint2_retention_curve`). See `sprint2/SCHEMA.md`.

## Test Results

```
npm run build       -> clean
npm run lint         -> clean
npm run typecheck    -> clean
npm test             -> 11 test files passed (11), 66 tests passed (66)
```

## Deviations from Spec

- **G1's real blocker turned out to be two things, not the one the task spec named.** The task
  framed G1 purely as a scope-grant step ("re-authorizing the existing OAuth app with an added
  scope is same-day once the founder clicks through consent"). Live testing found the YouTube
  Analytics API isn't even *enabled* for the Google Cloud project yet — a separate, prerequisite
  Cloud Console action, confirmed via the real 403 response's own error body, not assumed. Both are
  documented plainly in `KNOWN_ISSUES_AND_BLOCKERS.md` §1 rather than only the one the spec named.
- **A dedicated `YOUTUBE_ANALYTICS_STUB` flag, not a reuse of `YOUTUBE_STUB`.** The existing
  `YOUTUBE_STUB` flag exists because a credential was *missing*; here, real credentials exist and
  work fine for the Data API — the Analytics API is blocked by enablement/scope, a functionally
  different kind of gap. A separate flag keeps that distinction honest and lets the two capabilities
  be tested/enabled independently once G1 actually closes.
- **`recordSnapshot`'s retention-curve fetch is isolated from its existing stats fetch, not
  parallel/equivalent to it.** The task's own Failure Modes section only specified how a real call
  *without* the scope should fail (loudly); it didn't specify whether that failure should be allowed
  to break the rest of the snapshot. Given G1 is genuinely, currently ungranted, propagating the
  failure would have meant every real snapshot from this point forward throws instead of recording
  the `views`/`likes`/`comments` data that already works — judged as the wrong tradeoff and isolated
  instead, documented as a deliberate design decision in `sprint2/BUSINESS_LOGIC.md`.

## Sign-Off

- Task Objective: Met — retention-curve capture is fully built, real-verified via its stub path and
  a real (correctly-failing) live call; G1's actual status is stated plainly, not implied to be
  further along than it is. `hookScore` distinguishes a strong cold open from a slow intro by a
  clear, well-reasoned margin on paired real fixture scripts.
- Schema Impact: One real migration — `PerformanceSnapshot.retentionCurve`. See `sprint2/SCHEMA.md`.
- Business Logic: `sprint2/BUSINESS_LOGIC.md` updated with the isolation design decision and the
  real G1 finding.
- Tests: Passing (66/66), plus real live verification for every G1-G3 item above.
- Ready for Integration: Yes. G1 remains genuinely open — tracked in `KNOWN_ISSUES_AND_BLOCKERS.md`
  §1, not silently left for someone else to rediscover.
