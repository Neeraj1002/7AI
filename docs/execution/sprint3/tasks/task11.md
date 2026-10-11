# Sprint 3 Task 11: UI Enhancement 3 — Backend Requirements (Run Lifecycle: Publish-on-Approval, Gate Decision Fields, Cancel Running, Run Again)

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** It defines the Git
Workflow, the `STATUS.md` update this task must make, and the section structure this file follows.

**Read the UI/UX spec driving this work before starting anything, and read it from the right place.**
This backend work is required by the UI/UX track, not Sprint 4 or the frontend track — read:
- `docs/execution/ui-ux/STATUS.md` — the UI/UX track's own status table; Task 6's row states the exact
  four backend items (B11–B14) this task builds and why.
- `docs/execution/ui-ux/tasks/task6.md` — the full UI spec (run lifecycle: retry/cancel, "Decision
  sent", the three after-Gate-2 outcomes, Run again, cancel while running) that these backend items
  unblock. Its own "Backend dependencies" section at the bottom is the direct source of B11–B14.

**Important — checkout location, don't confuse the two:** the UI/UX docs above live in this same repo
(`docs/execution/ui-ux/`), but that track's own *code* is built from a **separate worktree**,
`D:\Study Material\7AI-UI` (FE/APP-only, no `studio/` backend code at all). **This task's own checkout
is the main repo, `D:\Study Material\7AI`** (`studio/`) — same as Tasks 8, 9, and 10. Read the UI/UX
docs for context; do all actual backend work from `D:\Study Material\7AI\studio`.

**Note on why this is a Sprint 3 task, not Sprint 4**: same reasoning as Tasks 8, 9, and 10 — Sprint 4
(`docs/execution/sprint4/`) is a separate, larger, unrelated initiative. This is UI-Enhancement-3-driven
backend work, filed as a fifth Sprint 3 reopen on its own branch, same posture as Tasks 8/9 (which were
UI Enhancement 1/2's own backend counterparts).

**Objective**: four run-lifecycle backend gaps the app's UI/UX Task 6 is built against but can't ship
without: (1) a Gate 2 approval actually publishes without a server restart, (2) the app can reliably tell
what happened at a gate and why a run ended, (3) a running run can be cancelled, (4) a dead-end run
(rejected/cancelled/failed) can be re-run.

---

## Verified findings (2026-09-28 — confirmed by reading the actual code on `D:\Study Material\7AI\studio`,
not assumed; per the founder's standing rule, re-verify before rework, don't re-litigate what's below)

**B14's premise is confirmed, not a guess.** `studio/src/run-pipeline/pipeline-runner.ts`'s
`driveFromCurrentStage` loop (lines 68–98) has a `switch (run.currentStage)` with cases for
`script_generation` through `gate2` — its `default` case (line 90–94) explicitly stops for `'publishing'`
and `'analytics'`, with its own comment: *"no processor on this branch yet."* This is the **live,
request-driven** loop every `runs.gate2` approval runs through. It genuinely never reaches
`runPublishingStage`. Only `resume-on-startup.ts`'s `STAGE_RESUMERS` map (which *does* include
`publishing: runPublishingStage` and `analytics: runAnalyticsStage`) ever calls them — and only once, at
the next process boot. **A manual Gate 2 approval today does not publish until someone restarts the
server.** Confirmed current, not stale (this file was touched as recently as Bugs Task 9/R6).

**B13's "inconsistent across approve/reject/revise" claim is confirmed.** Reading
`runGate1Stage`/`runGate2Stage` directly (`state-machine.ts:581`, `:1117`):
- gate1 stage output: reject → `{ outcome: 'reject', reason }`; approve/edit → `{ outcome, sanctionedScriptText }` (no `reason`).
- gate2 stage output: reject → `{ outcome: 'reject', reason }`; approve → `{ outcome: 'approve', privacyStatus }`; revise → `{ outcome: 'revise', notes }`.

Three different "detail" field names (`reason` / `privacyStatus` / `notes`) depending on outcome — genuinely
inconsistent, confirmed by code, not assumption.

**Confirmed, answering the prompt's own question**: status/currentStage right after Gate 2 outcomes
(`state-machine.ts:1177–1265`):
- **Reject**: `status: 'failed'`, `lastError: 'Rejected at Gate 2: <reason>'`, `currentStage` **unchanged**
  (stays `'gate2'` — the reject write never touches it).
- **Revise, under the regen cap**: `status: 'running'`, `currentStage: 'video_generation'`.
- **Revise, at the regen cap**: `status: 'needs_attention'`, `lastError: 'Gate 2 regen cap (...) reached: <notes>'`, `currentStage` unchanged (stays `'gate2'`).

**B11's premise is confirmed.** `runs.cancel` (`runs.ts:295–315`) accepts `paused_gate1`, `paused_gate2`,
`needs_attention`, `pending` and throws `CONFLICT` on anything else, including `'running'` — exactly as
the prompt states. There is **no existing cancellation-request mechanism** anywhere in `pipeline-runner.ts`
today (confirmed by reading the whole file) — B11 has to add one, not just relax a status check.

**B12's premise is confirmed.** `runs.ts` has no `rerun` procedure (confirmed by reading the whole file in
full) — `retry` (`runs.ts:258`) is the only existing mutation, and it's hard-scoped to `needs_attention`.

