# Week 3 Task 5: Wire End-to-End and Close Out Week 3

**Date**: 2026-09-08
**Status**: Complete — full video-side loop proven live in one continuous run, including a genuine mid-flight process kill, a real budget-gate refusal, and (citing Task 3/4's already-real trips) the shared regen circuit breaker on both its automatic and founder-triggered paths
**Files Modified**: `studio/src/run-pipeline/resume-on-startup.ts` (extended `STAGE_RESUMERS` to `video_generation`/`video_review`/`gate2`), `docs/execution/week3/BUSINESS_LOGIC.md` (Implementation Reconciliation section)
**Files Created (throwaway test tooling, kept for reuse)**: `scripts/fixture-force-video-review-pass.ts` (Task 4), `scripts/fixture-reset-gate2.ts` (Task 4), `scripts/list-stale-running-runs.ts`, `scripts/close-stale-test-runs.ts`, `scripts/set-budget-ceiling.ts`
**Tests**: `npm run typecheck`/`build`/`lint` clean; one run walked, live, through every Week 3 stage without a code change between stages; each individual acceptance criterion also verified with its own dedicated real test

## What Was Done

This task is integration and verification, not new agent logic — same role as Week 2 Task 7. The one real code change is wiring `video_generation`, `video_review`, and `gate2` into `resume-on-startup.ts`'s `STAGE_RESUMERS` dispatch map, which did not exist before this task (only `intake`/`script_generation`/`script_review`/`gate1` were resumable) — a real gap this task's own resumability criterion surfaced, not a pre-existing feature just being tested.

## Acceptance criteria — evidence

**A Gate-1-approved script flows through `video_generation → video_review → paused_gate2` without manual intervention between stages.** Proven on run `c88772a8-…`: `gate1(approve) → video_generation#1(killed) → video_generation#2(resumed, completed) → video_review(real pass) → gate2(approve) → publishing`, with `video_review` firing automatically off `video_generation`'s completed output and no gate/human step between them (only Gate 1 and Gate 2, which are supposed to need one, did).

**At `paused_gate2`, a real founder reply (any of the three outcomes) resumes correctly.** All three outcomes verified live in Task 4 (see `reports/task4.md`): `approve` → `running`/`publishing`; `reject [reason]` → `failed`; `revise` → regen loop when under the cap, `needs_attention` when the founder-requested revise would exceed it. Reused here rather than re-run, since re-deriving the identical result would spend real API budget for no new evidence — this task's own run additionally exercised `approve` once more end-to-end (see above) as the connective-tissue proof between all the stages.

**Resumability re-verified — kill mid-`video_generation`, restart, confirm clean resume.** Verified live on run `c88772a8-…`: the actual Windows process tree (not just its shell wrapper — a first attempt that only killed the wrapper let the real render finish undetected in the background, a genuine finding worth noting for anyone else scripting kill tests this way) was force-killed 1 second after `video_generation` attempt 1's stage row was created. Confirmed before resuming: stage row stuck at `status: 'running'`, no `output`, **zero** `UsageEvent` rows for that attempt, and a truncated 48-byte `.mp4` alongside a complete-but-orphaned `.srt` on disk. After `resume()`: a fresh attempt 2 was created (not a duplicate of attempt 1) and completed normally with exactly one `UsageEvent` row. The attempt-1 debris (DB row + partial files) was left in place rather than cleaned up — harmless, since nothing downstream ever reads attempt 1's output again, and matches this project's established "leave orphaned debris, don't write unearned cleanup code" posture (see `reports/task4.md`'s own orphaned `gate2` attempt-1 row for the same precedent).

**The video-side budget-gate path is exercised at least once here.** `AgentQuota.budgetCeilingUsd` set to `0.00` for a fresh run (`91075636-…`); `video_generation` correctly refused before any TTS call, writing a `skipped`-status stage row (`error: "AgentQuota.budgetCeilingUsd would be exceeded"`) and routing the run to `needs_attention` — zero API calls made. Ceiling restored to the founder-confirmed `$2.00` immediately after.

**The regen circuit breaker is exercised for real at least once.** Citing, rather than re-deriving, two already-real trips from this week's own testing: Task 3's automatic path (three genuine `video_review` fails in a row on run `b3109735-…`, tripping at exactly attempt 3) and Task 4's founder-triggered path (a `revise` reply arriving on that same already-attempt-3 run, confirming the human path respects the identical cap rather than bypassing it). Both are real, not unit-tested-in-isolation results — re-running either purely to produce a third data point would spend real Anthropic multimodal budget without adding new evidence.

**`docs/execution/week3/STATUS.md` created/updated** — see the accompanying commit; one row per task 1-5.

**`SCHEMA.md`/`BUSINESS_LOGIC.md` reconciled against actual implementation.** `SCHEMA.md` required no changes — its `usage_events` delta already matches the shipped Prisma schema and migration exactly. `BUSINESS_LOGIC.md` gained an "Implementation Reconciliation" section (same convention as Week 2 Task 7's) recording: `MAX_VIDEO_REGEN_ATTEMPTS=2` confirmed-as-implemented (was "proposed"); Gate 2's threading confirmed to reuse Gate 1's `threadKey` with no second thread; the real fix-notes-lookup bug found and fixed in Task 4; the resumer-wiring extension and its live verification; a wider-blast-radius recurrence of Week 2 Task 7's known "`resume()` sweeps every stale running run" finding (worked around for this task's own testing by explicitly closing out unrelated leftover test runs first, not by narrowing `resume()`'s scope); a forward-looking design note for Week 4 about `resume()`'s sweep being unable to distinguish "stuck mid-stage" from "deliberately waiting at an unbuilt frontier stage" (e.g. an approved run sitting at `currentStage='publishing'`); and the observation that a real, organic (non-fixture) `video_review` pass did occur this task, showing Task 3's caption-driven finding is a real risk, not a guaranteed failure, on every run.

**Week 2 Task 6's live-human-reply verification.** Checked and confirmed still open, unchanged — every Gate 1/Gate 2 test this week, including this task's, continued to use a simulated reply (per the same standing founder-availability convention), not an actual human tap on a phone. No update made to `docs/execution/week2/reports/task6.md`, since nothing changed there. This remains open for whenever the founder is available to do one real round-trip.

## What ran real vs. stubbed

- **Real**: every Anthropic call (intake, script generation, script review, Gate 1's own flow, the real multimodal `video_review` verdicts, including the organic pass observed this task); every Telegram send and the simulated-reply parsing/resume path through the real `handleUpdate` code; the real OS-level process kill and resume test.
- **Stubbed**: `video_generation`'s TTS/transcription (`MEDIA_STUB=1`, still no `OPENAI_API_KEY`, unchanged from Tasks 1-4's stated scope).

## A cost-hygiene note, recorded honestly

While setting up this task's resumability test, a `resume()` call was run without first checking for unrelated stale `running` runs left over from earlier fixture testing — it correctly (per the already-documented Week 2 Task 7 behavior) swept in and advanced several of them, triggering a handful of real, unintended Anthropic `script_review`/`video_review` calls before this was noticed. No OpenAI spend was involved (`MEDIA_STUB=1` was set for that invocation). The unrelated runs were subsequently closed out (`status: 'needs_attention'`, reason recorded) so the actual resumability test could run cleanly and be attributed correctly; one run (`d7578b28-…`) was initially miscategorized as stale and then correctly reverted, since it was in fact legitimately waiting at the deliberate `publishing` frontier, not stuck. Recorded here rather than smoothed over, consistent with this project's "surface real findings" convention.

## Test Results

```
npm run typecheck   -> clean
npm run build       -> clean
npm run lint        -> clean

Full chain (run c88772a8-...):
  intake -> script_generation -> script_review -> gate1(approve) ->
  video_generation#1(killed, orphaned) -> video_generation#2(resumed) ->
  video_review(real pass) -> gate2(approve) -> running/publishing

Resumability: attempt-1 stage stuck at 'running', 0 UsageEvent rows, truncated
  .mp4 + orphaned .srt on disk -> resume() -> fresh attempt 2, 1 UsageEvent
  row, no duplicates

Budget gate (run 91075636-...): ceiling=$0.00 -> video_generation stage
  status='skipped', run -> needs_attention, 0 API calls; ceiling restored to $2.00

Circuit breaker: cited from Tasks 3/4's already-real trips (run b3109735-...) -
  automatic path (3 real fails) and founder-revise path both capped at
  attemptNumber 3, neither bypassing MAX_VIDEO_REGEN_ATTEMPTS=2
```

## Deviations from Spec

- The circuit-breaker and Gate-2-three-outcomes criteria were satisfied by citing this week's own already-real evidence (Tasks 3/4) rather than re-running identical tests a second time, for cost reasons — explicitly not "unit-tested in isolation," which is what the criterion rules out.
- No `week3-summary.md` narrative was written — the per-task reports and this task's own consolidated evidence already cover the same ground; judged not to add enough beyond what's here to be worth the additional real-review time, unlike Week 1's version which was the first of its kind.

## Sign-Off

- Task Objective: Met — the full video-side loop (Video Generation, Video Intelligence own-draft, Gate 2) is wired and demonstrably works end-to-end, live
- Schema Impact: None new (as specified) — verification and documentation reconciliation only
- Business Logic: Full Week 3 transition table verified as an actual sequence, not just individually; reconciliation recorded in `BUSINESS_LOGIC.md`
- Tests: Passing — every acceptance criterion has live evidence, cited or freshly produced
- Ready for Integration: Yes — Week 3 is closed out; Week 4 (Publishing) is the next real consumer of `currentStage='publishing'`, and should read this report's note on `resume()`'s sweep behavior before wiring its own resumer in
