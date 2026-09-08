# Week 3 Task 4: Approval Gate 2

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** It defines the Git Workflow (branch/commit/PR steps for this task), the `STATUS.md` update this task must make, and the section structure this file follows. This file states only this task's specifics — the template governs everything else, so don't skip it.

**Objective**: Build Gate 2 — the founder-facing video approval flow between Video Review and Publishing — reusing Gate 1's notification interface, not building new transport code.
**Duration**: 2–3 hours (smaller than Gate 1 — the interface and threading pattern already exist; this is a second call site, not new plumbing).
**Depends On**: Task 3 (Video Intelligence — needs a real verdict to display). Reuses Week 2 Task 2/Task 6's `studio/src/notify-founder/` interface directly.
**Owning Component**: Orchestrator, via `studio/src/notify-founder/`'s interface, per `AGENT_FLEET_DESIGN.md` 4.10.
**Success Criteria**: A `paused_gate2` run sends a correctly formatted Telegram message (video + verdict) and resumes correctly on `approve`, `reject [reason]`, or revision notes.

## Task Requirement

This is explicitly the gate that "stays manual longest even after Gate 1 is relaxed" (`MVP_ROADMAP_OCT15.md` Section 6) — the last human check before anything would go live and public. Build it with that in mind: no shortcuts on the reject/notes paths just because Gate 1 already proved the transport works.

### Context
`MVP_ROADMAP_OCT15.md` Section 6 (why Gate 2 is the highest-stakes gate), Section 17 (message format, reply grammar — Gate 2's is slightly different from Gate 1's, see below). `docs/execution/week3/BUSINESS_LOGIC.md` Section 4.

### Acceptance Criteria
- [ ] Calls only `studio/src/notify-founder/`'s interface — same import-boundary rule as Gate 1, grep-verify.
- [ ] One Telegram thread per `PipelineRun`, same as Gate 1 (already-threaded from Gate 1's message in the same run, if Task 6/Week 2 built genuine per-run threading — confirm and reuse, don't create a second thread per run).
- [ ] Gate message includes: channel name, the video file (or a link — see below), and Video Intelligence's verdict + fix notes inline.
- [ ] **File-size check**: confirm actual rendered file sizes from Task 2/3's test runs against Telegram's bot-upload limit (~50MB). If renders exceed it, send a link (e.g. to wherever `videoPath` is servable, or a temporary upload) instead of the raw file — state which approach was used and why in the report.
- [ ] Reply parsing implements exactly three outcomes: `approve`, `reject [reason]`, and anything else treated as revision notes feeding a regen loop (**not** a raw edit — a video can't be edited as text, unlike Gate 1's script edit).
- [ ] `PipelineRun.status` moves to `paused_gate2` when the gate opens, and to the correct next state per `docs/execution/week3/BUSINESS_LOGIC.md` Section 1's transition table on each reply type.
- [ ] Every gate decision writes a `ReviewLog` row (`agent = 'human'`, `verdict` = `approve`/`revise`/`reject`, `rationale` = notes/reason).
- [ ] Revision notes on approve/regen path respect the same `MAX_VIDEO_REGEN_ATTEMPTS` circuit breaker as Task 3's automatic loop — a founder-requested revision doesn't bypass the cap.

## Schema Impact

None new. Uses `pipeline_runs.status`, `review_logs`.

## Business Logic / State Transition

`video_review → paused_gate2` (already true after Task 3 on pass) → `running` (`publishing`, unreachable)/`failed`/`running` (`video_generation`, regen) on the three reply types, respecting the shared attempt cap. Full table: `docs/execution/week3/BUSINESS_LOGIC.md` Section 1.

### Reference
`docs/execution/week3/BUSINESS_LOGIC.md` Sections 1, 4.

## Implementation

### Files to Create
- `studio/src/agents/gate2/index.ts` (or equivalent, matching Task 6/Week 2's Gate 1 module convention).

### Files to Modify
- Orchestrator's stage-runner — wire `video_review → paused_gate2` (blocking) and the three-outcome resume path.

### Detailed Steps
1. Confirm Task 3 is complete.
2. Confirm real render file sizes from prior testing; decide file-vs-link based on that, not assumption.
3. Build the gate message (channel, video/link, verdict, fix notes).
4. Implement reply parsing for the three outcomes.
5. Implement resume dispatch, checking the shared regen-attempt cap before honoring a revision-notes reply.
6. Write the `ReviewLog` row per outcome.

### Integration Points
Depends on Week 2's `notify-founder/` interface and Task 3's `ReviewLog`/stage output. Shares the regen-attempt-cap check with Task 3.

## Testing

### Test Commands
```bash
npm run build
npm run lint
npm run typecheck
grep -rn "grammy" studio/src/agents/gate2/   # must return nothing
npx tsx scripts/dry-run.ts   # extend the fixture through gate2, all three reply outcomes
```

### Expected Results
- TypeScript compilation: No errors
- ESLint: No warnings
- Import-boundary grep: no `grammy` references outside `notify-founder/`'s adapter file
- A real Telegram message arrives for a `paused_gate2` run, video attached or linked correctly based on size
- Each of `approve`, `reject test-reason`, and revision-notes text resumes the run correctly

### How to Verify
1. Run all test commands above.
2. If a live founder reply isn't available at test time (same constraint as Week 2 Task 6 may have hit), test reply parsing/resume against a simulated update and note live verification as still open in the report, rather than blocking the task on it.
3. Confirm a revision-notes reply that would exceed `MAX_VIDEO_REGEN_ATTEMPTS` correctly routes to `needs_attention` instead of a fourth regen.

## Additional Notes

If Week 2 Task 6 designed genuine per-run Telegram threading, this task should slot into that same thread for a given run rather than opening a new one — Gate 1 and Gate 2 messages for the same video belong in one conversation. Confirm this works as expected; if Task 6's threading turns out to be per-gate rather than per-run, that's worth flagging back to this task's report as a small gap, not silently working around.

## Links & References
- [MVP_ROADMAP_OCT15.md](../../roadmap/MVP_ROADMAP_OCT15.md) — Sections 6, 17
- [docs/execution/week3/BUSINESS_LOGIC.md](../BUSINESS_LOGIC.md) — Sections 1, 4
- [docs/execution/week2/tasks/task6.md](../../week2/tasks/task6.md) — the Gate 1 pattern this reuses
- [docs/execution/week3/tasks/task3.md](task3.md)