---

**Duration**: R1/B14 ~1.5-2h, R2/B13 ~2h, R3/B11 ~2-2.5h, R4/B12 ~1-1.5h, R5/optional ~0.5h. ~7-8h core.

**Depends On**: Sprint 3 Tasks 8 and 9 (both merged/ready-for-review — `channels.update`,
`channels.archive`, `findByChannel` credential check, all reused directly by these items), the UI/UX
track's `tasks/task6.md` (the source spec for B11–B14).

**Owning Component**: `studio/src/api/routers/runs.ts`, `studio/src/run-pipeline/pipeline-runner.ts`.
`state-machine.ts` is read-only reference for this task (its gate1/gate2 output shapes are read, not
changed) unless R2/B13's normalization genuinely can't be done from `runs.get` alone — state clearly in
the report if that turns out to be false.

**Founder decisions already made — don't reopen**:
- Gate 2 can only be turned off on a channel whose default visibility is Private, and it then publishes
  Private automatically (already enforced, Task 9/R2 — unrelated to this task, just don't re-litigate it).
- Runs are blocked on channels not connected to YouTube (already enforced, Bugs Task 8/R1 — `runs.rerun`
  below must apply the identical check, not a new one).
- Channel delete is a soft delete with no restore (already true, Task 8/R3).

**Not needed from this task** (already merged/exists, confirmed by reading `runs.ts`/`channels.ts`/
`options.ts` — don't rebuild): `channels.update`'s length/settings fields, `channels.archive`, Gate 2
visibility default (all Task 8/9). `options.list` and the watermark REST routes (Task 9). `runs.retry` on
a `needs_attention` run (exists today, `runs.ts:258`, untouched by this task).

---

### R1 (Role: `BE`) — B14: make a Gate 2 approval actually publish, no restart needed

**Fix**:
1. In `pipeline-runner.ts`'s `driveFromCurrentStage` switch, add `case 'publishing'` (calls
   `runPublishingStage`, `continue`) and `case 'analytics'` (calls `runAnalyticsStage`, `continue`) —
   same shape as every existing case. This is the entire structural fix: the loop that's already blocked
   inside `runGate2Stage` for a live approval will now keep driving forward past it, exactly the same way
   it already drives from `script_generation` through `gate2` today.
2. This same change also closes Task 9/R2's Gate-2-off auto-approve path (it drives through the identical
   loop) — don't build a second fix for that, confirm it in the Verify step instead.
3. Add the founder's stall guard: if `runPublishingStage` doesn't resolve within 10 minutes, move the run
   to `needs_attention` with a clear error instead of leaving the request hanging indefinitely. Pick the
   simplest safe mechanism (e.g. race the call against a timer) — `runPublishingStage` already checks for
   an existing checkpointed `youtubeVideoId` before re-uploading (state-machine.ts's own comment on that
   function), so a timeout here is safe to retry later via the existing resume path; don't build new
   upload-dedup logic, it already exists. State which mechanism was used and why in the report.

**Verify**: on the live dev server, with **no restart**, approve Gate 2 for a real run and confirm it
reaches `publishing` → `analytics`/`completed` with a real `youtubeVideoId`, purely from the live request
path. Also re-confirm the existing resume-on-restart path (a run genuinely parked at `publishing` across a
process restart) still works unchanged — this task adds a second way to reach `runPublishingStage`, it
doesn't remove the first.

---

### R2 (Role: `BE`) — B13: `lastGateDecision` + `endReason` on `runs.get`

