# Sprint 3 Task 11: UI Enhancement 3 — Backend Requirements (Run Lifecycle: Publish-on-Approval, Gate Decision Fields, Cancel Running, Run Again)

**Date**: 2026-09-28
**Status**: Complete — all four required R-items (R1–R4) done and live-verified, plus the optional R5.
**Branch**: `UIENHANCEMENT3_BE` (own branch off `main`; PR #42)
**Commits**: `..._R1`, `..._R2_R3_R4`, this report/R5 commit.
**Tests**: build, lint, typecheck clean; `npx vitest run` — 18 files / 108 tests passing throughout. No new unit
tests added — this task's own bar, like Tasks 8/9/10 before it, is real live verification against isolated sandbox
databases, never the shared dev DB.

## What was built, per item

**R1 (B14) — a Gate 2 approval actually publishes, no restart needed.** Confirmed the premise first, by direct
read: `pipeline-runner.ts`'s `driveFromCurrentStage` loop's `default` case explicitly stopped for `'publishing'`/
`'analytics'` ("no processor on this branch yet") — only `resume-on-startup.ts`'s `STAGE_RESUMERS` map ever called
`runPublishingStage`/`runAnalyticsStage`, and only once, at the next process boot. Fixed by adding
`case 'publishing'`/`case 'analytics'` to the switch, same shape as every existing case. This also closes Task
9/R2's Gate-2-off auto-approve path for the identical reason (same loop) — no second fix built. Publishing alone
gets a 10-minute stall guard (`runPublishingStageWithStallGuard`): races the real call against a `setTimeout`
rather than building new cancellation plumbing (no `AbortController` threaded through `uploadVideo` today). This
does **not** cancel the real call if the timer wins — deliberately safe, not just tolerated, since
`runPublishingStage` already checkpoints `youtubeVideoId` before any re-upload. The one documented residual: if the
stalled call later succeeds *after* the stall guard has already written `needs_attention`, its own completion only
touches `currentStage` (→ `'analytics'`), never `status` — so the run is left at `needs_attention`/`analytics`,
which the existing generic `runs.retry` drives forward correctly. Nothing is lost, nothing double-uploads.

**Live verification**: against an isolated sandbox DB, a real run (real `script_generation`/`video_generation`
calls, `reviewScript`/`reviewVideo` mocked to a passing outcome so gate1/gate2 are reached without waiting on real
review scores) was driven purely through `runPipelineToNextGate` — the exact entry point `runs.create`'s own
mutation uses — with both gates resolved via the same `resolvePendingApproval` primitive the real API mutations
call. Reached `status: 'completed'` with a real (stub-upload) `youtubeVideoId`, entirely from the live request
path, no process restart anywhere in the test. `resume-on-startup.ts` is untouched by this change (confirmed by
inspection — the diff only touches `pipeline-runner.ts`).

**R2 (B13) — `lastGateDecision` + `endReason` on `runs.get`.** `getRunDetail` (in `runs.ts`) gains two computed
fields, both derived from data it already fetches (no extra DB round-trip): `deriveLastGateDecision(stages)` finds
the latest completed `gate1`/`gate2` stage row and normalizes gate1/gate2's three different raw output field names
(`reason`/`privacyStatus`/`notes`, confirmed by direct read of `state-machine.ts` before writing this) into one
consistent `{gate, outcome, privacyStatus?, reason?, notes?, decidedAt}` shape. `deriveEndReason(run)` string-matches
`run.lastError` against the exact strings each failure path writes (`"Rejected at Gate 1"`/`"Rejected at Gate 2"`
prefix → `'rejected'`; `'Cancelled by user'` exact → `'cancelled'`; `'Channel deleted'` exact → `'channel_deleted'`;
any other `'failed'` status → `'failed'`; anything not `'failed'` → `null`). **The task's own required disclosure**:
this is real, known fragility — a future change to any of those exact strings silently breaks `endReason`. Not
fixed here (a structured end-reason column is reasonable future work, flagged below), per the task's own scoping.

**Live verification** (folded into the same consolidated test run as R3/R4 below — see there for the full
transcript): rejected at Gate 1, rejected at Gate 2, cancelled, archived mid-run, and a genuine regen-cap
`needs_attention` all produced the correct `lastGateDecision`/`endReason` pair, cross-checked against Postgres.
Notably confirmed `endReason: null` for the `needs_attention` case is the *correct* behavior, not a gap — a
needs-attention run isn't "ended" in this framework (it's actionable via the existing `runs.retry`), a distinct UI
board from the "ended" screens this task's fields feed.

