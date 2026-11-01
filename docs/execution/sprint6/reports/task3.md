# Sprint 6 Task 3 report: Story Tests (P19), PR A

**Branch**: `SPRINT6_TASK3A_BE` · **Worktree**: `D:\Study Material\7AI-SPRINT6\task3a` · **PR**: not opened yet (draft once the founder has approved the prompts and the tests below pass).

**Status of this section (PR A)**: code written, offline tests written. **No live call has been made.** The Task 3 doc says the founder approves the four prompts before any live check; PR A has two of them (below), so the wiring check waits for that approval.

## PR A: Part A, angle pairing

### R0: confirmed / wrong / unknown

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | Where intake ends and the script begins | **Confirmed.** `runIntakeStage` (`run-pipeline/state-machine.ts`) completes the intake stage and moves the run to `script_generation` in one transaction. `driveLoop` (`pipeline-runner.ts`) then calls `runScriptGenerationStage`. **No wait state existed between them.** Intake returns `IntakeParsed = {topic, constraints}`. | `state-machine.ts` `runIntakeStage`; `pipeline-runner.ts` `driveLoop` |
| 1a | Is the new wait a flow change? | **No, with the design below.** The wait is a status in the database, not an in-memory gate. Gate 1 and Gate 2 block on an in-memory promise and need a re-open path after a restart; `paused_angle` does not. The driver loop simply stops at it, and `runs.chooseAngle` moves the run on and starts a new driver. Nothing is lost on a restart, and `resume-on-startup` only resumes `running` and `paused_gate*` runs, so it never touches a `paused_angle` run. Gate 1 is unchanged. | `pipeline-runner.ts`, `resume-on-startup.ts` |
| 1b | Difference between Short and long at this step | **None at intake.** Intake is the same function for both; `videoKind` is read later. Part A is the same code for both, as decision 4 asks. | `runIntakeStage` has no kind branch |
| 3 | Script Review / Part B | Not touched in PR A. Belongs to PR B. | |
| 4 | Registry | **Confirmed.** `LLM_PROVIDERS = ['anthropic']`: **only one model family is available.** Script writer is `claude-sonnet-5-5`. Both new purposes use the same model (the reader must be at least as strong as the writer). Different-family reader is **not possible today**; stated here as the task asks. Each purpose declares `maxOutputTokens` and `reasoning`. Automatic retry: `callLLM` retries a cut-off once at double the limit and may make transient and structured-output fallback retries; each goes through a `RetryGuard`. Part A passes a guard that refuses every extra call, so a cut-off becomes a recorded error and Part A cannot exceed three calls. | `llm/registry.ts`, `llm/types.ts`, `llm/index.ts`, `llm/failure-policy.ts` |
| 5 | Per-channel config | **Confirmed.** `ChannelProfileDataSchema` (zod, strict) is JSON in a profile-version row. One optional `storyTests.readerPersona` string fits it with **no migration**. Resolved as `readerPersona: string \| null` (null = the neutral reader). | `channel-profile/schema.ts`, `resolve.ts` |
| 6 | Storage for the record | **Confirmed.** `pipeline_stages.output` is JSON; `patchStageOutput` and `completeStage` write it. Part A is written with the intake stage's completion (same transaction as the status change), so it survives a restart. Tenant: `runs.get` checks `run.tenantId === ctx.tenantId`; `chooseAngle` uses `assertGateOwnership`. | `pipeline-stage.repository.ts`, `runs.ts` |
| 9 | Designer screens | **Unknown** (none seen in the repo). The app work is its own PR. | |
| | Numeric check reuse (R1) | **Confirmed reusable as-is.** `normalizedNumbers` and `numericSourceText` are exported, so the figure flag calls them directly; no second checker. The comparison text is the brief plus the intake result. | `agents/script-review/brief-checks.ts`, `numbers.ts` |
| | Where a run's other statuses are mapped | Backend: `inspect-run-client.ts` (status enum list), `channels.ts` (in-flight statuses on archive), `runs.cancel` (a run at `paused_angle` can now be cancelled). Not changed, with reasons below. | |

