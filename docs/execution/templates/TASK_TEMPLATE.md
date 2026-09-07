# 7AI Task Template

## Overview

This is the standard template for every 7AI execution task, Week 2 onward. It's adapted from the template `yt_shorts` used, with two additions that matter specifically because 7AI is a stateful, multi-agent system rather than a single CRUD service: a **Schema Impact** section and a **Business Logic / State Transition** section. Almost every 7AI task touches the shared Postgres schema, the Orchestrator's state machine, or an agent contract — none of which a simpler template forces you to think through explicitly, and all three are exactly where "it compiled but the pipeline still broke" bugs come from in a system like this.

**Week 1 is the one exception.** Because Week 1 is tightly-sequenced scaffolding (repo → DB → schema → orchestrator skeleton → bot → external setup), it ships as one consolidated document, `week1/WEEK1_INSTRUCTIONS.md`, instead of eight separate task files. Starting Week 2, each task gets its own file under `execution/week[N]/tasks/`, following this template exactly — mirroring how `yt_shorts` itself moved from a single `WEEK1_PLAN.md` to per-task files from Week 2 onward.

---

## Template Structure

### Header

```markdown
# Week [N] Task [ID]: [Task Name]

**Objective**: One-sentence description of what this task accomplishes
**Duration**: Estimated hours
**Depends On**: Previous tasks (if any)
**Owning Component**: Orchestrator | [Agent Name] | Shared Schema | Infra
**Success Criteria**: What makes this task complete
```

### Task Requirement

```markdown
## Task Requirement

[Detailed description of what needs to be built]
[Context on why this matters]
[Any constraints or notes]

### Context
[Background from MVP_ROADMAP_OCT15.md or AGENT_FLEET_DESIGN.md, if relevant]

### Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2
```

### Schema Impact *(new — not in the yt_shorts template)*

```markdown
## Schema Impact

### Tables Created
- `table_name` — purpose, key fields (full definition lives in `SCHEMA.md`, not repeated here)

### Tables Modified
- `table_name` — what changes, why, migration considerations (backfill needed? breaking for in-flight PipelineRuns?)

### Migration File
- `migrations/00XX_description.sql` (or the Prisma migration name, once ORM choice is locked)

### Reference
Full field-level definitions live in `execution/week[N]/SCHEMA.md`. This section states only the delta this task introduces — SCHEMA.md is the single source of truth, so a task file never repeats a full table definition.
```

Skip this section entirely (write "No schema changes") for tasks that don't touch the database — not every task does, and a forced-but-empty section is worse than an omitted one.

### Business Logic / State Transition *(new — not in the yt_shorts template)*

```markdown
## Business Logic / State Transition

### What this task implements
[e.g. "PipelineRun transitions pending → running on Intake completion; on Intake failure, transitions to needs_attention rather than failed, since a bad brief is a human-fixable input error, not a system fault."]

### Preconditions
- [State/data that must already exist before this logic runs]

### Postconditions
- [State/data guaranteed to exist afterward — including on partial failure. This is what makes a run resumable: a crash between postconditions of task N and the start of task N+1 must never leave the system in an ambiguous state.]

### Failure Modes & Handling
- [What can go wrong, and what happens: retry with backoff? circuit-break? escalate to the human queue as "needs attention"? Reference BUSINESS_LOGIC.md's general retry/circuit-breaker rules rather than re-deriving them per task.]

### Reference
Full state machine and control-flow rules live in `execution/week[N]/BUSINESS_LOGIC.md`.
```

Skip this section (write "No new control flow") for pure plumbing tasks — e.g., adding a lint config.

### Implementation

```markdown
## Implementation

### Files to Create
- `path/to/file1.ts` — Description

### Files to Modify
- `existing/file.ts` — What changes

### Key Code Patterns
[Code snippet or architecture pattern to follow]

### Detailed Steps
1. Step 1
2. Step 2

### Integration Points
- Module A connects to Module B via [interface/import]
- Which agent contract (if any) this task implements or calls, per `AGENT_FLEET_DESIGN.md` Section 4
```

### Testing

