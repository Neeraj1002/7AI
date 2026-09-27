# Bugs Task 6: Script Review Auto-Retry Loop Has No Feedback

**Read `docs/execution/bugs/HOTFIXER_AGENT_PROTOCOL.md` and `TASK_TEMPLATE.md` before starting.** One
`BUGS_TASK6` branch, one PR, per the Release & Branch Model.

Found via direct code read, 2026-09-26 — not founder-reported. Bugs Task 3/R3's auto-retry mechanism
(`SCRIPT_REVIEW_AUTO_REJECT_THRESHOLD = 7`, `MAX_SCRIPT_REVIEW_AUTO_RETRY_ATTEMPTS = 3`,
`studio/src/agents/script-review/index.ts:19-20`) is real, live, and confirmed working by direct read of
`runScriptReviewStage`. A prior task doc (`sprint3/tasks/task9.md`) claimed this mechanism didn't exist —
that claim was wrong (checked against a stale checkout) and has already been corrected.

**Sequencing**: Sprint 3 Task 9/R2 (Gate 1/Gate 2 toggles) touches this same code region and is waiting
for `BUGS_TASK6` to merge to `main` first. Land this promptly.

**The real, still-open problem**: the auto-retry loop has no feedback. `runScriptGenerationStage`'s
`stageInput` is identical on every attempt — the reviewer's actual notes (why a script scored low) are
written to the `auto-reject` `ReviewLog` row's `rationale` and never read again. A "retry" is a blind
re-roll, not a targeted fix. `runVideoGenerationStage` already does this correctly (`fixNotes` read from
the prior `video_review` failure and fed into the next attempt's plan) — Script Review's loop was never
given the same treatment.

**Founder-confirmed**: keep the 7/3 threshold and cap exactly as they are — this task is the feedback
mechanism only.

## R1 (Role: `BE`) — Feed the reviewer's notes back into the next script-generation attempt

Mirror the existing `fixNotes` pattern from `runVideoGenerationStage`/`video-generation/plan.ts`.

1. The `auto-reject` `ReviewLog` row (`agent: 'script-review'`, `verdict: 'auto-reject'`,
   `rationale: output.notes`) already written by Bugs Task 3/R3 is the source of truth.
2. `runScriptGenerationStage`'s `stageInput` gains optional `fixNotes`: when `attemptNumber > 1`, look up
   the most recent `auto-reject` row for this run's `script_review` stage and pass its `rationale`
   through; `undefined` on a genuine first attempt.
3. `generateScript()` gains the same optional `fixNotes` param; when present, the prompt gets an
   explicit added instruction to address those specific issues, not just regenerate blindly.
4. No schema change — confirm (and follow) whether the video loop's own `fixNotes` is read live at
   runtime or passed via `creationOptions`, and match whichever it is.

**Verify**: force a low-scoring first attempt, confirm the auto-reject fires with a real, specific
rationale, and confirm the next attempt's actual prompt genuinely includes that rationale text.

## R2 (Role: `BE`) — Budget-refusal mid-retry routes to `needs_attention`; the cap-reached case routes to Gate 1. Make these consistent.

Optional but recommended — small, found during the same investigation. `runScriptGenerationStage`'s
budget check (`isBudgetAvailable`) failing on a retry (`attemptNumber > 1`) currently ends the run at
`needs_attention`, identical to a first-attempt refusal — but a retry-cap-reached script still reaches a
human at `paused_gate1`. Running out of shared/pooled budget mid-retry is arguably the same kind of
normal outcome as hitting the retry cap.

**Fix**: when `isBudgetAvailable` fails specifically on `attemptNumber > 1`, route to `paused_gate1`
instead, with a note appended to the run's most recent review rationale mirroring the cap-reached
message shape, e.g.: `" [Budget ceiling reached during auto-retry — sent to Gate 1 with the last
available draft despite low score.]"`. A genuine first-attempt budget refusal is unchanged.

**Verify**: force a budget refusal on a retry attempt specifically (temporary low
`AgentQuota.budgetCeilingUsd`) — confirm `paused_gate1` with the new note; confirm a first-attempt
refusal is unaffected (`needs_attention`).

## Documented, not built — `script_review` has no budget check of its own

Only `script_generation`'s retry entry point and `video_generation`'s regen entry point call
`isBudgetAvailable` — review calls are ungated on both loops. Real but low-value (max possible overshoot
across this task's bounded loop is on the order of a cent). Recommendation: log in
`KNOWN_ISSUES_AND_BLOCKERS.md`, don't fix here.

## Schema Impact
None.

## Testing
`npm run build && npm run lint && npm run typecheck && npm test`, plus R1/R2's own real verification.

## Links & References
- `docs/execution/bugs/HOTFIXER_AGENT_PROTOCOL.md`, `docs/execution/templates/TASK_TEMPLATE.md`
- `docs/execution/bugs/STATUS.md`
- `docs/execution/bugs/tasks/task3.md` — R3, the mechanism this task extends
- `docs/execution/sprint3/tasks/task9.md` — R2 there depends on this task merging first
- `docs/decisions/VIDEO_GENERATION_LOOP_AND_VISUAL_STRATEGY.md` — the `fixNotes` pattern mirrored here
