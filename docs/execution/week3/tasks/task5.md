# Week 3 Task 5: Wire End-to-End (Video Generation → Video Review → Gate 2) and Close Out Week 3

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** It defines the Git Workflow (branch/commit/PR steps for this task), the `STATUS.md` update this task must make, and the section structure this file follows. This file states only this task's specifics — the template governs everything else, so don't skip it.

**Objective**: Prove the full video-side loop end-to-end — a Gate-1-approved script becomes a reviewed, gated video — and verify resumability and the circuit breaker under real conditions. Close out Week 3 with a `STATUS.md`.
**Duration**: 2–3 hours
**Depends On**: Tasks 1–4, all complete.
**Owning Component**: Orchestrator (integration).
**Success Criteria**: `MVP_ROADMAP_OCT15.md` Section 12's Week 3 target — Video Generation, Video Intelligence own-draft, and Gate 2, wired together — is demonstrably true, including a real (not simulated) circuit-breaker trip and a resumability test across the new stages.

## Task Requirement

Same role as Week 2 Task 7 — integration and verification, not new agent logic. Fix real bugs surfaced by wiring as part of this task, same convention as before.

### Context
`MVP_ROADMAP_OCT15.md` Section 12 (Week 3's stated target), Section 13 (full end-to-end test shape — this task covers steps 5–7). `docs/execution/week2/tasks/task7.md` (the Week 2 version of this task, same method applied one week later).

### Acceptance Criteria
- [ ] A Gate-1-approved script flows through `video_generation → video_review → paused_gate2` without manual intervention between stages.
- [ ] At `paused_gate2`, a real founder reply (any of the three outcomes) resumes correctly.
- [ ] Resumability re-verified: kill mid-`video_generation` (the longest-running stage now, given render time), restart, confirm clean resume with no duplicate `UsageEvent` rows or orphaned partial video files.
- [ ] The video-side budget-gate path (Task 2) is exercised at least once here, not just in Task 2's isolated test.
- [ ] The regen circuit breaker (Task 3/4) is exercised for real at least once — actually let a test video fail repeatedly (or force it to) until `needs_attention` triggers, not just unit-tested in isolation.
- [ ] `docs/execution/week3/STATUS.md` created, same format as Weeks 1–2 — one row per Week 3 task (1–5), Status/Owner/Notes.
- [ ] `docs/execution/week3/SCHEMA.md` and `BUSINESS_LOGIC.md` reconciled against actual implementation, same as Week 2 Task 7's last acceptance criterion.
- [ ] If Week 2 Task 6's live Telegram verification was still open (founder unavailable at the time) and gets closed out this week, update that task's report too — don't leave a stale "still open" note once it's actually been verified.

## Schema Impact

None new. Verification and documentation reconciliation only.

## Business Logic / State Transition

None new — verifies the full Week 3 transition table (`docs/execution/week3/BUSINESS_LOGIC.md` Section 1) holds as an actual sequence.

### Reference
`docs/execution/week3/BUSINESS_LOGIC.md` (all sections).

## Implementation

### Detailed Steps
1. Confirm Tasks 1–4 are all merged and passing their own test commands.
2. Run one full brief through the entire sequence built so far — `intake → script_generation → script_review → gate1 → video_generation → video_review → gate2` — live.
3. Test each of Gate 2's three reply outcomes on separate runs.
4. Run the kill-and-restart resumability test, at least once mid-`video_generation`.
5. Deliberately trigger the video-side budget-gate path once.
6. Deliberately trigger the regen circuit breaker until it hits `needs_attention` — the one path most likely to have only been unit-tested in isolation so far.
7. Write `docs/execution/week3/STATUS.md`.
8. Reconcile `SCHEMA.md`/`BUSINESS_LOGIC.md` against actual implementation.

## Testing

### Test Commands
```bash
npm run build
npm run lint
npm run typecheck
npx tsx scripts/dry-run.ts   # full sequence through gate2, live
```

### Expected Results
- A full run completes through `paused_gate2` and resumes correctly on all three reply types.
- A forced kill-and-restart mid-`video_generation` resumes cleanly.
- The video-side budget-gate path routes to `needs_attention` when deliberately triggered.
- Repeated forced failures trip the regen circuit breaker at exactly `MAX_VIDEO_REGEN_ATTEMPTS`, not before or after.

### How to Verify
1. Run all test commands above.
2. Inspect `pipeline_runs`/`pipeline_stages`/`usage_events`/`review_logs` after each test run and confirm the rows match what the transition table predicts.
3. Read `docs/execution/week3/STATUS.md` back and confirm every task 1–5 has an accurate row before calling Week 3 closed.

## Additional Notes

Optional but valuable, same as Week 2 Task 7's note: a short `docs/execution/week3/reports/week3-summary.md` narrative, if time allows — Week 1 and (presumably) Week 2 both found this worth having.

## Links & References
- [MVP_ROADMAP_OCT15.md](../../roadmap/MVP_ROADMAP_OCT15.md) — Sections 12, 13
- [docs/execution/week3/BUSINESS_LOGIC.md](../BUSINESS_LOGIC.md)
- [docs/execution/week3/SCHEMA.md](../SCHEMA.md)
- [docs/execution/week2/tasks/task7.md](../../week2/tasks/task7.md) — the Week 2 version of this task
- [docs/execution/week3/tasks/task1.md](task1.md) through [task4.md](task4.md)