```markdown
## Testing

### Test Commands
\`\`\`bash
npm run build
npm run lint
# task-specific test commands
\`\`\`

### Expected Results
- TypeScript compilation: No errors
- ESLint: No warnings
- [Task-specific check]: Passes
- [Integration check]: Works with the task(s) it depends on

### How to Verify
1. Run `npm run build`
2. Run the specific check(s) above
3. For schema tasks: confirm the migration applies cleanly to a fresh DB *and* is a no-op on a DB that already has it (idempotent migrations)
```

### Reporting

```markdown
## Report Template

Generate at: `execution/week[N]/reports/task[ID].md`

# Week [N] Task [ID]: [Task Name]

**Date**: YYYY-MM-DD
**Status**: Complete
**Files Created**: N
**Files Modified**: N
**Tests**: All Passing

## What Was Done
[Summary]

## Files Created/Modified
- Created: [list]
- Modified: [list]

## Schema Changes Applied
[Actual migration(s) run, or "None"]

## Test Results
\`\`\`
[Test output]
\`\`\`

## Deviations from Spec
[Any changes made during implementation, and why]

## Sign-Off
- Task Objective: Met
- Schema Impact: Matches SCHEMA.md (or: SCHEMA.md updated to reflect the deviation)
- Business Logic: Matches BUSINESS_LOGIC.md (or: BUSINESS_LOGIC.md updated)
- Tests: Passing
- Ready for Integration: Yes
```

### Weekly Status Tracker *(new — not in the yt_shorts template)*

After writing the per-task report, upsert this task's row in `execution/week[N]/STATUS.md` — one row per task, one file per week, so the founder can see a week's status at a glance without opening every report. Create the file (with the header below) if this is the week's first task to complete.

```markdown
# Week [N] Status: [Week Theme]

**Week status**: [one line — e.g. "Core deliverables complete. 2 items pending founder action."]
**Last updated**: YYYY-MM-DD (after Task [ID])

| Task | Name | Status | Owner | Notes |
|---|---|---|---|---|
| 1 | [Task Name] | Done | Claude Code | |
| 2 | [Task Name] | Done — action needed | **Founder** | [what the founder needs to do, and where the steps live] |

## Full detail
Per-task reports: `reports/task[1-N].md`. Full narrative (once written): `reports/week[N]-summary.md`.
```

