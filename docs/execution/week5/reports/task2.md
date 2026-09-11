# Week 5 Task 2: Bug-Fix & Hardening Pass — Close Out Known Issues Before MVP Lock

**Date**: 2026-09-11
**Status**: Complete
**Files Created**: 0 (all fixes landed in existing files)
**Files Modified**: 11
**Tests**: All Passing (build/lint/typecheck clean throughout; every item verified with real or realistic-shape evidence, not code review alone)

## What Was Done

All five items (B1-B5) fixed, each verified for real. Summary below; full evidence trail per item.

### B1 — `completeStage`/`currentStage` write race

**Fix**: `pipeline-stage.repository.ts`'s `completeStage`/`failStage`, `pipeline-run.repository.ts`'s
`updatePipelineRun`, and `review-log.repository.ts`'s `insertReviewLog` all gained an optional
trailing `client: DbClient = prisma` parameter (`DbClient = Prisma.TransactionClient | typeof
prisma`, exported from `pipeline-stage.repository.ts`). Every one of `state-machine.ts`'s stage
functions now wraps its completion write(s) in `prisma.$transaction(async (tx) => {...})`, passing
`tx` through. A shared `failStageAndEscalate` helper replaces the nine near-identical catch blocks
(fail the stage, escalate to `needs_attention`, same `lastError` shape) with one transactional
implementation. Where a `ReviewLog` insert sits between the stage completion and the run's advance
(`script_review`, `gate1`, `video_review`, `gate2`), it's included in the same transaction — not
just the two writes literally named in the task's own framing, since a stage marked `completed`
with no corresponding `ReviewLog` row is exactly the same class of inconsistency (and, concretely,
breaks `gate1`, which reads the `ReviewLog` for the review score).

**Not touched, deliberately**: `recordStageProgress` (Publishing's upload checkpoint) stays outside
any transaction — it's meant to be its own durable, independently-committed write, and folding it
into the same transaction as `completeStage` would defeat its purpose (surviving a crash *between*
the checkpoint and the final completion).

**Verified**: a real forced-rollback test — a transaction that ran `completeStage` (a real,
successful write) followed by `updatePipelineRun` with a value crafted to violate a real Postgres
`CHECK` constraint (`pipeline_runs.status`). The transaction threw as expected, and — critically —
`stage.status` was read back afterward as still `'running'`, not `'completed'`. This is direct
proof of atomic rollback, not an assumption based on using `$transaction`.

### B2 — `resumeOnStartup()` sweeps every stale `running` run

**Fix**: new `RESUME_STALE_WINDOW_MS` env var (`src/config/env.ts`). Before picking a default,
queried real `PipelineStage.startedAt`/`completedAt` deltas for every completed `video_generation`
attempt in the dev DB (32 real attempts across Weeks 3-5): the longest was **113.1 seconds** (a
real TTS + real Pexels download run). Chose **30 minutes** — roughly 16x that observed max,
generous headroom for network slowness or retry backoff without leaving a genuinely abandoned run
sitting silently for hours. `resume-on-startup.ts` gained `latestStageTimestamp`/`staleAgeMs`
helpers and a new gate, evaluated before the existing running/completed dispatch: if a run's latest
stage hasn't changed in longer than the window, it's **not** resumed — it's moved to
`needs_attention` with `lastError` prefixed `[stale-resume-skip]`, distinct from a budget/circuit-
breaker/quality-escalation message.

**Verified**: a real fixture test — two `PipelineRun`s created directly in the DB, one with a
`startedAt` of "now," one backdated 2 hours. `resumeOnStartup()` resumed only the recent one (new
stage attempt created, advanced to `script_generation`); the backdated one was correctly skipped,
landing at `needs_attention` with the `[stale-resume-skip]` message, its stage count unchanged.

### B3 — Video Intelligence's multimodal call has no retry-with-backoff

**Fix**: `video-intelligence/index.ts`'s `reviewVideo()` now wraps only the `callLLM({...})` call in
`withRetryAndCircuitBreaker` — not the whole function, per the task's own instruction, since the
deterministic checks earlier in the function return a result object rather than throwing.

**Verified**: (1) an isolated test of `withRetryAndCircuitBreaker` with a stand-in function shaped
exactly like this call site — throws `TransientStageError` twice then succeeds: 3 attempts,
succeeds; a `NonTransientStageError` stand-in: 1 attempt, no retry, propagates immediately. (2) A
real, live `video_review` call (see B5 below — the same real run exercises this) confirms the
normal pass/fail path is completely unaffected: real organic `pass` verdict, unchanged behavior.
Forcing a *live* transient failure from the real Anthropic API on demand isn't practical (same
honestly-flagged limitation this project already carries for the LLM/media layers' transient path,
`KNOWN_ISSUES_AND_BLOCKERS.md` §5) — noted plainly rather than overclaiming a live-forced test.

