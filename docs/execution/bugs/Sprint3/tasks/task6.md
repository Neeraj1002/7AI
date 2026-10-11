# Bugs Task 6: Script Review Auto-Retry Loop Has No Feedback

**Read `docs/execution/bugs/HOTFIXER_AGENT_PROTOCOL.md` in full before starting** — this is a bugs-track
task, one `BUGS_TASK6` branch, one PR, per that protocol's Release & Branch Model. `TASK_TEMPLATE.md`
still governs the shape of the work itself.

**Found via direct code read, 2026-09-26** (not a founder-reported symptom this time — surfaced while
investigating why script quality wasn't visibly improving despite Bugs Task 3/R3's auto-retry mechanism
already being live on `main`). No code was changed or run to produce this finding; confirm current line
numbers before editing, since other work may have landed since.

**Context — the mechanism this task fixes already exists and is working as designed**: Bugs Task 3/R3
(`SCRIPT_REVIEW_AUTO_REJECT_THRESHOLD = 7`, `MAX_SCRIPT_REVIEW_AUTO_RETRY_ATTEMPTS = 3`, both in
`studio/src/agents/script-review/index.ts:19-20`) is real, live, and confirmed by direct read of
`runScriptReviewStage` (`studio/src/run-pipeline/state-machine.ts`, ~line 304 onward): a script scoring
below 7 loops back to a fresh `script_generation` attempt (up to 3 times), an `auto-reject` `ReviewLog`
row is written each time, and a script that's still below 7 after the cap goes to `paused_gate1` anyway
with an "auto-retry limit reached" note appended. **A prior task doc (`sprint3/tasks/task9.md`) claimed
this mechanism doesn't exist at all — that claim is now confirmed wrong**, most likely written against a
checkout that predated this fix actually landing. **Corrected 2026-09-26** — `sprint3/tasks/task9.md`
and `sprint3/STATUS.md`'s Task 9 row have been updated to stop citing that gap.

## Status: Done — merged to `main`

**R1 and R2 are both complete, live-verified against a real, isolated sandbox database, and merged to
`main` via `BUGS_TASK6` / PR [#31](https://github.com/Neeraj1002/7AI/pull/31) (2026-09-27).** Full
verification detail (real captured-prompt output for R1, real routing outcomes for R2) is in
`docs/execution/bugs/reports/task6.md`. **Sprint 3 Task 9/R2 is now unblocked** — see the sequencing
note below, kept for history but no longer a live blocker.

**Sequencing with Sprint 3 Task 9/R2 — historical, now resolved**: `sprint3/tasks/task9.md`'s R2 (Gate
1/Gate 2 toggles) wires the `Channel.approvalGateConfig.gate1Enabled` flag onto this exact same code
region — this task's own `gate1Enabled === false` branch (had there been one; there wasn't — see below)
sits immediately alongside the `fixNotes` lookup and the budget-routing fix this task made. **This task
(`BUGS_TASK6`) has merged to `main`.** Task 9/R2 was told explicitly not to start until `BUGS_TASK6`
merged, and to rebase against fresh `main` before doing so — that condition is now satisfied; Task 9/R2
can proceed, building directly on top of the `fixNotes` lookup and budget-routing fix this task added
rather than reintroducing a parallel branch.

**The real, still-open problem this task fixes**: the auto-retry loop has no feedback. Confirmed by
direct read of `runScriptGenerationStage` (`state-machine.ts`, ~line 198-207): its `stageInput` is
`{ topic, constraints, styleGuide }` — identical on every attempt, retry or not. The reviewer's actual
notes (why a script scored a 5 — weak hook, unclear CTA, whatever the real problem was) are written to
the `auto-reject` `ReviewLog` row's `rationale` and never read again by anything. So a "retry" today is
not a targeted fix — it's a blind re-roll of the identical prompt, hoping model variance alone produces
a better result. This is inconsistent with this codebase's own established pattern: the video
generation/review loop already does this correctly — `runVideoGenerationStage` reads `fixNotes` from the
prior `video_review` failure (`state-machine.ts:655`) and feeds it back into the next attempt's
production plan. Script Review's retry loop was never given the same treatment.

