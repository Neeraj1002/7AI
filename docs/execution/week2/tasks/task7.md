# Week 2 Task 7: Wire End-to-End (Intake → Script Generation → Script Review → Gate 1) and Close Out Week 2

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** It defines the Git Workflow (branch/commit/PR steps for this task), the `STATUS.md` update this task must make, and the section structure this file follows. This file states only this task's specifics — the template governs everything else, so don't skip it.

**Objective**: Prove the full Week 2 text-only loop end-to-end — a brief goes in, a script comes out the other side of a real human decision — and verify resumability across the now-longer stage sequence. Close out Week 2 with a `STATUS.md`.
**Duration**: 2–3 hours
**Depends On**: Tasks 1–6, all complete.
**Owning Component**: Orchestrator (integration, not a new agent).
**Success Criteria**: `MVP_ROADMAP_OCT15.md` Section 12's Week 2 target — "Wire Orchestrator → Script Generation → Script Review → Gate 1, test end-to-end on text only" — is demonstrably true, plus a kill-and-restart resumability test across the full sequence (not just Intake, which is all Week 1 proved).

## Task Requirement

This task doesn't add new agent logic — it's integration and verification. If wiring reveals a real bug in Tasks 4–6, fix it as part of this task and note the deviation in the report (same convention Week 1 used), rather than opening a new task for what's really a bug in already-written code.

### Context
`MVP_ROADMAP_OCT15.md` Section 12 (Week 2's stated target), Section 13 (the shape of a full end-to-end test, text-only subset), `docs/execution/week1/reports/week1-summary.md` (how Week 1 verified resumability — same method, longer sequence).

### Acceptance Criteria
- [ ] A single real brief, submitted once, flows through `intake → script_generation → script_review → paused_gate1` without manual intervention between stages.
- [ ] At `paused_gate1`, a real founder reply (any of the three outcomes) resumes correctly.
- [ ] Resumability re-verified across the longer sequence: kill the process mid-`script_generation` (or mid-`script_review`), restart, confirm it resumes from the correct stage with no duplicate `UsageEvent` rows and no lost `PipelineRun` state — Week 1 proved this for Intake alone; this task proves it holds with more stages in play.
- [ ] The budget-gate path (Task 4) is exercised at least once in this task's verification, not left as something only Task 4's own report checked in isolation.
- [ ] `docs/execution/week2/STATUS.md` created, mirroring `docs/execution/week1/STATUS.md`'s format — one row per Week 2 task (1–7), Status/Owner/Notes.
- [ ] `docs/execution/week2/SCHEMA.md` and `BUSINESS_LOGIC.md` reviewed against what actually got built and corrected if implementation diverged from the proposed shape (both currently describe the *plan*; this task is the point where they should be confirmed accurate or updated).

## Schema Impact

None new. Verification only, plus documentation reconciliation per the last acceptance criterion above.

## Business Logic / State Transition

None new. This task verifies the full transition table in `docs/execution/week2/BUSINESS_LOGIC.md` Section 1 holds together as an actual sequence, not just as individually-tested stages.

### Reference
`docs/execution/week2/BUSINESS_LOGIC.md` (all sections).

## Implementation

### Files to Modify
Likely none, unless verification surfaces a real bug in Tasks 4–6's wiring (e.g. a `currentStage` transition that doesn't quite match the table). If so, fix in place and document the deviation.

### Detailed Steps
1. Confirm Tasks 1–6 are all merged and passing their own test commands.
2. Run one full brief through the sequence, live (real LLM calls, real Telegram) — this is the actual first end-to-end proof the system does anything a human would recognize as "the loop."
3. Test each of the three Gate 1 reply outcomes on separate runs.
4. Run the kill-and-restart resumability test, at least once mid-`script_generation` and once mid-`script_review`.
5. Deliberately trigger the budget-gate path once (e.g. temporarily set `AgentQuota.budgetCeilingUsd` low) and confirm it routes to `needs_attention` correctly mid-sequence, not just in Task 4's isolated test.
6. Write `docs/execution/week2/STATUS.md`.
7. Reconcile `SCHEMA.md`/`BUSINESS_LOGIC.md` against actual implementation.

### Integration Points
This task is the integration point — no new integration surface of its own.

## Testing

### Test Commands
```bash
npm run build
npm run lint
npm run typecheck
npx tsx scripts/dry-run.ts   # full sequence, live
```

### Expected Results
- A full run completes through `paused_gate1` and resumes correctly on all three reply types (across separate test runs).
- A forced kill-and-restart mid-sequence resumes cleanly, at both of the two new stages.
- The budget-gate path routes to `needs_attention` when deliberately triggered.

### How to Verify
1. Run all test commands above.
2. Inspect `pipeline_runs`/`pipeline_stages`/`usage_events`/`review_logs` after each test run and confirm the rows match what the transition table predicts — not just "no crash."
3. Read `docs/execution/week2/STATUS.md` back and confirm every task 1–7 has an accurate row before calling Week 2 closed.

## Additional Notes

This is Week 2's version of what Week 1's `week1-summary.md` did — the narrative proof that the week's pieces actually fit together, not just that each task's own report says "done" in isolation. Worth writing a short `docs/execution/week2/reports/week2-summary.md` (optional, but Week 1 found it valuable per its own retrospective) if time allows.

## Links & References
- [MVP_ROADMAP_OCT15.md](../../roadmap/MVP_ROADMAP_OCT15.md) — Sections 12, 13
- [docs/execution/week2/BUSINESS_LOGIC.md](../BUSINESS_LOGIC.md)
- [docs/execution/week2/SCHEMA.md](../SCHEMA.md)
- [docs/execution/week1/reports/week1-summary.md](../../week1/reports/week1-summary.md)
- [docs/execution/week2/tasks/task1.md](task1.md) through [task6.md](task6.md)
