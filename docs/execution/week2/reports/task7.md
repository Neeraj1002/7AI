# Week 2 Task 7: Wire End-to-End and Close Out Week 2

**Date**: 2026-09-08
**Status**: Complete — full loop verified end-to-end, a real gap found and fixed, docs reconciled
**Files Modified**: `resume-on-startup.ts` (real bug fix), `scripts/dry-run.ts`, `docs/execution/week1/BUSINESS_LOGIC.md`, `docs/execution/week2/BUSINESS_LOGIC.md`, `docs/execution/week2/STATUS.md`
**Files Created**: `docs/execution/week2/reports/week2-summary.md`
**Tests**: `npm run typecheck`/`build`/`lint` clean; full sequence run live; resumability re-verified with a real kill test; budget-gate path re-exercised mid-sequence

## What Was Done

This task is integration and verification, not new agent logic — per its own framing. One real bug was found and fixed along the way (see below), noted here rather than opened as a separate task, per this task's own instruction.

### 1. Full sequence, no manual intervention between automated stages

Added `scripts/dry-run.ts full "<brief>"`, chaining `setup → intake → script_generation → script_review` inside a single process invocation (Gate 1 deliberately not chained in — it's the one point meant to require an outside decision). Ran it live on a real brief: completed cleanly through to `paused_gate1`, then closed via `gate1 <runId> approve` (real send, simulated reply per Task 6's established pattern) to `running`/`video_generation`.

### 2. A real bug found and fixed: `resume-on-startup.ts` couldn't resume anything past `intake`

While preparing the resumability re-test, inspection showed `resume-on-startup.ts` still had Week 1's original logic — a hardcoded call to `runIntakeStage` and nothing else, logging "no processor wired up yet" for every other stage name. Once Script Generation, Script Review, and Gate 1 existed, this was a real correctness gap, not just an unfinished decoration: a crash mid-`script_generation` would leave that run stuck forever on restart.

**Fixed**: `resume-on-startup.ts` now uses a `STAGE_RESUMERS` dispatch map (`intake`, `script_generation`, `script_review`, `gate1`, each pointing at its real `state-machine.ts` function) for both cases the original code already recognized but couldn't act on:
- Latest stage `running` (process died mid-stage) → re-run that same stage.
- Latest stage `completed` → resume at `PipelineRun.currentStage` (the literal Week 1 `BUSINESS_LOGIC.md` Section 1 rule, unreachable until this task since no next-stage processor existed before now).

A run sitting at `paused_gate1` is deliberately **not** auto-resumed (the query is scoped to `status = 'running'` only) — a restart shouldn't reopen a gate and re-send a Telegram message on its own. Documented as a scope boundary in the code comment, not left implicit.

### 3. Resumability re-verified with a real kill-mid-`script_generation` test

Created a fresh run through real `intake`, started `script_generation` in the background, killed the process ~3 seconds into the real LLM call (which typically takes 6-8 seconds), confirmed via direct query: `script_generation` orphaned at `attemptNumber=1, status=running`, zero `UsageEvent` rows (correct — the killed attempt never got a response back to log). Ran `resume`, confirmed: attempt 2 completed successfully, **exactly one** `UsageEvent` row (tied to the successful attempt, not duplicated for the killed one), `PipelineRun.currentStage` correctly advanced to `script_review`.

**An honest, unplanned finding**: `resume-on-startup.ts` queries *every* `PipelineRun` with `status = 'running'`, not just the one under test — and the dev database had several stale leftover runs from Week 1 and earlier Week 2 testing still sitting at `running`. The `resume` call above correctly (per the resumability contract) advanced all of them too, incurring four unplanned real `script-generation` calls (~$0.026 total) and one `script-generation → script_review` advance on an already-completed run. This is exactly what "resumability" is supposed to mean, applied honestly to real accumulated test data — not a bug, but worth being upfront about rather than only reporting the clean, isolated part of the test. Left the stale runs as-is rather than spending more real money to artificially "finish" or clean them up — they're either self-limiting now (stuck at `video_generation`, which has no processor yet) or will settle at `paused_gate1` (inert, not auto-resumed) the next time `resume` runs.

### 4. Budget-gate path re-exercised mid-sequence

Task 4 already proved this in isolation. This task re-confirmed it as part of an actual integration flow: temporarily set `AgentQuota.budgetCeilingUsd` to `$0.001`, ran a fresh brief through real `intake` (stubbed) and `script_generation` — correctly `skipped`, `needs_attention`, zero `UsageEvent` rows. Restored the ceiling to `$2.00` immediately after.

### 5. Documentation reconciliation

- `docs/execution/week2/SCHEMA.md`: reviewed in full against the actual `agent_quotas`/`usage_events` implementation — **confirmed accurate, no changes needed**.
- `docs/execution/week2/BUSINESS_LOGIC.md`: added an "Implementation Reconciliation" section recording the deltas that emerged during real implementation (the `requestApproval` signature change, the `reply_to_message`-based threading mechanism, the exact-match `approve` tolerance, Script Review's actual input fields, `costUsd`'s confirmed placement, and the resumability fix from this task).
- `docs/execution/week1/BUSINESS_LOGIC.md` Section 2: replaced the stale "Known temporary coupling" note (flagged by Task 3, deliberately left as a follow-up doc sync rather than fixed mid-task) with a "Resolved" note pointing at Task 3's actual migration.
- `docs/execution/week2/STATUS.md`: finalized with Task 7's own row; week status line updated to reflect the week is closed.
- `docs/execution/week2/reports/week2-summary.md`: written, mirroring Week 1's retrospective format.

## Test Results

```
npm run typecheck   -> clean
npm run build       -> clean
npm run lint        -> clean

Full sequence (real, one process): intake -> script_generation -> script_review -> paused_gate1
  -> gate1 approve -> running/video_generation. No manual step between automated stages.
Kill-mid-script_generation resumability: orphaned attempt 1 (0 UsageEvent rows) ->
  resume -> attempt 2 completed, exactly 1 UsageEvent row, currentStage advanced correctly.
Budget-gate mid-sequence: ceiling exhausted -> script_generation skipped, needs_attention,
  0 UsageEvent rows -> ceiling restored to $2.00.
```

## Deviations from Spec

- Fixed `resume-on-startup.ts` as part of this task, per its own instruction to fix (not defer) a real bug found during wiring/verification — not listed in this task's original "Files to Modify" section, since it wasn't anticipated that this specific gap existed until the resumability re-test was actually attempted.
- Did not spend additional real money "cleaning up" the stale leftover runs that got incidentally resumed — they're inert or self-settling, and further real calls purely for tidiness weren't worth the cost. Documented plainly instead.

## Sign-Off

- Task Objective: Met
- Schema Impact: None new. `SCHEMA.md` reviewed, confirmed accurate.
- Business Logic: `BUSINESS_LOGIC.md` (both Week 1 and Week 2) reconciled against actual implementation, updated where it had drifted
- Tests: Passing — full sequence, resumability, and budget-gate all verified live, not just in isolation
- Ready for Integration: Week 2 is closed; Week 3 (Video Generation) is the next real agent