**Founder-confirmed**: keep the existing threshold and cap exactly as they are (7 / 3) — this task is
scoped to the feedback mechanism only, not a threshold/cap change. Re-evaluating 7/3 is explicitly
deferred until real data exists from *informed* retries (current score data reflects blind re-rolls, not
a real test of whether the bar is calibrated correctly).

---

### R1 (Role: `BE`) — Feed the reviewer's notes back into the next script-generation attempt — **Done**

**Where**: `runScriptGenerationStage` (`state-machine.ts`, ~line 198-207) and `generateScript()`
(`studio/src/agents/script-generation/index.ts` or equivalent — confirm exact module by direct read,
this doc's paths are based on Bugs Task 3/R3's own citations, not a fresh read of script-generation
itself). Mirror the existing `fixNotes` pattern from `runVideoGenerationStage`/`video-generation/plan.ts`
as closely as possible — this is a proven shape already in this codebase, not new design.

**Fix**:
1. When `runScriptReviewStage` triggers an auto-reject-and-retry (the existing `autoRejectAndRetry`
   branch, ~line 391-397), the `ReviewLog` row it writes (`agent: 'script-review'`, `verdict:
   'auto-reject'`, `rationale: output.notes`) is already the source of truth for what went wrong —
   confirm this row is queryable by `runId` + `stageName: 'script_review'` + `verdict: 'auto-reject'`,
   ordered by most recent, the same way the video loop looks up its own most recent `fixNotes` source.
2. `runScriptGenerationStage`'s `stageInput` gains an optional `fixNotes: string | undefined` — resolved
   as: when `attemptNumber > 1` (a retry, not the first attempt), look up the most recent `auto-reject`
   `ReviewLog` row for this run's `script_review` stage and pass its `rationale` through; `undefined` on
   a genuine first attempt (no prior review exists yet).
3. `generateScript()`'s signature/prompt gains the same optional `fixNotes` parameter. When present, the
   system/user prompt gets an explicit added instruction along the lines of: "A prior attempt scored
   below the required bar for these reasons: {fixNotes}. Address these specific issues directly in this
   attempt — do not simply regenerate a similar script and hope for a different result."
4. No schema change — `fixNotes` is an internal stage-to-stage value resolved from an existing
   `ReviewLog` row, not a new persisted field, matching how the video loop's own `fixNotes` already
   works (confirm this assumption by direct read of the video loop's exact `fixNotes` source before
   assuming — state plainly in the report whether it's read live at runtime or is itself passed via
   `creationOptions`/similar, and follow whichever it turns out to be, for consistency).

**Confirmed done**: the video loop's own `fixNotes` is read **live at runtime** (`listReviewLogsForRun(runId)`,
reversed, most recent match), not via `creationOptions` — R1 mirrors this exactly. **Real, live
verification** against an isolated sandbox DB, with `callLLM` mocked so the real prompt-construction code
ran and could be intercepted: attempt 1's actual captured prompt has no `fixNotes` text; attempt 2's
actual captured prompt contains both the injected instruction and the exact rationale string from
attempt 1's `auto-reject` review ("Weak hook: the opening is generic and slow, no cold open."). Full
detail and console output in `reports/task6.md`.

---

### R2 (Role: `BE`) — Budget-refusal mid-retry routes to `needs_attention`; the cap-reached case routes to Gate 1. Make these consistent. — **Done**

**Found during the same investigation, not originally in scope, but a quick, contained fix worth
including in this same release** — flag it as optional if the founder would rather keep this task
narrowly scoped to R1 alone; recommended to include given how small it is.

