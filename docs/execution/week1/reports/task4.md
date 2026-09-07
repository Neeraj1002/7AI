# Week 1 Task 4: Orchestrator State Machine Skeleton

**Date**: 2026-09-07
**Status**: Complete — including the kill-mid-stage/restart resumability test
**Files Created**: `state-machine.ts`, `resume-on-startup.ts`, `retry-with-backoff.ts`,
`scripts/dry-run.ts` (test harness)
**Tests**: Real kill-and-restart resumability test performed (not just a unit test)

## What Was Done

- `src/run-pipeline/state-machine.ts`: `createRun` (delegates to the repository) and
  `runIntakeStage` — creates a stage attempt, executes the stage processor under the retry
  wrapper, and persists the stage's completion together with the run's advance in sequence
  (persist-before-advance, `BUSINESS_LOGIC.md` Section 1). On success: run stays `running`,
  `currentStage` advances to `script_generation` (the next value in `STAGE_NAMES`) even though
  nothing processes it yet this week — matching the transition table's "unreachable this week
  — a Week 1 test run stops here deliberately." On failure: run moves to `needs_attention`
  (never `failed`) with `lastError` set, per the "bad brief is human-fixable, not a system
  fault" rule.
- `src/run-pipeline/resume-on-startup.ts`: on boot, queries every `PipelineRun` with
  `status = 'running'`, inspects its most-recently-created `PipelineStage` row, and either
  leaves it alone (latest stage `completed` — nothing to resume into yet), re-runs it (latest
  stage `running` — the process died mid-flight), or recovers a pathological no-stage-rows
  case. Wired into `src/index.ts`, so it runs automatically on every process start.
- `src/run-pipeline/retry-with-backoff.ts`: `withRetryAndCircuitBreaker` — exponential backoff
  (`500ms * 2^(attempt-1)`) up to `MAX_RETRIES_PER_STAGE` (3), distinguishing
  `TransientStageError` (retries) from `NonTransientStageError` (fails immediately, no retry).
  Exhausting retries throws `CircuitBreakerTrippedError`, which the state machine treats the
  same as any other stage failure — routes to `needs_attention`. `MAX_REGENERATION_LOOPS` is
  defined as a constant for the cross-stage regeneration cap mentioned in `BUSINESS_LOGIC.md`
  Section 4, unused this week since there's no regeneration loop yet.

## The resumability test (acceptance criterion, not skipped)

Ran via `scripts/dry-run.ts` with `INTAKE_STAGE_STUB=1` (see Task 5's Deviations for why a
stub was used instead of a real LLM call):

1. `setup` created a fresh `PipelineRun`.
2. `start <runId>` began the intake stage (stub sleeps 8s to simulate real work).
3. ~3 seconds in, the node process was killed (`Stop-Process -Force`) — confirmed via
   direct DB query that the run was `status=running, currentStage=intake` and its stage row
   was orphaned at `status=running, attemptNumber=1`.
4. A fresh process ran `resume` (calling the same `resumeOnStartup()` the real app calls on
   boot). Log output: `stage 'intake' (attempt 1) was mid-flight when the process stopped —
   re-running it from its persisted input`.
5. Final state, verified by direct query: **exactly one** `PipelineRun` row (no duplicate),
   attempt 1 still orphaned at `running` (expected — it never got to mark itself failed), a
   new attempt 2 at `status=completed` with real output, and the run correctly advanced to
   `currentStage=script_generation, status=running`.
6. A second `resume` pass against the now-`completed`-latest-stage run correctly no-op'd
   (idempotent) rather than re-triggering.

This is the exact scenario the acceptance criteria calls out as the one not to skip.

## Test Results

```
npm run build   -> clean
npm run lint    -> clean
scripts/dry-run.ts setup/start/kill/resume  -> resumed cleanly, no duplication, no data loss
```

## Deviations from Spec

- The kill-mid-stage test used the intake stage running against a **stub** LLM call
  (`INTAKE_STAGE_STUB=1`, see `src/run-pipeline/parse-brief.ts`'s `stubParseBrief`), not a
  real Anthropic call — no API key was available this session. This still exercises the real
  production code path (`state-machine.ts`, `resume-on-startup.ts`, all repository writes)
  end-to-end; only the LLM call itself is faked. See Task 5's report for why this doesn't
  block confidence in the mechanism.
- `pipeline_runs.retryCount` is not incremented by the retry wrapper — it exists on the schema
  but nothing writes to it yet. Not required by this week's acceptance criteria; flagging so
  it isn't assumed to be live.

## Addendum (2026-09-07, added by Week 2 Task 3)

The LLM layer landed and `parse-brief.ts` was migrated onto it (Week 2 Tasks 1 and 3), and its
real-call path was verified against a genuine Claude response (see
`docs/execution/week1/reports/task5.md`'s addendum and
`docs/execution/week2/reports/task3.md` for the full caveat about *how* — a sandbox-specific
`ANTHROPIC_BASE_URL`, not a production key). **The kill-mid-stage resumability test itself was
not re-attempted against a real call** — a real call now completes in ~2 seconds versus the
stub's deliberate 8-second delay, making a reliable mid-flight kill meaningfully harder to time
without adding an artificial delay back in, and Week 2 Task 3 explicitly marked this
re-verification optional, not required for its own completion. The mechanism this task actually
tests (persist-before-advance, stage-attempt bookkeeping, idempotent resume) doesn't depend on
which function fills in the stage's `output` — it was already proven correct with a stub
standing in for *any* slow external call — so this is a nice-to-have re-confirmation, not an
open gap in confidence.

## Sign-Off

- Task Objective: Met
- Business Logic: Matches `BUSINESS_LOGIC.md` Section 1
- Tests: Passing (real kill-and-restart performed, not simulated); real-call variant of the same test remains optional/not done, see addendum
- Ready for Integration: Yes
