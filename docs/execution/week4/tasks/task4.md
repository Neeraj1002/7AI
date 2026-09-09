# Week 4 Task 4: Wire End-to-End, First Full Internal Dry Run, and Close Out Week 4

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** It defines the Git Workflow (branch/commit/PR steps for this task), the `STATUS.md` update this task must make, and the section structure this file follows. This file states only this task's specifics — the template governs everything else, so don't skip it.

**Objective**: Run the actual first full internal dry run — brief in, published-private video out — per `MVP_ROADMAP_OCT15.md` Section 12's explicit Week 4 instruction, and close out Week 4.
**Duration**: 2–3 hours (plus however long the real dry run itself takes, dominated by video render/upload time, not engineering)
**Depends On**: Tasks 1–3, all complete, ideally against real credentials rather than stubs (see Additional Notes if not).
**Owning Component**: Orchestrator (integration).
**Success Criteria**: One full brief-to-`completed` run happens for real, unattended past the two approval gates, and the loop the roadmap describes in Section 13 is proven end-to-end for the first time — with real stock footage and a real voiceover, not placeholders.

## Task Requirement

This is the task the whole roadmap has been building toward — Section 13's "What the First End-to-End Test Looks Like" is now fully reachable for the first time (Weeks 2–3 could only prove it up to Gate 2). Treat this as a real milestone, not routine integration — the report for this task doubles as the answer to "does the system actually work."

**This run is the first genuinely real one**, not just the first complete one: Task 1 means the video isn't a solid-color background with a placeholder tone anymore (assuming its keys landed), and Task 2 means it's actually uploaded, not simulated. If either Task 1 or Task 2 is still running on stubs when this task starts, say so plainly rather than letting "end-to-end" imply more realism than actually happened.

### Context
`MVP_ROADMAP_OCT15.md` Section 12 (Week 4's explicit instruction: "First full internal dry runs — publish as unlisted/private first, not public"), Section 13 (the full 9-step test, now entirely reachable).

### Acceptance Criteria
- [ ] A single real brief flows through all nine stages — `intake → script_generation → script_review → gate1 → video_generation → video_review → gate2 → publishing → analytics` — to `completed`, with both gates answered by the founder for real (not simulated, unlike Weeks 2–3's constraint when the founder was unavailable).
- [ ] The published video is confirmed `private` on YouTube, not public — verify this directly, don't assume the code did the right thing.
- [ ] The video actually has real audio (not a placeholder tone) and real stock footage (not a solid color) — confirm by watching it, per Task 1's fix, assuming its keys are in place by now.
- [ ] Resumability re-verified once more across the full chain — kill mid-`publishing` specifically (the one new failure point this week), confirm clean resume with no duplicate upload.
- [ ] `docs/execution/week4/STATUS.md` created, same format as prior weeks.
- [ ] `docs/execution/week4/SCHEMA.md`/`BUSINESS_LOGIC.md` reconciled against actual implementation.
- [ ] If Task 2 ran against stubs pending Week 1 Task 7's OAuth, and real credentials have since landed, this task is where that gets closed out for real — don't let the stub stay silently in place once the real thing is possible. Same for Task 1's `OPENAI_API_KEY`/`PEXELS_API_KEY`.

## Schema Impact

None new. Verification and reconciliation only.

## Business Logic / State Transition

Verifies the full Week 1–4 transition table end-to-end for the first time — no new logic, but the first time every piece is exercised together in one real run.

### Reference
`docs/execution/week4/BUSINESS_LOGIC.md` (all sections) and every prior week's, transitively.

## Implementation

### Detailed Steps
1. Confirm Tasks 1–3 are complete and, ideally, real credentials (Anthropic, OpenAI, Pexels, Telegram, YouTube) are all in place — this is the first task where every credential from the earlier purchase-plan discussion actually matters simultaneously.
2. Submit one real brief for the actual first test.
3. Respond to Gate 1 and Gate 2 for real, as the founder.
4. Confirm the video publishes as `private` — check YouTube Studio directly, and actually watch/listen to it.
5. Kill the process mid-`publishing` on a second test run, confirm clean resume.
6. Write `docs/execution/week4/STATUS.md`.
7. Reconcile `SCHEMA.md`/`BUSINESS_LOGIC.md`.

## Testing

### Test Commands
```bash
npm run build
npm run lint
npm run typecheck
npx tsx scripts/dry-run.ts   # full sequence, live, real gates
```

### Expected Results
- A full run reaches `completed` with a real, verifiably-private YouTube upload, real voiceover, and real stock footage.
- A forced kill-and-restart mid-`publishing` resumes cleanly, no duplicate video uploaded.

### How to Verify
1. Run all test commands above.
2. Manually check YouTube Studio for the uploaded video's actual privacy status and metadata quality (title/description/tags) — this is worth a human look, not just a database check.
3. Watch the actual video — confirm real audio and real stock footage, not placeholders.
4. Read `docs/execution/week4/STATUS.md` back and confirm every task 1–4 has an accurate row.

## Additional Notes

If OAuth (Week 1 Task 7) is still not done by this point, this task cannot reach a genuinely real `completed` run — report that plainly rather than declaring victory on a stubbed publish. Same logic applies if Task 1's `OPENAI_API_KEY`/`PEXELS_API_KEY` are still missing — the video would still be placeholder audio/footage even if publishing itself is real. In either case, do everything else this task calls for against whichever stub path is still active, and flag the real end-to-end proof as the one thing still blocking Week 4's actual close-out, distinct from the code being ready.

## Links & References
- [MVP_ROADMAP_OCT15.md](../../roadmap/MVP_ROADMAP_OCT15.md) — Sections 12, 13
- [docs/execution/week4/SCHEMA.md](../SCHEMA.md), [BUSINESS_LOGIC.md](../BUSINESS_LOGIC.md)
- [docs/execution/week4/tasks/task1.md](task1.md), [task2.md](task2.md), [task3.md](task3.md)
- [docs/execution/week1/STATUS.md](../../week1/STATUS.md) — Task 7's status, the one external dependency this task can't route around