**Status** values: `Done`, `Done — action needed` (the code/task is finished but something can't close out without the founder — a credential, an external console step, a decision), `In Progress`, `Blocked`.
**Owner** values: `Claude Code` (nothing further needed from the founder) or `Founder` (the ball is in the founder's court — used whenever Status is `Done — action needed` or `Blocked` on something only the founder can do).

Update the row for *this* task only — never rewrite other tasks' rows, and never let this file's status contradict what the task's own report says. If a later task changes an earlier task's status (e.g. the founder's Telegram token finally gets added and Task 6 becomes fully `Done`), that's the task that's actually doing the work updating the row, not a retroactive edit from whichever task happens to run next.

### Git Workflow *(new — not in the yt_shorts template)*

**Branch per week, commit per task, PR per week — merging to `main` is always a founder decision, never automatic.**

**Starting a new week** (first task only):
1. `git checkout main && git pull` — start from a current `main`.
2. If no `origin` remote exists yet: `gh repo create 7AI --private --source=. --remote=origin` (ask the founder to run `gh auth login` first if `gh auth status` isn't authenticated — don't try to work around this).
3. `git checkout -b week-[N]`.
4. After this first task's commit is pushed (below), open the PR as a draft: `gh pr create --draft --title "Week [N]: [Week Theme]" --body "Tracking PR for Week [N]. Live status: docs/execution/week[N]/STATUS.md. Do not merge until marked ready for review."` — the body links to `STATUS.md` rather than duplicating it (same "documented once" principle as the rest of this template), so it never needs editing as the week progresses.

**After every task** (every task, every week), once its report and `STATUS.md` row are written:
1. `git add` the task's code changes together with its report and `STATUS.md` update — one atomic commit per task.
2. Commit message shape:
   ```
   Week[N] Task[ID]: [Task Name]

   [1-2 sentence summary of what changed]
   [One line per deviation from spec, if any]
   ```
3. `git push` (`-u origin week-[N]` on the week's first push, plain `git push` after) — every task's work reaches GitHub immediately, not just at week's end.

**Finishing a week** (last task only): after the final task's commit and push, `gh pr ready` to mark the PR ready for review. Do not merge, and do not treat merging as part of task completion — that's a deliberate founder action (via the GitHub PR review, or telling me to merge once reviewed). This is the one point where a founder actually looks at a diff before it becomes `main`, worth keeping even solo: the alternative is a week of autonomous output becoming trunk with nobody having looked at it.

A task's own founder-action items (e.g. Task 6/7 in Week 1) don't block any of the above — `STATUS.md` already tracks those separately from whether the branch merges.

### Additional Info

```markdown
## Additional Notes
[Design decisions, forward-looking notes]

## Known Issues / Future Improvements
[Known limitations, deferred to a later week]

## Links & References
- [MVP_ROADMAP_OCT15.md](../../roadmap/MVP_ROADMAP_OCT15.md) — relevant section
- [AGENT_FLEET_DESIGN.md](../../design_doc/agents/all_agents/AGENT_FLEET_DESIGN.md) — relevant section
- [SCHEMA.md](../SCHEMA.md)
- [BUSINESS_LOGIC.md](../BUSINESS_LOGIC.md)
```

---

## Task File Naming

```
7AI/docs/execution/
├── templates/
│   └── TASK_TEMPLATE.md
├── week1/
│   ├── WEEK1_INSTRUCTIONS.md      ← single consolidated doc, no per-task files this week
│   ├── SCHEMA.md
│   ├── BUSINESS_LOGIC.md
│   ├── STATUS.md                  ← one row per task, updated as each completes
│   └── reports/
│       └── week1-summary.md       ← written once Week 1 is done
├── week2/
│   ├── SCHEMA.md                  ← only if Week 2 changes the schema; omit otherwise
│   ├── BUSINESS_LOGIC.md          ← only if Week 2 adds new control flow; omit otherwise
│   ├── STATUS.md                  ← one row per task, updated as each completes
│   ├── tasks/
│   │   ├── task1.md
│   │   ├── task2.md
│   │   └── ...
│   └── reports/
│       ├── task1.md
│       └── ...
└── week3/  (same shape)
```

`SCHEMA.md` and `BUSINESS_LOGIC.md` are **incremental, not cumulative** — a given week's file documents only what changed that week. A running, cumulative picture (all tables, all states, as they currently stand) belongs in `2_Architecture_and_Design`-style living docs once the schema stabilizes past MVP; for now, `AGENT_FLEET_DESIGN.md` Section 6 is that cumulative reference, and each week's `SCHEMA.md` is a diff against it.

---

## How Claude Code Will Use This

1. Claude reads the task file (or, for Week 1, `WEEK1_INSTRUCTIONS.md`) in full, plus the `SCHEMA.md`/`BUSINESS_LOGIC.md` it references.
2. If this is the week's first task: checks out a current `main`, creates `week-[N]`, and (once this task is committed and pushed) opens the week's draft PR — see "Git Workflow."
3. Executes the "Implementation" section.
4. Runs the "Testing" section to verify.
5. Generates the report at `execution/week[N]/reports/task[ID].md`.
6. Upserts this task's row in `execution/week[N]/STATUS.md` (creating the file if it's the week's first completed task).
7. If implementation deviated from the schema or business logic as documented, updates `SCHEMA.md`/`BUSINESS_LOGIC.md` to match reality and flags the deviation in the report — the docs describe what was actually built, not just what was planned.
8. Commits code + report + `STATUS.md` together and pushes to `week-[N]` — see "Git Workflow."
9. If this was the week's last task, marks the PR ready for review (still doesn't merge).
10. Moves to the next task.

---

## Key Principles

1. **Self-contained** — a task file has everything Claude Code needs, without requiring the full conversation history.
2. **Concrete** — exact file paths, specific commands, real code patterns.
3. **Verifiable** — the Testing section has clear pass/fail criteria.
4. **Consistent** — same shape across all weeks and tasks.
5. **Progressive** — tasks build on prior weeks' work.
6. **Schema and business logic documented once, referenced everywhere** — a task file states only its delta; `SCHEMA.md`/`BUSINESS_LOGIC.md` are the single source of truth for a given week. This avoids the duplication `yt_shorts` had between `WEEK1_PLAN.md` (which inlined the full Prisma schema) and `DATA_MODEL.md` (which also had it) — two places that could silently drift apart.