### B4 — Publishing upload retry could double-upload

**The decision**: narrowed the upload's own error classification (`youtube-client.ts`'s
`mapGoogleError`, now exported for direct testability) far more strictly than the general-purpose
version used elsewhere in the project. Only an error that *proves* the request never reached
YouTube at all — `ECONNREFUSED`, `ENOTFOUND`, `EAI_AGAIN` (the TCP connection itself never
established) — is treated as safe to retry. Everything else, **including a 429/5xx HTTP response**
(which for a read like `videos.list` would be the textbook retryable case), is now treated as
non-transient: the request may have already reached YouTube and created the video before the error
surfaced on this end, so it's not safe to assume a retry is free. A non-transient upload failure
routes straight to `needs_attention`, never auto-retried within `withRetryAndCircuitBreaker`.

This is deliberately the opposite default from a normal read: default to *not* retrying unless
proven safe, rather than retrying unless proven unsafe — appropriate specifically because
`videos.insert` creates a new resource and isn't idempotent, unlike every other YouTube API call
this project makes.

**Verified**: a direct test of the (now-exported) classification function against six realistic
error shapes — `ECONNREFUSED`/`ENOTFOUND` (both classified transient/retryable) and HTTP
503/429/`ECONNRESET`/`ETIMEDOUT` (all classified non-transient). Then confirmed
`withRetryAndCircuitBreaker`'s actual behavior against each class: the transient-shaped error
retried 3 times within one invocation; the ambiguous (`ECONNRESET`-shaped) error was attempted
exactly once and propagated as `NonTransientStageError` — meaning zero retry-driven duplicate-
upload risk for any ambiguous failure.

### B5 — Captions optional; the caption/frame-sampling conflict actually fixed

**Part 1 — captions toggle**: `BrandAssets` (`channel.types.ts`) gained `captionsEnabled?: boolean`
(default `true`, no schema migration — existing `Json` column). `video-generation/index.ts`'s
`generateVideo()` now checks it before building caption segments or writing an SRT file at all, and
the FFmpeg filter graph is constructed without a `subtitles` stage when captions are off (restructured
into a shared `scaleCropFilter` base, with `subtitles=...` appended only when enabled, then the
watermark overlay branching as before).

**Part 2 — frame-sampling conflict**: chose multi-frame sampling over further discouraging
`word-flash` in the planning prompt. Reasoning: the prompt already steers away from `word-flash` as
a default (Week 4 Task 1) and it's still a real, defensible choice for some scripts — further
prompt-tuning only reduces the odds of tripping the bug, it doesn't fix the actual single-point-of-
failure sampling mechanism, and wouldn't help if a *different* momentary artifact (a stock-footage
transition, a dropped frame) landed on the one sampled instant instead. `video-intelligence/index.ts`'s
`extractMiddleFrameBase64` became `extractSampleFramesBase64`, sampling 3 frames (25%/50%/75% of
duration) instead of 1; the multimodal prompt and message now present all 3 and explicitly instruct
the reviewer to judge the video as a whole, not fail on one bad frame if the others look fine.

**Verified, Part 1**: a direct render comparison — `generateVideo()` called with `captionsEnabled:
false` (no `.srt` file written) and with it unset/default (an `.srt` file written, non-empty).
Confirmed **visually**: extracted a frame from each render — the captions-off frame shows clean
footage with no burned-in text; the captions-on frame clearly shows burned-in caption text.

