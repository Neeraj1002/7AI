# Week 5 Task 2: Bug-Fix & Hardening Pass — Close Out Known Issues Before MVP Lock

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.**

**Objective**: Fix the five real, still-open code-level issues in `docs/execution/KNOWN_ISSUES_AND_BLOCKERS.md` Section 2/3, verified against current source. No new features beyond the captions toggle (item 5), which is genuinely new scope.
**Duration**: 4-6 hours
**Depends On**: Week 5 Task 1 (real end-to-end run) — done.
**Owning Component**: Orchestrator (`run-pipeline/`), Video Intelligence, Video Generation, Publishing
**Success Criteria**: Every item below is fixed with evidence, or explicitly deferred in the report with a stated reason — no silent skips.

## Task Requirement

### B1 — `completeStage`/`currentStage` write race
**Where**: `src/run-pipeline/state-machine.ts` — every stage function (`runIntakeStage`, `runScriptGenerationStage`, ... `runPublishingStage`, `runAnalyticsStage`) calls `completeStage(stage.id, output)` then `updatePipelineRun(runId, { status, currentStage })` as two separate awaited writes.
**Fix**: wrap both in a single Prisma `$transaction` per call site. Check `pipeline-stage.repository.ts`/`pipeline-run.repository.ts` for whether they already accept a shared transaction client, or need a new signature that does.
**Verify**: code review confirming every one of the ~9 call sites now does one atomic write; note in the report if any site was intentionally left as-is and why.

### B2 — `resumeOnStartup()` sweeps every stale `running` run
**Where**: `src/run-pipeline/resume-on-startup.ts`, `listRunsByStatus('running')` with no staleness filter, called unconditionally from `src/index.ts` on every boot.
**Fix**: add a staleness window (env-configurable in `src/config/env.ts`, following the existing `z.coerce.number()` pattern). Before picking a default, check actual `PipelineStage.startedAt`/`completedAt` deltas for `video_generation` (the longest real stage) from real runs already in the DB — don't guess. A run within the window resumes exactly as today via `STAGE_RESUMERS`. A run past the window is **not** re-executed: log it clearly and move it to `needs_attention` with a `lastError` that reads distinctly from a budget/circuit-breaker/quality escalation (e.g. prefixed `"[stale-resume-skip]"`).
**Verify**: two fixture `PipelineRun`s, one recent, one with an artificially backdated latest-stage timestamp — boot (or call `resumeOnStartup()` directly), confirm only the recent one produces new stage/usage rows.

### B3 — Video Intelligence's multimodal review call has no retry-with-backoff
**Where**: `src/agents/video-intelligence/index.ts`, `reviewVideo()` — the `callLLM({...})` call for the multimodal verdict.
**Fix**: wrap just that `callLLM` call in `withRetryAndCircuitBreaker` (from `run-pipeline/retry-with-backoff.ts`), not the whole `reviewVideo` function — the deterministic checks earlier in that function return a result object rather than throwing, which is exactly why a whole-function wrap doesn't compose (per `KNOWN_ISSUES_AND_BLOCKERS.md`'s own note on this). Transient errors retry; a real `verdict: 'fail'` or schema-validation failure (`NonTransientStageError`) must still route to `needs_attention`/regen exactly as today — don't change that path.
**Verify**: force a transient error (simulated network failure) on the multimodal call, confirm it retries before falling back; confirm a real content-quality `fail` verdict is unaffected.

### B4 — Publishing upload retry could double-upload
**Where**: `src/run-pipeline/state-machine.ts`, `runPublishingStage`, specifically `withRetryAndCircuitBreaker(attemptUploadOnce)`.
**Fix**: this is narrower than a general idempotency fix — the crash-resume path (`existingAttempt`/`recordStageProgress` checkpoint) is already correct, don't touch it. The gap is purely inside a single invocation's own retry loop: if `uploadVideo` throws after the request was actually sent (response lost, not a clean pre-send failure), a retry re-uploads. Decide and implement a real mechanism — e.g. after any upload attempt that throws, check the channel's recent uploads for a matching title/description before retrying, or determine from `uploadVideo`'s error shape whether the request definitely never reached YouTube (safe to retry) vs. is ambiguous (should not auto-retry, should go to `needs_attention` instead). Document the actual decision — this is a real judgment call.
**Verify**: whatever mechanism you choose, show a manual test that a forced ambiguous-failure mid-upload does not produce two videos.

### B5 — Captions must be optional, and fix the caption/frame-sampling conflict together
**Where**: `Channel.brandAssets` (existing JSON column, no migration needed), `src/agents/video-generation/plan.ts` (`ProductionPlanSchema`/`CAPTION_STYLES`), `src/agents/video-generation/index.ts` (the `subtitles=` ffmpeg filter construction, caption-segment building, SRT writing), `src/agents/video-intelligence/index.ts` (`extractMiddleFrameBase64` — single midpoint frame).
**Fix, two parts**:
1. Add a `captionsEnabled` key to `brandAssets` (default `true` — preserves current behavior). When `false`: skip `buildCaptionSegments`/SRT writing entirely in `video-generation/index.ts`, and build the ffmpeg filter graph without the `subtitles=` stage (go straight to scale/crop, then watermark overlay if present — same branching pattern already used for the watermark's optional overlay).
2. Fix the frame-sampling conflict `KNOWN_ISSUES_AND_BLOCKERS.md` Section 3 flags: `word-flash` captions can get sampled mid-word by Video Intelligence's single midpoint frame, tripping the regen circuit breaker on a presentation artifact. Pick one real fix, not a workaround: either default away from `word-flash` more strongly (it's already discouraged in `plan.ts`'s system prompt but still selectable), or make `extractMiddleFrameBase64` sample 2-3 frames instead of 1 and have the multimodal prompt judge across all of them. State which you chose and why.
**Schema Impact**: state exactly what changes in `week5/SCHEMA.md` — likely just documenting the new `brandAssets.captionsEnabled` convention, no actual migration.
**Verify**: one render with captions off (confirm no burned-in text), one with captions on (confirm unchanged), and evidence the frame-sampling fix actually changes behavior (e.g. a forced `word-flash` regression run, same technique `dry-run.ts video-gen-regression` already uses).

### Documentation reconciliation
- `docs/execution/KNOWN_ISSUES_AND_BLOCKERS.md`: move B1-B5 out of Sections 2/3 once fixed, dated, with what changed.
- `docs/execution/week5/SCHEMA.md` / `BUSINESS_LOGIC.md`: replace the current "no changes" placeholders with the real B1-B5 deltas.
- `docs/execution/week5/STATUS.md`: add Task 2's row.

## Testing
```bash
npm run build && npm run lint && npm run typecheck
```
Plus each item's manual verification above — no automated test runner exists project-wide; don't build one as a side effect here.

## Report Template
`execution/week5/reports/task2.md`, standard shape. For each of B1-B5: what was actually done, how verified, deviations with reasoning.
