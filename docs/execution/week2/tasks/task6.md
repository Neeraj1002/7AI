# Week 2 Task 6: Approval Gate 1 (Chat-Bot)

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** It defines the Git Workflow (branch/commit/PR steps for this task), the `STATUS.md` update this task must make, and the section structure this file follows. This file states only this task's specifics — the template governs everything else, so don't skip it.

**Objective**: Build Gate 1 — the founder-facing Telegram approval flow between Script Review and Video Generation — per `MVP_ROADMAP_OCT15.md` Section 17's first-pass design.
**Duration**: 3–4 hours (the most involved Week 2 task — real state, real reply parsing, a real external dependency on the founder's Telegram).
**Depends On**: Task 2 (notification interface) and Task 5 (Script Review — needs a real score/notes to display).
**Owning Component**: Orchestrator (approval gates are an Orchestrator responsibility, `AGENT_FLEET_DESIGN.md` 4.10), via `studio/src/notify-founder/`'s interface.
**Success Criteria**: A `paused_gate1` run sends a correctly formatted Telegram message and resumes correctly on `approve`, an edited-script reply, or `reject [reason]` — matching `docs/execution/week2/BUSINESS_LOGIC.md` Section 4.

## Task Requirement

Build exactly the reply grammar `MVP_ROADMAP_OCT15.md` Section 17 already sketched — this was flagged as a low-risk deferral in `docs/decisions/LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md` precisely because the shape was already decided, not because it's simple to implement. Don't invent a different grammar; implement the one already designed.

### Context
`MVP_ROADMAP_OCT15.md` Section 6 (how a human controls the input to the next agent: approve/edit/reject), Section 17 (message format, reply grammar, one-thread-per-run). `docs/decisions/LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md` (the interface this calls into — `requestApproval(...)`, never `grammy` directly). `docs/execution/week2/BUSINESS_LOGIC.md` Section 4.

### Acceptance Criteria
- [ ] Calls only `studio/src/notify-founder/`'s interface (`requestApproval(...)`), never `grammy` directly — Task 2's import-boundary rule holds here too; grep-verify.
- [ ] One Telegram thread per `PipelineRun`, not a shared flat channel (Week 1's transport was deliberately flat; this task is what makes threading real, per `docs/execution/week1/BUSINESS_LOGIC.md` Section 5).
- [ ] Gate message includes: channel name, the original brief text, the full script text, and Script Review's score/notes inline — no context-switching required to see why it passed/what was flagged, per Section 17.
- [ ] Reply parsing implements exactly three outcomes: `approve` (case-insensitive, exact match preferred over fuzzy matching — state whatever tolerance you chose in the report), `reject [reason]` (reason is everything after the command word), and anything else treated as an edited script.
- [ ] `PipelineRun.status` moves to `paused_gate1` when the gate opens and out of it (`running`/`failed`) on each of the three reply types, per `docs/execution/week2/BUSINESS_LOGIC.md` Section 1's transition table.
- [ ] Every gate decision writes a `ReviewLog` row: `agent = 'human'`, `verdict` = `approve`/`edit`/`reject`, `editedOutput` populated only on edit, `rationale` = the reject reason where given.
- [ ] On edit, the edited text — not the original AI output — becomes the sanctioned input to the next stage; the original stays in `pipeline_stages.output` history, not overwritten.
- [ ] Task 2's Testing step 2 (live bot-token verification, deferred pending a live token) is now unblocked — the founder added a Telegram bot token to `.env.local` on 2026-09-07. This task should actually send a real gate message and confirm a real reply resumes the run, closing out that deferred verification (see Additional Notes).

## Schema Impact

No new tables. Uses `pipeline_runs.status`, `review_logs` (Week 1 schema).

## Business Logic / State Transition

`script_review → paused_gate1` (already true after Task 5) → one of `running` (`video_generation`, unreachable this week), `failed`, on the three reply types. Full table: `docs/execution/week2/BUSINESS_LOGIC.md` Section 1.

### Reference
`docs/execution/week2/BUSINESS_LOGIC.md` Sections 1, 4. `MVP_ROADMAP_OCT15.md` Section 17.

## Implementation

### Files to Create
- `studio/src/agents/gate1/index.ts` (or equivalent) — the gate-specific logic: message formatting, reply parsing, resume dispatch.

### Files to Modify
- `studio/src/notify-founder/channel.ts`/`telegram-channel.ts` (Task 2) if `requestApproval(...)`'s signature needs a small extension to support per-run threading (e.g. returning/accepting a thread or message reference) — keep the change minimal, consistent with Task 2's "revise once Gate 1's real requirements are known" note.
- Orchestrator's stage-runner — wire `script_review → paused_gate1` (blocking) and the resume path.

### Detailed Steps
1. Confirm Task 2 and Task 5 are both complete.
2. If `requestApproval(...)`'s current signature can't carry per-run thread context, extend it minimally — this is the moment Task 2 flagged as "revise once Gate 1's real requirements are known," not a reason to redesign the whole interface.
3. Build the gate message (channel name, brief, script, review score/notes).
4. Implement reply parsing for the three outcomes.
5. Implement the resume dispatch for each outcome (advance / stop / advance-with-edit).
6. Write the `ReviewLog` row for whichever outcome occurred.
7. With a real bot token now in `.env.local`, run a real end-to-end gate: trigger a run through Tasks 4–5, confirm the real Telegram message arrives, reply with each of the three outcomes across a few test runs, confirm each resumes correctly.

### Integration Points
- Depends on Task 2's `notify-founder/` interface and Task 5's `ReviewLog`/stage output.
- Nothing downstream consumes this yet within Week 2 — `video_generation` is Week 3, so an `approve` this week advances `currentStage` but the run legitimately stops there (same "advances to a stage that doesn't exist yet" pattern as Week 1's Intake).

## Testing

### Test Commands
```bash
npm run build
npm run lint
npm run typecheck
grep -rn "grammy" studio/src/agents/gate1/   # must return nothing
npx tsx scripts/dry-run.ts   # extend the fixture through gate1, all three reply outcomes
```

### Expected Results
- TypeScript compilation: No errors
- ESLint: No warnings
- Import-boundary grep: no `grammy` references outside `notify-founder/`'s adapter file
- A real Telegram message arrives, formatted per Section 17, for a `paused_gate1` run
- Each of `approve`, `reject test-reason`, and a raw edited-script reply resumes the run correctly and produces the expected `ReviewLog` row

### How to Verify
1. Run all test commands above.
2. Send all three reply types against real (or realistic test) runs and confirm each `ReviewLog` row and each `PipelineRun.status` transition independently — don't just check the happy path (`approve`).
3. Confirm the edited-script path actually carries the edited text forward as `pipeline_stages.input` for the next stage, not the original AI draft.

## Additional Notes

This task is also where Week 1 Task 6's deferred live-verification and Task 2's deferred live-verification both actually close out — the founder's Telegram bot token landed in `.env.local` on 2026-09-07, specifically so this task could run against a real bot instead of stubbing it. Update `docs/execution/week1/STATUS.md` (Task 6 row, already marked `Done`) and Task 2's own report with a short addendum once this task confirms real send/receive works end-to-end.

## Links & References
- [MVP_ROADMAP_OCT15.md](../../roadmap/MVP_ROADMAP_OCT15.md) — Section 17 (design), Section 6 (approve/edit/reject mechanics)
- [LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md](../../decisions/LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md)
- [docs/execution/week2/BUSINESS_LOGIC.md](../BUSINESS_LOGIC.md) — Sections 1, 4
- [docs/execution/week2/tasks/task2.md](task2.md), [task5.md](task5.md)
- [docs/execution/week1/BUSINESS_LOGIC.md](../../week1/BUSINESS_LOGIC.md) — Section 5