### Not changed on purpose (for the architect)

- `admin.repository.ts`, `admin/overview.ts`, `founder-digest.ts`, `gate-reminder.ts`, `run-settings.ts` list `paused_gate1` / `paused_gate2` for "waiting on the founder" counts, reminders and settings edits. A `paused_angle` run is not in them, so it gets **no reminder or push** and is not counted as waiting. Whether it should is an R0 finding for the architect; adding a reminder is a flow change beyond a card, which the task says to stop and ask about.
- The app's status maps (`lib/run-view.ts` and the others the contract lists) are the app PR's work.

### Contracts as built

- `runs.get` now returns `storyTests` (contract C3). The Part B half, `scriptCheck`, is always `null` in PR A.
- `runs.chooseAngle({ runId, angleId | null })` (contract C4): `BAD_REQUEST` for a foreign angle id, `CONFLICT` when the run is not at `paused_angle`, the same `assertGateOwnership` as Gate 1. The choice and the status change are one transaction, and the status change is conditional on `paused_angle`, so two answers cannot both win.
- New run status `paused_angle`; migration `20261101000000_sprint6_task3_paused_angle` drops and re-adds `pipeline_runs_status_check` with the extra value. `foundation_schema` is not edited. **Rollout**: apply with `prisma migrate deploy` before the code that can write the status, as `sprint5/runbooks/task2-rollout.md` did.
- Switch: `STORY_TESTS_ENABLED=1` in the server environment. Off by default, so merging changes nothing until it is set.
- If the angle step ends as "not run" (the reader or writer failed, the angles were unusable, the cap was reached), the run does **not** pause: the record says why and the script step follows. This differs from the doc's R1 wording ("the founder may continue without an angle"), which would need a card for a case with nothing to choose from; flagged for the architect.

### The two Part A prompts (for the founder's approval)

Exact text is in `studio/src/story-tests/prompts.ts`: `ANGLES_SYSTEM` / `anglesUser`, and `pairReaderSystem` / `pairReaderUser`. They name no channel and no niche. The reader prompt contains only the persona (neutral default or the channel's optional line) and the shuffled id, title and promise lines.

### Spend (offline arithmetic, not a live number)

Worst case per call is checked before it is made: input at about 4 characters a token plus the full output limit, at the real Sonnet 5.5 price ($2 / $10 per million). Output limits: angles 3,000, each reader 1,500. Worst case for the three calls with realistic inputs is under $0.07, inside the $0.10 cap; a test asserts it stays under $0.10.

### Tests

`studio/src/story-tests/angle-step.test.ts` (mocked model): valid and invalid angle replies, the figure flag, clear winner and no clear winner, reversal, invented id, click equal to skip, no third call, the blind input, a thrown call not retried, a tiny cap skipping every call, a cap that skips only the readers, metering totals, the choice stored as the reader's pick / another / skip, a foreign id and a second choice rejected, and the view for old, running, waiting runs.

### Not verified / still to do in PR A

- Router and state-machine behaviour (`chooseAngle` tenant check and CONFLICT, the pause in `runIntakeStage`, `runs.cancel` at `paused_angle`, a restart at `paused_angle`) has **no test yet**: they need a database. The pure parts (choice rules, view, verdict) are tested.
- Test run (no database available here): `tsc --noEmit` clean; eslint clean on touched folders; full suite with `--maxWorkers=4`: 1746 passed, 6 failed in `runs.cancel`, `runs.long-form-actions` and `runs.long-form` tests, which call `sumUsageCostForRun` on a real database ("Authentication failed ... credentials for `x`"). Not compared against a baseline run on `main`.
- No live check has been run (waits for prompt approval).
- Grep proof, the same-cause sweep (R9) and the Task 1 finding are PR C's sections.

### Plain statement

The readers are text-only. They cannot judge voice, pacing or visuals, they are advisory, and they are not calibrated against any past or live video.
