# Week 2 Task 3: Migrate Intake Parsing onto the LLM Layer (closes Week 1's deferred verification)

**Objective**: Migrate `studio/src/run-pipeline/parse-brief.ts` off its direct `@anthropic-ai/sdk` call onto `studio/src/llm/` (Task 1), and close out the real-LLM verification criterion that Week 1 Task 4 and Task 5 deliberately left pending.
**Duration**: 1–2 hours
**Depends On**: Task 1 (LLM layer) — cannot start before it.
**Owning Component**: Orchestrator (Intake parsing, per `AGENT_FLEET_DESIGN.md` 4.10)
**Success Criteria**: `parse-brief.ts` calls the LLM layer instead of instantiating `Anthropic` directly; the stub test path still works; Week 1's deferred verification is either closed out (if a real key is available) or explicitly re-flagged with the correct current blocker (a key, not the missing layer, since the layer will exist after this task).

## Task Requirement

This task is explicitly the payoff of Task 1 and the reason Week 1 deferred real-LLM verification in the first place (see `docs/execution/week1/reports/task4.md`, `task5.md`, and the "Known temporary coupling" note in `docs/execution/week1/BUSINESS_LOGIC.md`). Do the migration, then re-attempt the verification Week 1 couldn't do.

### Context
`docs/decisions/LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md` — "Current state" section describes exactly this task as the intended close-out. `docs/execution/week1/reports/week1-summary.md` — "What Deviated from the Docs, and Why," item 3.

### Acceptance Criteria
- [ ] `parse-brief.ts` no longer imports `@anthropic-ai/sdk` or checks `Anthropic.APIConnectionError`/`RateLimitError`/`InternalServerError` directly — only `studio/src/llm/`'s own error types, via the existing `TransientStageError`/`NonTransientStageError` catch logic already in place.
- [ ] The existing stub path (`INTAKE_STAGE_STUB=1`, `stubParseBrief`) still works unchanged — this task must not regress Week 1's stub-based test coverage.
- [ ] If a real Anthropic key is available in `.env.local`: `scripts/dry-run.ts` run *without* the stub flag succeeds end-to-end (real brief → real LLM call via the new layer → sensible structured output).
- [ ] If a real key is available: Week 1 Task 4's and Task 5's reports, and `docs/execution/week1/STATUS.md`, get a short addendum noting the deferred criterion is now closed, with a link to this task's report.
- [ ] If no real key is available yet: this task's report says so plainly, and reframes the blocker correctly — it's now "waiting on a key," not "waiting on the LLM layer," since the layer will exist after this task. Don't leave the old "blocked on LLM abstraction layer" language standing once it's no longer accurate.

## Schema Impact

No schema changes.

## Business Logic / State Transition

No new transitions — the Intake stage's state-machine behavior (`pending → running → completed`, or `needs_attention` on a bad brief) is unchanged; only the internal mechanism of the LLM call itself changes. Once this task lands, the "Known temporary coupling" note in `docs/execution/week1/BUSINESS_LOGIC.md` Section 2 becomes stale — this task's report should flag that so it gets cleaned up (a follow-up doc sync, not something to edit mid-task).

### Reference
`docs/execution/week1/BUSINESS_LOGIC.md` Section 2 (Intake Parsing).

## Implementation

### Files to Modify
- `studio/src/run-pipeline/parse-brief.ts` — replace the direct `Anthropic` client instantiation and `messages.create(...)` call with `callLLM({ purpose: 'intake-parsing', ... })` from `studio/src/llm/`. Keep the existing Zod validation and stub-mode branching as-is; only the real-call path changes.

### Detailed Steps
1. Confirm Task 1 is complete and `studio/src/llm/` exports what this needs.
2. Swap the Anthropic-specific call and error handling for the LLM layer's `callLLM(...)` and its normalized errors.
3. Run the existing stub-mode tests first to confirm no regression.
4. If a key exists, run `scripts/dry-run.ts` without the stub flag.
5. Update Week 1's `STATUS.md` and Task 4/5 reports only if step 4 actually succeeded — don't mark anything closed on the basis of the refactor alone; the refactor and the verification are two different acceptance criteria.

### Integration Points
- Depends on Task 1's `studio/src/llm/index.ts` public surface. Does not depend on Task 2 (notification interface) — independent of it.

## Testing

### Test Commands
```bash
npm run build
npm run lint
npm run typecheck
INTAKE_STAGE_STUB=1 npx tsx scripts/dry-run.ts   # stub path, must still pass
npx tsx scripts/dry-run.ts                        # real path, only if a key is available
```

### Expected Results
- TypeScript compilation: No errors
- ESLint: No warnings
- Stub-mode dry run: passes exactly as it did in Week 1
- Real-mode dry run (if run): produces a sensible `{ topic, constraints }` from a real brief, and Task 4's resumability criterion (kill mid-stage, restart, confirm clean resume) can now optionally be re-verified against a real call too — not required for this task's completion, but worth doing while a key is available if time allows.

### How to Verify
1. Run all test commands above.
2. Check whether `.env.local` has a real `ANTHROPIC_API_KEY` before attempting the real-mode run — don't block this task's completion on getting one; report honestly either way per the Acceptance Criteria.

## Additional Notes

If a real key does become available and this task closes the loop, that's also the moment to reconsider whether `MODEL` in `registry.ts`'s `intake-parsing` entry should move to a cheaper tier (per `AGENT_FLEET_DESIGN.md` Section 8.1's tiering table — extraction is a "classification/extraction" task shape, cheap tier, not premium) — Week 1 used `claude-sonnet-5` for this by default; that was never a deliberate tiering decision, just what was on hand. Worth a one-line note in the report either way, not a scope change for this task.

## Links & References
- [LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md](../../decisions/LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md)
- [docs/execution/week1/BUSINESS_LOGIC.md](../week1/BUSINESS_LOGIC.md) — Section 2
- [docs/execution/week1/reports/week1-summary.md](../week1/reports/week1-summary.md) — Deviations, item 3
- [docs/execution/week1/STATUS.md](../week1/STATUS.md)