**Fix**:
1. In `runs.ts`'s `getRunDetail` (the function `get` calls), compute and add:
   - `lastGateDecision: { gate: 1 | 2, outcome: 'approve' | 'edit' | 'reject' | 'revise', privacyStatus?, reason?, notes?, decidedAt } | null` —
     from the latest completed gate1/gate2 stage row (whichever is later). **Normalize** the three
     different raw field names found above (`reason`/`privacyStatus`/`notes`) into this one consistent
     shape — don't pass the raw, inconsistent stage output straight through, that inconsistency is exactly
     what this item exists to fix. `decidedAt` comes from that stage row's own `completedAt`.
   - `endReason: 'rejected' | 'cancelled' | 'failed' | 'channel_deleted' | null` — derived from
     `run.status`/`run.lastError` using the exact strings confirmed above: `'failed'` status with
     `lastError` starting `"Rejected at Gate 1"`/`"Rejected at Gate 2"` → `'rejected'`; `lastError ===
     'Cancelled by user'` → `'cancelled'` (this must match R3/B11's own cancel message exactly, coordinate
     within this same PR); `lastError === 'Channel deleted'` → `'channel_deleted'`; any other `'failed'` →
     `'failed'`; anything else (run not ended) → `null`.
2. This is string-matching on `lastError`, not a structured field — a real, known fragility (a future
   change to any of those exact strings silently breaks `endReason`). State this plainly in the report
   rather than hiding it; a follow-up that adds a real structured end-reason column is reasonable to flag
   as future work, not to build now.

**Verify**: drive real runs to each of: rejected at Gate 1, rejected at Gate 2, cancelled (once R3/B11
exists — order R3 before finishing this verify step, or verify cancellation separately once it lands),
archived mid-run, and a genuine regen-cap `needs_attention`. Confirm `runs.get` returns the correct
`lastGateDecision`/`endReason` for each, cross-checked against Postgres.

---

### R3 (Role: `BE`) — B11: cancel a run that's currently running

**Fix**:
1. `runs.cancel` (`runs.ts:295`) also accepts `'running'`.
2. Add a cancellation-request mechanism — none exists today. An in-memory registry (e.g. a `Set<string>`
   of run ids), same "in-process state, not DB" precedent `notifications/pending-approvals.ts` already
   uses for pending gate replies, is the simplest fit — state in the report why this choice was made,
   including the tradeoff that a cancel request is lost if the server restarts between the request and the
   loop's next check (acceptable: a restart re-resumes the run normally, and the founder can just cancel
   again).
3. `runs.cancel` on a `'running'` run: record the cancel request, return `{ cancelled: true }` immediately
   — don't block the mutation on the loop actually stopping.
4. `pipeline-runner.ts`'s `driveFromCurrentStage` loop checks the registry once per iteration, at the same
   point `failRunIfChannelArchived` already checks (top of the `while` loop, before the `switch`). If a
   cancel is pending: stop the loop, `updatePipelineRun(runId, { status: 'failed', lastError: 'Cancelled
   by user' })`, publish nothing, return.
5. A stage already mid-flight when the cancel lands is allowed to finish and its result still persists to
   the stage-row history (don't discard the DB write) — the loop simply must not act on that stage's
   output to advance the run further; the next loop check catches it before the following stage starts.
   Don't build a mid-call abort (`AbortController` into an in-flight LLM/TTS/video call) unless something
   in the existing code already has one — state which behavior was implemented in the report.

**Verify**: cancel a run genuinely mid-`video_generation` (a real, several-second stage) and confirm it
lands on `failed`/`'Cancelled by user'` without ever reaching `video_review`, and that no further
LLM/TTS/video spend happens after the cancel is recorded.

---

### R4 (Role: `BE`) — B12: `runs.rerun`

**Fix**:
1. Add `runs.rerun({ runId })` to `runs.ts`. Same ownership check as `retry`/`cancel`
   (`assertGateOwnership`). Look up the source run's `channelId`/`briefText`/`creationOptions`, then call
   the exact same `createRun` + `startPipelineInBackground` path `create`'s own mutation already uses —
   reuse `create`'s channel checks (archived, not connected to YouTube) against that same channel rather
   than re-implementing them; don't duplicate logic that already exists one function above.
2. Add `creationOptions: { voice?, visualSource?, audioLayer?, targetDurationSec? } | null` to `runs.get`'s
   response — same `getRunDetail` function R2/B13 also touches; coordinate both additions in one PR so
   they don't conflict on the same function.

**Verify**: rerun a completed, a rejected, and a cancelled run; confirm the new run's `briefText`/
`creationOptions` exactly match the source run's (Postgres cross-check). Confirm rerunning against a
since-archived or since-disconnected channel is rejected with the same messages `runs.create` already
gives for those cases.

---

### R5 (Role: `BE`, optional) — light `runs.progress`

`runs.progress({ runId })` returning `{ stage, attemptNo, pct? }` — a lighter poll target than refetching
all of `runs.get` every 5 seconds. Build only if time remains after R1–R4; note in the report either way,
don't silently skip it without saying so.

---

## Schema Impact

No new tables/columns required for R1–R4 as specified — `lastGateDecision`/`endReason`/`creationOptions`
are all computed at read time in `runs.get`, not stored. If R3/B11's cancellation registry is implemented
as an in-memory structure (as suggested above), it needs no migration either. If implementation finds a
genuine need to persist something (e.g. the cancellation flag surviving a restart turns out to matter
live), state that plainly in the report rather than silently adding a migration — this doc assumes no
schema change.

## Business Logic / State Transition

R1/B14 changes the live-request state machine's own reach (it now drives two stages it previously
stopped short of) — no new states, no new transition rules, just extending how far the existing loop goes.
R3/B11 adds one new terminal transition (`running` → `failed` via cancel) alongside the existing gate-based
ones. R2/B13 and R4/B12 are read-only/creation-reuse, no new transitions.