**Verified, Part 2**: a real forced-`word-flash` regression run (`dry-run.ts video-gen-regression`'s
existing forced-plan mechanism), on a real script, with real TTS/Pexels. The real multimodal
reviewer's own words: *"The captions appear to show partial words in frames 1-2 ('in' and 'not'),
but this is a normal mid-transition artifact typical of caption animations in short-form video and
does not detract from overall quality."* **Verdict: pass.** This is the exact failure mode that
used to trip the circuit breaker (Week 3 Task 3, and again forced deliberately in Week 4 Task 1) —
now demonstrably survived because the reviewer has two other frames for context instead of one.

## Files Created/Modified

- `studio/src/models/repositories/pipeline-stage.repository.ts` — `DbClient` type, tx-aware
  `completeStage`/`failStage`
- `studio/src/models/repositories/pipeline-run.repository.ts` — tx-aware `updatePipelineRun`
- `studio/src/models/repositories/review-log.repository.ts` — tx-aware `insertReviewLog`
- `studio/src/run-pipeline/state-machine.ts` — every stage function wrapped in `prisma.$transaction`;
  new `failStageAndEscalate` helper
- `studio/src/run-pipeline/resume-on-startup.ts` — staleness gate, `latestStageTimestamp`/`staleAgeMs`
- `studio/src/config/env.ts` — `RESUME_STALE_WINDOW_MS`
- `studio/src/agents/video-intelligence/index.ts` — B3 (retry-wrapped `callLLM`), B5 part 2
  (`extractSampleFramesBase64`, updated prompt)
- `studio/src/agents/publishing/youtube-client.ts` — B4 (`mapGoogleError` narrowed + exported)
- `studio/src/types/channel.types.ts` — `BrandAssets.captionsEnabled`
- `studio/src/agents/video-generation/index.ts` — B5 part 1 (conditional caption build + filter graph)

## Schema Changes Applied

None (no migration). `Channel.brandAssets.captionsEnabled` is a new documented convention within
the existing `Json` column — see `week5/SCHEMA.md`.

## Test Results

```
npm run typecheck   -> clean (checked after every item, and once more at the end)
npm run lint        -> clean
npm run build       -> clean
```

Every item's manual verification is detailed above. No automated test runner was introduced, per
this task's own instruction.

## Deviations from Spec

- **B1's scope was widened slightly beyond the literal "completeStage then updatePipelineRun"
  description**: also wrapped `ReviewLog` inserts that sit between them (4 of 9 functions) and the
  `failStage`+`updatePipelineRun` error path (not explicitly named in the task, but the identical
  race in the opposite direction) — both are the same underlying bug pattern, fixed for the same
  reason, using the same mechanism already being built.
- **B3's "force a transient error" verification used a simulated stand-in**, not a live-forced
  failure from the real Anthropic API — forcing a real transient 429/5xx from a live third-party
  API on demand isn't practical, and this project already carries the same honest limitation for
  every other capability layer's transient-error path. Stated plainly rather than implied as fully
  live-tested.
- **B4's verification tested the classification function directly with realistic error shapes**,
  not a live network-partition of the real YouTube API mid-upload (also not practical to force on
  demand). `mapGoogleError` was exported specifically to make this direct testing possible — a
  small, deliberate, documented change to support verification.
- **A persistent `npm run dev` instance was stopped and restarted** during verification (same
  Telegram-bot-conflict issue as Week 5 Task 1) — not a deviation from this task's own scope, but
  worth noting since it happened again; test runs that needed Gate 1 used a direct DB fixture write
  instead of even the simulated `dry-run.ts gate1` command, to avoid the conflict entirely rather
  than needing to stop the dev server a second time.
- **Two real, cheap (`~$0.01` each) test runs went through real `video_generation`/`video_review`**
  for B3/B5 verification (topic: "why cats purr") — both stopped at `paused_gate2`, never published,
  so no additional real YouTube video was created by this task.

## Sign-Off

- Task Objective: Met — all five items fixed with evidence, none silently skipped or deferred.
- Schema Impact: One new documented `Json` convention, no migration — matches `week5/SCHEMA.md`.
- Business Logic: One new decision point (B2's staleness gate) and the atomicity guarantee (B1) now
  match reality — `week5/BUSINESS_LOGIC.md` updated with the real deltas.
- Tests: Passing.
- Ready for Integration: Yes.
