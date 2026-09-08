# Week 2 Task 4: Script Generation Agent

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** It defines the Git Workflow (branch/commit/PR steps for this task), the `STATUS.md` update this task must make, and the section structure this file follows. This file states only this task's specifics — the template governs everything else, so don't skip it.

**Objective**: Build the Script Generation agent — the first real agent in the critical path — plus the `AgentQuota`/`UsageEvent` metering it triggers into existence.
**Duration**: 3–4 hours
**Depends On**: Task 1 (LLM layer) — cannot start before it. Independent of Task 2 and Task 3.
**Owning Component**: Script Generation agent, per `AGENT_FLEET_DESIGN.md` 4.4.
**Success Criteria**: Given a parsed brief, produces a script/captions/hashtags via `studio/src/llm/`; every call (success or failure) writes a `UsageEvent` row; a soft budget check refuses the call if `AgentQuota.budgetCeilingUsd` would be exceeded.

## Task Requirement

This is the first agent to actually spend money, which is why it also carries the metering/budget work — per `docs/execution/week1/BUSINESS_LOGIC.md` Section 6, `AgentQuota`/`UsageEvent` "start once an agent actually runs" (Week 2, this task), and `MVP_ROADMAP_OCT15.md` Section 5.6 says cost checks become relevant at the same point. Don't build this agent without the metering — they land together on purpose.

### Context
`AGENT_FLEET_DESIGN.md` Section 4.4 (mission, inputs/outputs, MVP status), Section 8.1 (premium model tier for this call — "the one place quality directly drives views, don't cost-optimize this step"), Section 6.2 (`AgentQuota`/`UsageEvent`, pooling). `docs/execution/week2/SCHEMA.md` Sections 1–2 (proposed field-level shape for both new tables — read this before migrating). `docs/execution/week2/BUSINESS_LOGIC.md` Section 2 (the exact transition and cost-gate logic to implement).

### Acceptance Criteria
- [ ] `agent_quotas` and `usage_events` tables migrated per `docs/execution/week2/SCHEMA.md`.
- [ ] One `AgentQuota` row seeded for the founder's tenant + `youtube` platform — the `budgetCeilingUsd` value used is stated plainly in this task's report, not picked silently (flag it for confirmation the same way Week 1 flagged `Tenant`/`PipelineRun` shapes).
- [ ] Script Generation calls `studio/src/llm/` with `purpose: 'script-generation'` — never a provider SDK directly.
- [ ] Before that call, the Orchestrator sums `UsageEvent.costUsd` for `(tenantId, platform)` and compares to `AgentQuota.budgetCeilingUsd`; if it would be exceeded, the stage does not run and the `PipelineRun` moves to `needs_attention` (not a hard crash, not a silent skip).
- [ ] Every Script Generation call — success or failure — writes a `UsageEvent` row with resolved `agent`, `provider`, `model`, `inputTokens`, `outputTokens`, `costUsd`.
- [ ] Output (`scriptText`, `captions`, `hashtags`) is written to a `pipeline_stages` row (`stageName = 'script_generation'`) as plain, human-readable text/JSON — no opaque binary, per `MVP_ROADMAP_OCT15.md` Section 6 (a human reads this directly at Gate 1, built in Task 6).
- [ ] `PipelineRun.currentStage` advances from `intake` to `script_generation` to (on success) `script_review`, matching `docs/execution/week2/BUSINESS_LOGIC.md` Section 1's transition table.

## Schema Impact

New tables `agent_quotas`, `usage_events` — see `docs/execution/week2/SCHEMA.md` Sections 1–2 for full field lists and DDL. One seed row in `agent_quotas`.

## Business Logic / State Transition

New transitions: `intake → script_generation`, the budget-check branch to `needs_attention`, and `script_generation → script_review` on success. See `docs/execution/week2/BUSINESS_LOGIC.md` Sections 1–2 for the exact table and per-field logic.

### Reference
`docs/execution/week2/BUSINESS_LOGIC.md` Sections 1–2.

## Implementation

### Files to Create
- `studio/src/agents/script-generation/index.ts` (or equivalent — exact module layout is this task's call, follow whatever convention Task 3 established for Intake).
- Migration for `agent_quotas` + `usage_events`.
- Seed script/step for the initial `AgentQuota` row.

### Files to Modify
- Orchestrator's stage-runner (wherever Task 3/4's Intake→next-stage wiring lives) — add the budget-check branch and the call into Script Generation.

### Detailed Steps
1. Confirm Task 1 is complete and `studio/src/llm/` exports what this needs, including however cost-per-call gets computed (per `docs/execution/week2/SCHEMA.md`'s note on `costUsd`'s origin — confirm with Task 1's actual implementation, don't assume).
2. Migrate `agent_quotas` and `usage_events`.
3. Seed one `AgentQuota` row — pick a starting `budgetCeilingUsd` conservative enough to be a real backstop (the founder's Anthropic workspace key itself is separately rate/spend-limited, per the 2026-09-07 console setup — this ceiling is a second, application-level check, not a duplicate of that one; state your chosen number and reasoning in the report).
4. Implement the budget check as a guard before the Script Generation call.
5. Implement Script Generation itself: build the prompt from `topic`/`constraints`/`styleGuide`, call `studio/src/llm/` with `purpose: 'script-generation'`, validate the response shape (Zod, matching the `parse-brief.ts` convention from Week 1/Task 3).
6. Write the `UsageEvent` row after the call, success or failure.
7. Write the stage output and advance `currentStage`.

### Integration Points
- Depends on Task 1's `studio/src/llm/index.ts` public surface.
- Feeds Task 5 (Script Review) — its output is Script Review's input.
- Independent of Task 2 (notification interface).

## Testing

### Test Commands
```bash
npm run build
npm run lint
npm run typecheck
npx tsx scripts/dry-run.ts   # extend or add a fixture that carries a run through intake -> script_generation
```

### Expected Results
- TypeScript compilation: No errors
- ESLint: No warnings
- A dry run with a fresh `AgentQuota` (ceiling not yet spent) produces a script and a `UsageEvent` row.
- A dry run with `AgentQuota.budgetCeilingUsd` set to `0` (or already exhausted by prior test runs) routes the run to `needs_attention` instead of calling the LLM — verify this path explicitly, it's the one most likely to be under-tested.

### How to Verify
1. Run all test commands above.
2. Query `usage_events` after a successful run and confirm a row exists with sensible token counts and a non-zero `costUsd`.
3. Deliberately exhaust or zero out the seeded `AgentQuota` row and re-run to confirm the budget-gate path actually triggers, not just the happy path.

## Additional Notes

This is real money — the account holds a small balance and a workspace-scoped key with its own console-level rate limits (set 2026-09-07). Prefer a small number of real test calls over looping `dry-run.ts` repeatedly while iterating; use the existing stub path where one still applies (e.g. iterating on the budget-gate logic itself doesn't need a real LLM call at all — stub the LLM response and only go real once the gate logic is correct).

## Links & References
- [AGENT_FLEET_DESIGN.md](../../design_doc/agents/all_agents/AGENT_FLEET_DESIGN.md) — Sections 4.4, 6.2, 8.1
- [docs/execution/week2/SCHEMA.md](../SCHEMA.md) — Sections 1–2
- [docs/execution/week2/BUSINESS_LOGIC.md](../BUSINESS_LOGIC.md) — Sections 1–2
- [docs/execution/week1/BUSINESS_LOGIC.md](../../week1/BUSINESS_LOGIC.md) — Section 6