## Testing

```bash
npm run build && npm run lint && npm run typecheck
```

Plus each item's own Verify section above — these need real runs driven through real stages, not just
type-checking; R1/B14 and R3/B11 specifically need live, non-restarted server behavior demonstrated, not
inferred from reading the code.

## Report Template

Generate at `docs/execution/sprint3/reports/task11.md`, same shape as `reports/task9.md`/`reports/task10.md`.
State plainly, per item, which app flag it unblocks (`cancelRunning` for B11/R3, `runAgain` for B12/R4,
`gateOutcomeFields` for B13/R2 — B14/R1 unblocks no flag directly, it's the "Uploading to YouTube" screen's
own correctness).

## Additional Notes

- Suggested build order (per the founder's own prompt, and this doc's R-numbering matches it): **R1/B14
  first** — it can silently break publishing for everyone if wrong, and is the smallest, most contained
  change. Then R2/B13, R3/B11, R4/B12.
- R2/B13 and R4/B12 both add fields to `runs.ts`'s `getRunDetail` — if built out of order or by different
  passes, merge carefully rather than overwriting one addition with the other.
- The UI/UX track's `tasks/task6.md` (E3/E4/E5) is what actually consumes these fields/mutations — if
  anything here turns out to not match what that spec needs once building starts, flag it back to the
  architect chat rather than guessing which side is wrong.

## Known Issues / Future Improvements

- R2/B13's `endReason` derivation is string-matching on `lastError`, not a structured column — noted
  above, a real fragility worth a future structured fix, not blocking for this task.
- R3/B11's cancellation registry is in-memory — a cancel request racing a server restart is lost (the run
  just resumes normally instead); acceptable per this task's own scope, worth revisiting only if it causes
  real founder-visible confusion.

## Links & References
- [TASK_TEMPLATE.md](../../templates/TASK_TEMPLATE.md)
- `docs/execution/sprint3/STATUS.md`
- `docs/execution/ui-ux/STATUS.md` — the UI/UX track's own status; Task 6's row is this task's source
- `docs/execution/ui-ux/tasks/task6.md` — the full run-lifecycle UI spec, including its own "Backend
  dependencies" section (B11–B14)
- `docs/execution/sprint3/tasks/task8.md`, `tasks/task9.md` — the prior UI-Enhancement-driven backend
  tasks this one follows the same posture as
- `docs/execution/bugs/Sprint3/tasks/task8.md` (R1) — the "not connected to YouTube" channel check R4/B12 must
  reuse, not reimplement

## Git Workflow

This task runs on its own branch, same posture as Tasks 8, 9, and 10.

1. `git checkout main && git pull` from `D:\Study Material\7AI`.
2. `git checkout -b UIENHANCEMENT3_BE`. Record this exact name in `docs/execution/sprint3/STATUS.md`'s
   new Task 11 row immediately — before the first commit.
3. One commit per item: `UIENHANCEMENT3_TASK11_BE_R<X>: [what it does]`.
4. After R1's first commit is pushed, open the PR as a draft:
   `gh pr create --draft --title "UIENHANCEMENT3_BE: Run Lifecycle Backend (Publish-on-Approval, Gate Decision Fields, Cancel Running, Run Again)" --body "Tracking PR for Task 11. Live status: docs/execution/sprint3/STATUS.md (Task 11). Do not merge until marked ready for review."`
5. After R4 (and R5, if built) lands and is pushed, write the report and this task's `STATUS.md` row
   update, commit them together, then `gh pr ready`.
6. **Never push or merge to `main` directly** and **never commit to a branch this task didn't create** —
   same as every other track.
