# Week 2 Business Logic Delta

**Status**: No new control flow this week (so far).

None of Week 2's tasks to date (Task 1: LLM layer, Task 2: notification interface, Task 3: Intake-parsing migration) add new `PipelineRun`/`PipelineStage` transitions — they change internal implementation (how an LLM call is made, how the founder is notified) without changing when or why the state machine moves. If a later Week 2 task introduces new control flow (e.g. Gate 1's pause/resume transitions, once that's scoped), this file gets updated in place, per the usual convention: this file is a diff against the prior week, not a cumulative restatement.

## Reference
- `docs/execution/week1/BUSINESS_LOGIC.md` — Week 1's state machine and control-flow rules, still current