**Where**: `runScriptGenerationStage`'s existing budget check (`state-machine.ts:212`, before any stage
attempt is created) — confirmed via direct read: `isBudgetAvailable(run.tenantId, channel.id,
channel.platform)` failing on a retry attempt (`attemptNumber > 1`) currently ends the run at
`needs_attention` with `lastError: "Script Generation refused: the pooled budget ceiling or this
channel's own effective ceiling would be exceeded"` — identical to how a **first** attempt's budget
refusal is handled.

**The inconsistency**: a script that hits the auto-retry *cap* (3 attempts, still below 7) falls through
to `paused_gate1` with a plain, informative note — a human sees it and can decide. A script that simply
runs out of *budget* mid-retry gets `needs_attention` instead — a status this codebase otherwise reserves
for genuine technical failures needing investigation, not "this is a normal outcome, a human should just
approve or reject it." Running out of a shared/pooled budget mid-retry is arguably the same *kind* of
normal, expected outcome as hitting the retry cap — not a bug.

**Fix**: when `isBudgetAvailable` fails specifically on a **retry** attempt (`attemptNumber > 1` — a
genuine first-attempt budget refusal is unrelated to this task and should keep its current
`needs_attention` behavior unchanged, since there's no partial progress or review history to hand a human
in that case), route to `paused_gate1` instead, with a note appended to that run's most recent review
rationale mirroring the cap-reached message shape exactly, e.g.: `" [Budget ceiling reached during
auto-retry — sent to Gate 1 with the last available draft despite low score.]"` — reuse whichever specific
script and score are already on hand from the most recent completed review, rather than blocking the run
entirely on a purely financial constraint.

**Confirmed done**: a new `updateReviewLogRationale` repository function appends the budget-note to the
existing `ReviewLog` row (since no fresh review runs on a budget-refused attempt, there's nothing to
insert a note into). **Real, live verification** against the same sandbox DB: a first-attempt refusal
still reaches `needs_attention` unaffected; a retry-attempt refusal reaches `paused_gate1`/`gate1` with
the exact note shape appended to the real prior rationale. Full detail and console output in
`reports/task6.md`.

---

## Documented, not built this task — a real but low-value gap

**`runScriptReviewStage` itself has no budget check of its own** — only `script_generation`'s retry
entry point (line 212) and `video_generation`'s regen entry point (line 684) call `isBudgetAvailable`;
review calls are ungated on both loops. Confirmed real: a run could in principle overshoot its ceiling by
exactly one review call's worth of spend (a Haiku-class call, roughly $0.0025 per the existing usage-row
evidence) before the next check catches it. **Recommendation: log this in
`KNOWN_ISSUES_AND_BLOCKERS.md` rather than fix it here** — the maximum possible overshoot across this
task's own bounded retry loop (at most ~4 review calls per run) is on the order of a cent, and adding a
third `isBudgetAvailable` call site for that is not a good use of this release's scope. Flagged plainly
per this project's own "state the tradeoff, don't fix silently" convention — happy to build it if the
founder disagrees with this call, but recommending against it as currently scoped. **Logged in
`KNOWN_ISSUES_AND_BLOCKERS.md` §3, as recommended.**

---

## Schema Impact
None. R1 reads an existing `ReviewLog` row already written by Bugs Task 3/R3 — no new table, no new
column. R2 reuses the existing rationale-append pattern the cap-reached case already established — no
schema change.

## Business Logic / State Transition
R1 changes no transition — `script_review`'s existing `auto-reject → script_generation` and
`(score ≥ 7 or cap reached) → paused_gate1` transitions (Bugs Task 3/R3) are unchanged; this task only
changes what `script_generation` receives as input on a retry. R2 changes one transition:
`script_generation`'s budget-refusal-on-retry case moves from `→ needs_attention` to `→ paused_gate1`,
matching the cap-reached case exactly; a first-attempt budget refusal is unchanged.

