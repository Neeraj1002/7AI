# Week 4 Task 4: Wire End-to-End, First Full Internal Dry Run, and Close Out Week 4

**Date**: 2026-09-09
**Status**: Partially complete — see "What's still open" below. **Not** the real, credentialed end-to-end run `MVP_ROADMAP_OCT15.md` Section 12 calls for; that's still pending tonight's keys, exactly as flagged before this task started.
**Files Created**: 0 (report + STATUS.md/doc updates only)
**Files Modified**: 3 (`env.ts`, `state-machine.ts` — a test-only kill hook; `KNOWN_ISSUES_AND_BLOCKERS.md`, `BUSINESS_LOGIC.md` — reconciliation)
**Tests**: All Passing — full nine-stage chain proven mechanically against stubs; mid-`publishing` kill/resume proven live.

## What Was Done

Per explicit instruction for this task: run everything through stubs end-to-end and confirm the
full nine-stage chain plus the mid-`publishing` kill/resume test, without attempting the real
founder-reply gates (the founder does that tonight, once `OPENAI_API_KEY`/`PEXELS_API_KEY`/YouTube
OAuth land). This report states plainly what's real vs. stubbed rather than implying more realism
than actually happened.

### Full nine-stage chain — mechanically proven

A fresh run (`fa729176-...`, "why the ocean looks blue") went through all nine stages —
`intake → script_generation → script_review → gate1 → video_generation → video_review → gate2 →
publishing → analytics` — reaching `PipelineRun.status = 'completed'`. Confirmed via direct DB
query: exactly one `pipeline_stages` row per stage name, no gaps, no duplicates.

