# Week 5 Task 6: Reconcile & Close — Verify Task 4/5 Against Reality Before Calling Sprint 1 Done

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.**

**Objective**: Resolve a real, evidence-based contradiction between what Task 4/Task 5 claim is done
and what the actual code shows, then finish whatever turns out genuinely unfinished — so Sprint 1
closes for real, not just on paper.
**Duration**: 1-2 hours if the audit confirms everything really is applied on the real branch (the
less likely outcome, given the evidence below); 4-6 hours if C1/C3/D1/D2 need real implementation,
matching Task 4/Task 5's own original estimates for those specific items.
**Depends On**: Week 5 Task 4, Task 5 (both claim "done" — this task verifies that claim before
anything downstream, including Sprint 2, treats Sprint 1 as closed).
**Owning Component**: LLM registry (`llm/registry.ts`), Script Review (`agents/script-review/index.ts`),
Publishing (`agents/publishing/types.ts`, `youtube-client.ts`, `index.ts`), Gate 2
(`agents/gate2/index.ts`), Orchestrator (`run-pipeline/state-machine.ts`).
**Success Criteria**: Every item in Task 4 (C1-C4) and Task 5 (D1-D2) has a real, current, verified
status — implemented-and-confirmed, or genuinely still open with an honest reason — and
`KNOWN_ISSUES_AND_BLOCKERS.md`/`week5/STATUS.md` say exactly that, with no gap between what the docs
claim and what a fresh `git diff` against the real branch shows.

## Task Requirement

### Why this task exists
A review of `week5/tasks/task5.md`'s own text (its "Depends On" line asserts "Week 5 Task 4 ... —
done") against three files read directly this session found real contradictions:

- C1 (Task 4 — Intake-parsing moved to the cheap model tier): `llm/registry.ts` still resolves
  `'intake-parsing'` to `claude-sonnet-5`, not `claude-haiku-4-5`.
- C3 (Task 4 — a `factualConcerns` field added to Script Review's existing rubric call):
  `agents/script-review/index.ts`'s `ScriptReviewOutputSchema` has no such field — matching
  `KNOWN_ISSUES_AND_BLOCKERS.md` §4's own text, which (as of its last-updated timestamp, after Task
  3 and therefore before Task 4 could have closed it) still lists this as an open, undecided
  question.
- D2 (Task 5 itself — privacy status becomes a real per-run Gate 2 choice):
  `agents/publishing/types.ts` still exports a hardcoded `PRIVACY_STATUS = 'private'` constant with
  its own comment anticipating a manual one-line flip — exactly what D2 was supposed to replace —
  and `youtube-client.ts`/`gate2/index.ts` both still import/use that constant rather than a
  threaded `UploadParams.privacyStatus`.

One honest caveat, state this up front in the report too: this session's own file reads were against
a local snapshot, not a live clone of whatever branch Task 4/5's work actually landed on
(`SPRINT1_BE`/`WEEK5_BE` or similar, per `TASK_TEMPLATE.md`'s Git Workflow). It's possible the real
branch already has these fixes and the snapshot read from is simply stale. The first real step of
this task is settling that — pull the actual current branch and check, don't assume either
direction.

### K1 — Audit every Task 4 item (C1-C4) against the real branch
For each of C1 (model tier), C2 (per-channel budget fair-access + `Channel.budgetOverrideUsd`), C3
(`factualConcerns`), and C4 (vitest + the four named unit tests): check the real file, not memory of
the task spec. Record, per item: applied-and-verified / applied-but-unverified / not applied. For
anything not applied, implement it now following Task 4's own Fix section for that item verbatim —
don't re-derive the approach, Task 4 already made the real decisions (e.g. C2's founder-directed
equal-split-with-override policy).

### K2 — Audit every Task 5 item (D1, D2) against the real branch
D1 (`insertUsageEvent` added to `runIntakeStage`) and D2 (real per-run `privacyStatus` threaded from
Gate 2 through to `uploadVideo`) — same treatment: check the real file, implement per Task 5's own
Fix section if genuinely missing.

D2 specifically, since it's the item with direct real-world consequences: if it turns out
unimplemented, do not proceed to Task 5's own "real test — a Short about GPT-6 Astra... reply
`approve public`" step as part of this task. That step is a deliberate, real, publicly-visible
publish — it stays exactly where Task 5 put it, run only once D2 is genuinely built and the founder
is ready to do it live. This task's job is making D2 real; running the real public test is Task 5's
job to finish, not this task's to absorb.

### K3 — Reconcile the docs to match whatever K1/K2 actually find
`KNOWN_ISSUES_AND_BLOCKERS.md` and `week5/STATUS.md` currently read as if Task 4 is fully closed
(it's not referenced as still-open anywhere in `STATUS.md`'s own task rows, which only go up to Task
3) and Task 5 is in progress. After K1/K2: update `STATUS.md` with real rows for Task 4 and Task 5
reflecting their actual, just-verified state — not "Done" unless every item under them is confirmed,
not "Done — action needed" unless the remaining piece is genuinely external (like D2's live
public-approval step).

## Schema Impact
Whatever C2/D1/D2 (if actually unimplemented) require, per Task 4/Task 5's own Schema Impact
sections — this task doesn't introduce new schema decisions of its own, it completes existing ones.

## Business Logic / State Transition

### What this task implements
No new business logic of its own — this task's entire job is confirming (or completing) logic Task
4/Task 5 already specified. Treat any gap found as "finish the spec," not "redesign the spec."

### Failure Modes & Handling
If K1/K2 finds an item was implemented differently than its task spec describes (not missing, just
divergent), don't silently force it back to the original spec — note the divergence in the report,
same as any other task's "Deviations from Spec," and update `SCHEMA.md`/`BUSINESS_LOGIC.md` to match
what's actually there if the divergence is itself reasonable.

## Testing
```bash
npm run build && npm run lint && npm run typecheck && npm test
```
Plus, per item actually touched: the same verification steps Task 4/Task 5's own specs already
define (e.g. C1's real Intake call confirming `model = 'claude-haiku-4-5'` in the resulting
`UsageEvent`; D2's `parseGate2Reply` unit tests for `"approve"`/`"approve public"`/`"approve
unlisted"`) — reuse them rather than inventing new verification criteria.

### Documentation reconciliation
- `docs/execution/KNOWN_ISSUES_AND_BLOCKERS.md`: correct §2-4 to reflect verified-real status for
  every C1-C4/D1-D2 item — move genuinely-closed items out, keep genuinely-open ones with an
  accurate reason (not "should be done by now").
- `docs/execution/week5/SCHEMA.md`/`BUSINESS_LOGIC.md`: fill in anything C2/D1/D2 actually changed
  that isn't documented yet.
- `docs/execution/week5/STATUS.md`: real, accurate rows for Tasks 4 and 5 — this is the row a
  founder or a future task should be able to trust without re-auditing the code themselves, which is
  exactly what didn't hold going into this task.

## Report Template
`execution/week5/reports/task6.md`, standard shape. Lead with a short table: item (C1-C4, D1-D2) →
found status (applied-and-verified / not applied / divergent) → action taken. This is the artifact
that actually closes the claimed-vs-actual gap — make it easy to trust at a glance.
