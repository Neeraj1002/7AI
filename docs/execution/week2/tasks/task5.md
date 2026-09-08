# Week 2 Task 5: Script Review Agent

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** It defines the Git Workflow (branch/commit/PR steps for this task), the `STATUS.md` update this task must make, and the section structure this file follows. This file states only this task's specifics — the template governs everything else, so don't skip it.

**Objective**: Build the Script Review agent — a lightweight rubric score + notes over Script Generation's output, including the video-generation-fit check, gating Gate 1.
**Duration**: 1–2 hours
**Depends On**: Task 1 (LLM layer) and Task 4 (Script Generation — needs real output to review). Independent of Task 2.
**Owning Component**: Script Review agent, per `AGENT_FLEET_DESIGN.md` 4.5.
**Success Criteria**: Given Script Generation's output, produces a score + notes (including video-gen-fit) via `studio/src/llm/`; writes a `ReviewLog` row; writes its own `UsageEvent` row; no auto-revision loop.

## Task Requirement

Keep this genuinely lightweight — a rubric score and notes, not an auto-revision loop. `AGENT_FLEET_DESIGN.md` 4.5 is explicit that auto-revision is a later addition once the basic gate is proven; building it now would be scope creep ahead of Gate 1 (Task 6) even existing to consume the output.

### Context
`AGENT_FLEET_DESIGN.md` Section 4.5 (mission, updated responsibilities including the video-gen-fit check, MVP status), Section 8.1 (cheap/fast tier — "Script Review rubric scoring" is explicitly named in the classification/scoring row). `docs/execution/week2/BUSINESS_LOGIC.md` Section 3.

### Acceptance Criteria
- [ ] Script Review calls `studio/src/llm/` with `purpose: 'script-review'` — cheap/fast tier per Section 8.1, never a provider SDK directly.
- [ ] Scores against the quality/engagement/clarity/brand rubric **and** checks video-generation fit (runtime vs. platform length limit, pacing/beat realism for a Short, described visuals are things the Week 1 Task 8 toolchain — TTS + captions + template/stock visuals — can actually produce) per 4.5's updated responsibilities.
- [ ] Writes a `ReviewLog` row: `agent = 'script-review'`, `verdict` = numeric score as text, `rationale` = notes (including any video-gen-fit flags).
- [ ] Mirrors the same score/notes into `pipeline_stages.output` (`stageName = 'script_review'`) so Gate 1 (Task 6) can display them without a join.
- [ ] Writes a `UsageEvent` row for its own call, same shape as Task 4's.
- [ ] No auto-revision loop — a low score still reaches Gate 1 for the human to judge; the stage always "completes," a low score is a review outcome, not a stage failure.
- [ ] `PipelineRun.status` moves to `paused_gate1` on completion, per `docs/execution/week2/BUSINESS_LOGIC.md` Section 1's transition table.

## Schema Impact

No new tables. Writes rows to `review_logs` (Week 1) and `usage_events` (Task 4, this week).

## Business Logic / State Transition

`script_review` stage completes → `PipelineRun.status = 'paused_gate1'`. See `docs/execution/week2/BUSINESS_LOGIC.md` Sections 1 and 3.

### Reference
`docs/execution/week2/BUSINESS_LOGIC.md` Sections 1, 3.

## Implementation

### Files to Create
- `studio/src/agents/script-review/index.ts` (or equivalent, matching Task 4's module convention).

### Files to Modify
- Orchestrator's stage-runner — wire `script_generation → script_review` and `script_review → paused_gate1`.

### Detailed Steps
1. Confirm Task 4 is complete and produces real `scriptText`/`captions` to review.
2. Build the rubric prompt (quality/engagement/clarity/brand + video-gen-fit) and call `studio/src/llm/` with `purpose: 'script-review'`.
3. Validate the response shape (Zod) — score + notes + any video-gen-fit flags.
4. Write the `ReviewLog` row and mirror into `pipeline_stages.output`.
5. Write the `UsageEvent` row.
6. Advance `PipelineRun.status` to `paused_gate1`.

### Integration Points
- Depends on Task 4's output shape directly.
- Feeds Task 6 (Gate 1) — its `ReviewLog` row and stage output are what the gate message displays.

## Testing

### Test Commands
```bash
npm run build
npm run lint
npm run typecheck
npx tsx scripts/dry-run.ts   # extend the Task 4 fixture through script_review
```

### Expected Results
- TypeScript compilation: No errors
- ESLint: No warnings
- A dry run produces a `ReviewLog` row and leaves `PipelineRun.status = 'paused_gate1'`.
- A deliberately weak/short test script still completes the stage (low score, not a stage failure) — verify this explicitly, since "always completes" is easy to accidentally regress into "fails below some threshold."

### How to Verify
1. Run all test commands above.
2. Query `review_logs` after a run and confirm the row's `rationale` includes video-gen-fit commentary, not just the quality/engagement/clarity/brand score.
3. Confirm `PipelineRun.status` is `paused_gate1` after the stage, ready for Task 6.

## Additional Notes

Cheap/fast tier per Section 8.1 — this should resolve to a materially cheaper model+purpose entry in the registry than Script Generation's `purpose: 'script-generation'`. Worth a one-line confirmation in the report that the registry entry for `script-review` was actually set to a cheap tier and not left defaulting to whatever Task 1 used as a placeholder.

## Links & References
- [AGENT_FLEET_DESIGN.md](../../design_doc/agents/all_agents/AGENT_FLEET_DESIGN.md) — Sections 4.5, 8.1
- [docs/execution/week2/BUSINESS_LOGIC.md](../BUSINESS_LOGIC.md) — Sections 1, 3
- [docs/execution/week2/tasks/task4.md](task4.md)