**R3 (B11) — cancel a run that's currently running.** New `cancellation-registry.ts` — an in-memory `Set<string>`,
same "in-process state, not DB" precedent `notifications/pending-approvals.ts` already established for pending gate
replies. `runs.cancel` now also accepts `'running'`: records the request and returns `{ cancelled: true }`
immediately, not blocked on the loop actually noticing. `pipeline-runner.ts`'s loop checks the registry once per
iteration, at the same point `failRunIfChannelArchived` already checks (top of the `while`, before the `switch`). A
stage already mid-flight when the cancel lands is allowed to finish and its own stage-row write is not discarded —
the loop's *next* iteration is what refuses to act on that result to advance the run further. No mid-call abort was
built (no `AbortController` threaded through any stage's real LLM/TTS/video call today) — stated plainly, as the
task's own instruction asked, rather than silently building one. The registry is deliberately not persisted: a
cancel request racing a server restart is simply lost (the run resumes normally, the founder can cancel again) —
an accepted tradeoff, not treated as a gap, per the task's own explicit allowance.

**Live verification**: cancelled a run genuinely mid-`video_generation` — polled the real stage row until it read
`status: 'running'` (proving this was a real in-flight cancel, not a lucky race before the stage even started),
then called the real `caller.runs.cancel` mutation. Result: `status: 'failed'`, `lastError: 'Cancelled by user'`,
and `reviewVideoMock` (standing in for `video_review`) was never called — the run never advanced to `video_review`.
One real, live-found nuance, not a bug: `currentStage` itself can legitimately still read `'video_review'` after the
cancel, because the in-flight `video_generation` call's own normal completion (which sets `currentStage` on success)
is allowed to finish and commit, exactly per the task's own "don't discard that write" instruction — the actual
proof the loop stopped is that `runVideoReviewStage` (the function) was never invoked, not the `currentStage` text.
An initial version of this test wrongly asserted the stricter (incorrect) expectation and was corrected once the
real live result showed why.

**R4 (B12) — `runs.rerun`.** Extracted `assertChannelCanRun(channel)` (the archived + not-connected-to-YouTube
checks `create` already had inline) so `rerun` applies the *exact same* checks against the source run's channel,
not a second copy. `rerun({ runId })`: same `assertGateOwnership` check as `retry`/`cancel`, looks up the source
run's `channelId`/`briefText`/`creationOptions`, and calls the identical `createRun` + `startPipelineInBackground`
path `create`'s own mutation uses. **A real finding, not new work**: `runs.get`'s response already includes
`creationOptions` today — it's a field directly on the `PipelineRun` type (`run.creationOptions`), confirmed by
reading `pipeline-run.repository.ts`'s own mapping before assuming otherwise. The task doc's premise that this
needed adding was already satisfied; nothing further was built for that half of R4.

**Live verification**: reran a genuinely `completed` run (full real drive through both gates, mocked scoring, stub
media/upload) — the new run's `briefText`/`creationOptions` matched the source exactly, cross-checked against
Postgres, with a genuinely different `id`. Reran against a source run on an archived channel → `BAD_REQUEST`
(`"... is archived"`, the identical message `create` gives). Reran against a source run on a channel with no
`AgentCredential` → `BAD_REQUEST` (`"isn't connected to YouTube yet"`, the identical message `create` gives).

**R5 (optional) — `runs.progress`.** Built (time allowed): `{ stage, attemptNo }` from data already available —
`run.currentStage` plus that specific stage's own latest attempt number (not just "the most recently touched stage
row overall", which could be a different, already-finished stage if the current one hasn't started its first
attempt yet). No `pct` field — this pipeline has no meaningful percent-through-a-stage notion (a stage is not
started, running, or done), so it's genuinely omitted rather than a fabricated number. Live-verified: a fixture run
at `video_generation` with two stage attempts (1 running, then a second superseding it) returned
`{ stage: 'video_generation', attemptNo: 2 }` — the correct, current attempt, not the first one.

## Live verification technique
Same posture as Tasks 9/10: real, isolated sandbox Postgres databases (created, migrated with every real
migration, dropped after use — never the shared dev DB), with `reviewScript`/`reviewVideo`/`generateScript`
mocked via `vitest`'s `vi.mock` (deterministic, fast — real script-generation content isn't the point of this
task's verification, the branching logic around it is) so every gate/regen/cancel scenario is reached quickly and
reliably. `runVideoGenerationStage`/`runPublishingStage`/`runAnalyticsStage` themselves are real (stub media/
footage/upload via existing env flags), so real several-second stages actually run — enough to genuinely catch one
mid-flight for R3's cancel test, and to prove R1's stall-guard-eligible code path really executes end to end.

## Schema Impact
None. `lastGateDecision`/`endReason`/`runs.progress` are all computed at read time; the R3 cancellation registry
is in-memory, no migration.

## App flags this unblocks
- R3/B11 → `cancelRunning`
- R4/B12 → `runAgain`
- R2/B13 → `gateOutcomeFields`
- R1/B14 unblocks no flag directly — it's the "Uploading to YouTube" screen's own correctness (a Gate 2 approval
  that never silently stalls at `publishing` until a restart).

## Known Issues / Future Improvements
- **R2/B13's `endReason` is string-matching on `lastError`**, not a structured column — a real fragility (stated
  above), worth a structured fix later, not blocking for this task.
- **R3/B11's cancellation registry is in-memory** — a cancel request racing a server restart is lost (the run just
  resumes normally). Accepted per this task's own scope.
- **R1/B14's stall guard doesn't cancel the real call**, only stops waiting on it — the one documented race (a
  late-succeeding stall lands the run at `needs_attention`/`analytics` instead of `completed`) is self-healing via
  the existing `runs.retry`, not a data-loss or duplicate-upload risk.
- **No mid-call abort for a cancelled run's in-flight stage** — real spend for that one stage's remaining work
  still happens (it's allowed to finish); only the *next* stage is prevented from starting. Matches the task's own
  explicit instruction, not treated as a gap.

## Test Results
```
studio/: build PASS, lint PASS, typecheck PASS, npm test — 18 files / 108 tests passing
```
Live-verification transcripts reproduced in full above, per item.

## Sign-Off
- R1/R2/R3/R4/R5: all complete, live-verified, pushed to `UIENHANCEMENT3_BE`.
- Ready for Integration: yes — PR #42 moves out of draft with this report.

## Links & References
- `docs/execution/sprint3/tasks/task11.md`, `docs/execution/sprint3/STATUS.md`
- `docs/execution/ui-ux/tasks/task6.md` — the source UI spec (B11–B14)
- `docs/execution/sprint3/tasks/task8.md`, `tasks/task9.md`, `tasks/task10.md` — the prior UI-Enhancement-driven
  backend tasks this one follows the same posture as
- `docs/execution/bugs/Sprint3/tasks/task8.md` (R1) — the "not connected to YouTube" channel check R4/B12 reuses
