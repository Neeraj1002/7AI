# Bugs Task 6: Script Review Auto-Retry Loop Has No Feedback

**Date**: 2026-09-27
**Status**: Complete. Both items live-verified against a real, isolated sandbox database. **Merged to
`main` via `BUGS_TASK6` / PR [#31](https://github.com/Neeraj1002/7AI/pull/31) (2026-09-27).**
**Files Created**: `tasks/task6.md`, this report; a new function in `review-log.repository.ts`.
**Files Modified**: `studio/src/agents/script-generation/index.ts`, `studio/src/run-pipeline/state-machine.ts`,
`studio/src/models/repositories/review-log.repository.ts`, `docs/execution/KNOWN_ISSUES_AND_BLOCKERS.md`
**Tests**: `npm run build`/`lint`/`typecheck` pass; `npm test` — 108/108 passing (18 files). R1 and R2 each
additionally verified live against an isolated sandbox Postgres database (created, migrated, and dropped
this session — never the shared dev DB).

## R1's `fixNotes` wiring — confirmed, and the doc's own open question resolved

The task doc asked me to confirm whether the video loop's `fixNotes` is read live at runtime or passed via
`creationOptions`, and to match whichever it is. Confirmed by direct read of `runVideoGenerationStage`
(`state-machine.ts:643-655`): it's read **live at runtime** — `listReviewLogsForRun(runId)`, reversed, find
the most recent matching log, take its `rationale`. Not persisted via `creationOptions` anywhere. R1
mirrors this exactly: `runScriptGenerationStage` now does the same lookup (filtering for
`agent === 'script-review' && verdict === 'auto-reject'`) when `attemptNumber > 1`, threading the result
into `generateScript({ ..., fixNotes })`, which appends an explicit "address these specific issues" line to
its prompt when `fixNotes` is present.

**Real, live verification** — not just "the parameter was passed." Against an isolated sandbox DB, with
`callLLM` mocked (so the real `buildUserMessage` prompt-construction code actually ran and could be
intercepted) and `reviewScript` mocked to score 3 then 9:
```
generateScript calls (== prompts captured): 2 (expect 2)
Attempt 1 prompt contains fixNotes wording: false
Attempt 2 prompt contains fixNotes wording: true
Attempt 2 prompt contains the real rationale text: true
Final status/stage: paused_gate1 gate1
```
Attempt 1's actual captured prompt has no fixNotes text; attempt 2's actual captured prompt contains both
the injected instruction and the exact rationale string from attempt 1's `auto-reject` review ("Weak hook:
the opening is generic and slow, no cold open."). This is the real prompt Anthropic would have received,
not an assumption about the wiring.

I did not attempt the task doc's stretch goal (confirming a real second-attempt script measurably improves
on a real reviewer's real complaint) — that needs two real LLM calls end to end with a real, subjective
before/after comparison, which is a founder-judgment call, not something a mocked unit test can prove.

## R2 — both cases confirmed live

`isBudgetAvailable` failing on `attemptNumber > 1` now updates the run's most recent `script-review`
`ReviewLog` row (via the new `updateReviewLogRationale`, since no fresh review runs on a budget-refused
attempt — nothing to insert a note into, unlike the cap-reached case) and routes to `paused_gate1`/`gate1`
instead of `needs_attention`. A first-attempt refusal is untouched.

**Live results** (same sandbox DB, real `AgentQuota` rows):
```
--- R2 first-attempt refusal ---
status: needs_attention | lastError: Script Generation refused: the pooled budget ceiling ...

--- R2 retry-budget-refusal ---
status: paused_gate1 | currentStage: gate1
latest review rationale: Weak hook, needs work. [Budget ceiling reached during auto-retry — sent to Gate 1 with the last available draft despite low score.]
```
Both cases behave exactly as specified: the first-attempt case is unaffected; the retry case reaches Gate 1
with the exact note shape requested, appended to the real prior review's real rationale text.

## Documented, not built
Logged in `docs/execution/KNOWN_ISSUES_AND_BLOCKERS.md` §3, per the task's own recommendation: `script_review`
has no `isBudgetAvailable` check of its own; maximum possible overshoot is on the order of a cent across
this task's bounded retry loop. Not fixed, per the task's own scoping call.

## Schema Impact
None — confirmed. `fixNotes` is resolved from an existing `ReviewLog` row; R2 updates an existing row's
`rationale` column, no new column.

## Sequencing note — resolved
**Sprint 3 Task 9/R2 (Gate 1/Gate 2 toggles) was waiting on this branch merging to `main` first** — it
touches this exact same code region (the `fixNotes` lookup and the budget-routing fix both sit right next
to where its own `gate1Enabled` branch will land). **This branch has now merged (PR #31, 2026-09-27) — Task
9/R2 is unblocked and can proceed**, building directly on top of this code rather than reintroducing a
parallel branch.

## Test Results
```
studio/: build PASS, lint PASS, typecheck PASS, npm test — 18 files / 108 tests passing
```
Plus the real console output reproduced in full above for R1 and R2.

## Sign-Off
- R1: confirmed live — the actual constructed prompt, not just the parameter, carries the real rationale.
- R2: confirmed live — both the retry-refusal and first-attempt-refusal cases behave as specified.
- Ready for Integration: yes. **Merged.**

## Links & References
- `docs/execution/bugs/tasks/task6.md`, `docs/execution/bugs/STATUS.md`
- `docs/execution/bugs/tasks/task3.md` — R3, the mechanism this task extends
- `docs/execution/sprint3/tasks/task9.md` — was blocked on this branch merging first, now unblocked
- `docs/decisions/VIDEO_GENERATION_LOOP_AND_VISUAL_STRATEGY.md` — the `fixNotes` pattern mirrored here