**What was real in this run**: intake, script generation, script review, and Publishing's
metadata-generation call are all real Anthropic calls (title/description/tags genuinely on-topic:
"Why Is the Ocean Actually Blue?"). Gate 1 and Gate 2 used simulated replies (real Telegram
messages sent, replies fed via the same `simulateIncomingTelegramMessage` path every prior week
used when the founder wasn't available for a live round trip — not the real founder tapping a
button, per this task's explicit instruction not to attempt that here). `video_generation` ran a
real production-planning call but stub TTS/transcription (`MEDIA_STUB=1`) and stub stock footage
(`STOCK_FOOTAGE_STUB=1`). `video_review`'s pass was fixture-forced
(`scripts/fixture-force-video-review-pass.ts`, a pre-existing Week 3 test helper) rather than
organic — Task 1's real testing already showed the stub footage's synthetic test pattern
reliably fails the real multimodal review for lacking real topical content (expected; real Pexels
footage should resolve this), so forcing the pass here avoided repeatedly re-spending real Gate
2/video-generation budget to prove a video_review outcome Task 1 already characterized in depth.
Publishing's upload and Performance Analytics' stats both used `YOUTUBE_STUB=1` (Week 1 Task 7's
OAuth still open).

### Mid-`publishing` kill/resume — proven live, with a genuine finding along the way

This is "the one new failure point this week" the task calls out, and it got a real, live test:

1. Added a test-only hook (`PUBLISHING_TEST_KILL_DELAY_MS`, zero/no-op by default) that sleeps
   after `recordStageProgress` checkpoints a successful upload but before `completeStage` runs —
   a deliberate window to kill the process in, the same spirit as `INTAKE_STAGE_STUB` and every
   other test-only env flag already in this project.
2. Started `publish` in the background with a 60s delay, waited for the real checkpoint log line
   confirming a real `youtubeVideoId` had been recorded, then killed the process.
3. **First kill attempt failed silently** — stopping the backgrounded shell task didn't stop the
   actual `node.exe` several process layers deep (`npx` → the `tsx` CLI → the real runtime), which
   kept running undetected and completed on its own. This is the exact same pitfall Week 3 Task 5
   already hit once (documented there); recurred here for the same underlying reason. Caught by
   checking `Get-CimInstance Win32_Process` for the actual PIDs in the process tree and
   force-killing all three directly, not the wrapper. Now noted in `KNOWN_ISSUES_AND_BLOCKERS.md`
   as a standing testing-methodology reminder, not just a one-off.
4. **Second (real) kill attempt**: confirmed via direct DB read, *before* resuming, that the
   `publishing` stage was still `status: 'running'` with the checkpointed `youtubeVideoId` already
   present in its `output` — genuine proof the process died mid-flight, after the upload succeeded
   but before the stage was marked complete.
5. Ran `resume` for real. Log output: `"attempt 1 already recorded a successful upload before the
   process stopped — completing the stage without uploading again"`. DB confirms: **exactly one**
   `publishing` stage attempt, `status: 'completed'`, with the **same** `youtubeVideoId` from the
   pre-kill checkpoint. No second upload call, no duplicate attempt row. `currentStage` correctly
   advanced to `analytics`, and the run went on to reach `completed` normally.

This is the acceptance criterion satisfied with real, verifiable evidence — not a synthetic
unit-test stand-in.

### A live recurrence of an already-flagged risk

`resume()`'s calls during this test also swept up two genuine leftover Week 3 test runs that had
been sitting at `currentStage='publishing'` since before any resumer existed for that stage —
exactly the scenario `KNOWN_ISSUES_AND_BLOCKERS.md` had already predicted as a risk of wiring a
`publishing` resumer in. They completed cleanly (no duplicate uploads — Task 2's checkpoint held
for them too), but it's a real, live materialization of a previously-only-theoretical risk, now
documented with a concrete incident rather than a hypothetical. Not fixed this task — it's a
product decision (how to distinguish "stuck" from "waiting on a not-yet-built resumer"), correctly
out of this task's scope, but flagged plainly rather than left implicit.

### Concurrent-session collision (unrelated to Week 4's own work, worth recording)

Mid-task, this session's shared working directory was switched to a different local branch
(`FRONTEND_FE`) by what appears to be the founder's own concurrent session working a separate
frontend track — `docs/execution/frontend/` and an update to
`docs/execution/templates/TASK_TEMPLATE.md` (introducing a two-track `_BE`/`_FE` branch-naming
convention, explicitly citing `WEEK4_BE` as this exact week's example name) both appeared in the
working tree mid-session. This briefly broke one in-flight background test (a `publish` command
run against the swapped-out branch's older `dry-run.ts`, which lacked the `publish` command) and
discarded one small uncommitted edit (the kill-delay hook, redone in under a minute — nothing
committed was lost; all three prior task commits were confirmed intact on `week-4` throughout).
Recovered by returning to the `week-4` branch and re-verifying build/lint/typecheck before
continuing. **Not fixed/renamed**: this week's branch and PR (#5) stayed as `week-4`/"Week 4: ..."
rather than being renamed to the new `WEEK4_BE` convention mid-flight, since renaming an
already-open, already-pushed PR is a visible action worth the founder's own call rather than a
unilateral one — flagged here for a decision, not silently resolved.

## Doc Reconciliation

- `docs/execution/week4/BUSINESS_LOGIC.md` — added an "Implementation Reconciliation" section
  (same pattern as Week 3 Task 5), recording the tier judgment calls, the checkpoint mechanism,
  the `completed` milestone, and both live findings above.
- `docs/execution/week4/SCHEMA.md` — no changes needed; `PerformanceSnapshot` matches exactly as
  specified.
- `docs/execution/KNOWN_ISSUES_AND_BLOCKERS.md` — updated the founder-action table (credentials
  still pending, expected tonight), updated the `resume()`-sweep entry with the concrete Week 4
  incident, added the Windows process-tree kill-testing note, updated "Not yet built."

## What's Still Open (deliberately not marked closed)

Per this task's own Additional Notes and this session's explicit instruction: the founder's real
credentials (`OPENAI_API_KEY`, `PEXELS_API_KEY`, YouTube OAuth) were not yet in `.env.local` at any
point during this task. That means:

- **No real end-to-end run has happened.** Everything above is real code, exercised for real,
  against stubs at the three points those credentials would matter (TTS/transcription, stock
  footage, YouTube upload/stats).
- **Both approval gates were simulated**, not answered by the founder live, per this session's
  explicit instruction to leave that for tonight.
- **The published video's privacy status has never been checked in real YouTube Studio** — nothing
  has actually reached YouTube yet.
- **No real audio or real stock footage has ever been produced or watched.**

**This task does not close Week 4's actual milestone.** `MVP_ROADMAP_OCT15.md` Section 12 calls
for a real dry run; that remains open, tracked in `KNOWN_ISSUES_AND_BLOCKERS.md` Section 1, for the
founder to run personally once tonight's keys land — the code path is ready and does not need to
change to do it (unset `MEDIA_STUB`/`STOCK_FOOTAGE_STUB`/`YOUTUBE_STUB`, use `gate1-live`/a real
Gate 2 reply instead of the simulated dry-run commands).

## Sign-Off

- Task Objective: **Partially met** — the mechanical proof (nine stages, mid-`publishing`
  kill/resume) is done and real; the actual milestone (a genuinely real, founder-gated run) is not,
  by design, per this session's explicit instruction.
- Schema Impact: None new; SCHEMA.md confirmed accurate.
- Business Logic: Reconciled — see above.
- Tests: Passing, against stubs.
- Ready for Integration: **Not yet** — ready for the founder's real run once tonight's credentials
  land; nothing else blocks it.