## Testing
```bash
npm run build && npm run lint && npm run typecheck && npm test
```
Plus R1 and R2's own real verification above — this task's bar is a real forced low-score retry showing
the actual prompt content changed between attempts, and a real forced budget-refusal-on-retry reaching
`paused_gate1`, not passing type checks alone. **All done**: build/lint/typecheck clean, `npm test`
108/108 passing (18 files), plus the real live verification described above for R1 and R2.

## Report Template
Generate at `docs/execution/bugs/reports/task6.md`, same shape as `reports/task5.md`. State plainly: (1)
confirmation of R1's exact `fixNotes` wiring path (which function reads which `ReviewLog` row, in what
shape) and whether the video loop's own `fixNotes` source turned out to work the way this doc assumed —
correct this doc's assumption in the report if not; (2) a real before/after example of a retry's actual
prompt content, showing the reviewer's notes present on attempt 2+; (3) R2's real test outcomes for both
the retry-budget-refusal and first-attempt-budget-refusal cases; (4) confirmation that this branch has
merged (or is at least ready) before Sprint 3 Task 9/R2 begins building on this same code region — flag
plainly in the report if Task 9/R2 work is known to be starting soon, so whoever merges this prioritizes
accordingly. **Report filed at `reports/task6.md` — see that doc for the full real verification
detail.**

## Links & References
- [HOTFIXER_AGENT_PROTOCOL.md](../HOTFIXER_AGENT_PROTOCOL.md)
- [TASK_TEMPLATE.md](../../templates/TASK_TEMPLATE.md)
- `docs/execution/bugs/STATUS.md`
- `docs/execution/bugs/reports/task6.md` — the real verification detail for both R1 and R2
- `docs/execution/bugs/tasks/task3.md` — R3, the auto-retry mechanism this task extends with feedback
- `docs/execution/sprint3/tasks/task9.md` — **R2 was waiting on this task merging first, now unblocked**
  — its own premise error (claiming this mechanism didn't exist) has been corrected as of 2026-09-26
- `docs/decisions/VIDEO_GENERATION_LOOP_AND_VISUAL_STRATEGY.md` — the `fixNotes` pattern this task
  mirrors for script generation

## Git Workflow

Per `HOTFIXER_AGENT_PROTOCOL.md`'s Release & Branch Model — one `BUGS_TASK6` branch, one PR, for this
entire release (R1 + R2).

**Status: merged.** PR [#31](https://github.com/Neeraj1002/7AI/pull/31) landed on `main` 2026-09-27 —
Sprint 3 Task 9/R2, which was explicitly blocked on this, is now unblocked (see the Sequencing note
above).

1. From the shared bugs worktree (`D:\Study Material\7AI-bugs`): `git fetch origin && git checkout main
   && git pull` before starting — do not build on whatever branch happens to already be checked out.
2. `git checkout -b BUGS_TASK6`. Record this exact name in `docs/execution/bugs/STATUS.md`'s new Task 6
   row immediately, before the first commit.
3. One commit per item: `BUGS_TASK6_R1: feed reviewer notes back into script-generation retries` and
   `BUGS_TASK6_R2: route retry-budget-refusal to Gate 1, matching the cap-reached case`.
4. Open the PR as a draft the moment the branch is created:
   `gh pr create --draft --title "BUGS_TASK6: script review retry feedback loop" --body "Tracking PR for Bugs Task 6. Live status: docs/execution/bugs/STATUS.md (Task 6). Do not merge until marked ready for review."`
5. Once both items are verified live, write the report and this task's `STATUS.md` row update, commit
   (`BUGS_TASK6_REPORT: ...`), push, then `gh pr ready` — and merge promptly once approved, given Task
   9/R2 is waiting on it. **Done — merged 2026-09-27.**
6. **Never push or merge to `main` directly** and **never commit to a branch this task didn't create** —
   same as every other track.
