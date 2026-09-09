# 7AI Task Template

## Overview

This is the standard template for every 7AI execution task, Week 2 onward. It's adapted from the template `yt_shorts` used, with two additions that matter specifically because 7AI is a stateful, multi-agent system rather than a single CRUD service: a **Schema Impact** section and a **Business Logic / State Transition** section. Almost every 7AI task touches the shared Postgres schema, the Orchestrator's state machine, or an agent contract — none of which a simpler template forces you to think through explicitly, and all three are exactly where "it compiled but the pipeline still broke" bugs come from in a system like this.

**Week 1 is the one exception.** Because Week 1 is tightly-sequenced scaffolding (repo → DB → schema → orchestrator skeleton → bot → external setup), it ships as one consolidated document, `week1/WEEK1_INSTRUCTIONS.md`, instead of eight separate task files. Starting Week 2, each task gets its own file under `execution/week[N]/tasks/`, following this template exactly — mirroring how `yt_shorts` itself moved from a single `WEEK1_PLAN.md` to per-task files from Week 2 onward.

**Updated 2026-09-09 — two parallel tracks.** Starting with Week 4 (backend) and the new frontend track, two independent lines of work build against this repo at the same time: the week-numbered backend track and the frontend track (`docs/execution/frontend/`). Everything below still applies unchanged to both — the only change is the Git Workflow section, which now distinguishes the two tracks by a `_BE`/`_FE` suffix on every branch, commit, and PR so it's unambiguous which track a given change belongs to. See that section for the full convention.

---

## Template Structure

### Header

```markdown
# Week [N] Task [ID]: [Task Name]

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** It defines the Git Workflow (branch/commit/PR steps for this task), the `STATUS.md` update this task must make, and the section structure this file follows. This file states only this task's specifics — the template governs everything else, so don't skip it.

**Objective**: One-sentence description of what this task accomplishes
**Duration**: Estimated hours
**Depends On**: Previous tasks (if any)
**Owning Component**: Orchestrator | [Agent Name] | Shared Schema | Infra
**Success Criteria**: What makes this task complete
```

*(This "read the template first" line is boilerplate — every task file includes it verbatim, right after the title, before `**Objective**`. Its purpose is exactly what you're reading: so nobody has to remember to say "also check TASK_TEMPLATE.md" out loud before handing a task file to Claude Code.)*

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

The frontend track follows this exact same pattern at `docs/execution/frontend/STATUS.md` — it isn't week-numbered, but it gets the same one-file, upserted-per-task status tracker as any week does.

### Git Workflow *(updated 2026-09-09 — two parallel tracks)*

**Branch per track-iteration, commit per task, PR per track-iteration — merging to `main` is always a founder decision, never automatic.**

Two independent tracks now build against this repo at the same time: the **backend track** (week-numbered, `docs/execution/week[N]/`) and the **frontend track** (`docs/execution/frontend/`, not week-numbered — one ongoing track rather than a sequence of weeks). Every branch, commit message, and PR title carries a suffix identifying which track it belongs to — **`_BE`** for backend, **`_FE`** for frontend — so it's unambiguous at a glance, in `git log`, the GitHub PR list, or anywhere else, which track a given change came from now that both can be in flight simultaneously.

**Track identifier** (used in place of `[TRACK]` below):
- Backend: `WEEK[N]` — e.g. `WEEK4`
- Frontend: `FRONTEND` — the whole track is one identifier, since it isn't week-numbered

**Starting a new track-iteration** (first task only — a new week for backend, or the first time the frontend track picks up work):
1. `git checkout main && git pull` — start from a current `main`.
2. If no `origin` remote exists yet: `gh repo create 7AI --private --source=. --remote=origin` (ask the founder to run `gh auth login` first if `gh auth status` isn't authenticated — don't try to work around this).
3. `git checkout -b [TRACK]_[SUFFIX]` — e.g. `WEEK4_BE`, `FRONTEND_FE`.
4. After this first task's commit is pushed (below), open the PR as a draft: `gh pr create --draft --title "[TRACK]_[SUFFIX]: [Theme]" --body "Tracking PR for [TRACK]. Live status: docs/execution/[week[N]|frontend]/STATUS.md. Do not merge until marked ready for review."` — e.g. title `WEEK4_BE: Video Generation Loop Fix + Stock Footage, Publishing, Analytics` or `FRONTEND_FE: API Layer, App Scaffold, Dashboard`. The body links to `STATUS.md` rather than duplicating it (same "documented once" principle as the rest of this template), so it never needs editing as the track progresses.

**After every task** (every task, every track), once its report and `STATUS.md` row are written:
1. `git add` the task's code changes together with its report and `STATUS.md` update — one atomic commit per task.
2. Commit message shape:
   ```
   [TRACK]_TASK[ID]_[SUFFIX]: [Task Name]

   [1-2 sentence summary of what changed]
   [One line per deviation from spec, if any]
   ```
   e.g. `WEEK4_TASK1_BE: Video Generation — Close the Review Loop + Stock Footage` or `FRONTEND_TASK1_FE: API Layer`.
3. `git push` (`-u origin [TRACK]_[SUFFIX]` on the track-iteration's first push, plain `git push` after) — every task's work reaches GitHub immediately, not just at the end.

**Finishing a track-iteration** (last task only): after the final task's commit and push, `gh pr ready` to mark the PR ready for review. Do not merge, and do not treat merging as part of task completion — that's a deliberate founder action (via the GitHub PR review, or telling me to merge once reviewed). This is the one point where a founder actually looks at a diff before it becomes `main`, worth keeping even solo — and worth it more, not less, now that two tracks can land on `main` independently: nothing about the `_BE`/`_FE` naming changes that both still need a real look before merging.

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
│   ├── SCHEMA.md                  ← always present; "No schema changes this week" if none
│   ├── BUSINESS_LOGIC.md          ← always present; "No new control flow this week" if none
│   ├── STATUS.md                  ← one row per task, updated as each completes
│   ├── tasks/
│   │   ├── task1.md
│   │   ├── task2.md
│   │   └── ...
│   └── reports/
│       ├── task1.md
│       └── ...
├── week3/  (same shape)
├── week4/  (same shape — backend track, branch/commit suffix `_BE`)
└── frontend/  (same shape, not week-numbered — branch/commit suffix `_FE`)
    ├── SCHEMA.md
    ├── BUSINESS_LOGIC.md
    ├── STATUS.md
    ├── tasks/
    │   ├── task1.md
    │   ├── task2.md
    │   └── task3.md
    └── reports/
        └── ...
```

`SCHEMA.md` and `BUSINESS_LOGIC.md` are **incremental, not cumulative** — a given week's file documents only what changed that week. A running, cumulative picture (all tables, all states, as they currently stand) belongs in `2_Architecture_and_Design`-style living docs once the schema stabilizes past MVP; for now, `AGENT_FLEET_DESIGN.md` Section 6 is that cumulative reference, and each week's `SCHEMA.md` is a diff against it. The frontend track's `SCHEMA.md`/`BUSINESS_LOGIC.md` are diffs the same way, just against the whole system rather than against a specific prior week.

Both files are created at the start of every week (alongside `STATUS.md`, by whichever task is first that week) even when nothing's changed yet — write "No schema changes this week" / "No new control flow this week" explicitly rather than omitting the file. A missing file reads as "nobody checked," not as "nothing changed"; an explicit placeholder says the check happened and came back negative. If a later task in the week does introduce a change, that task updates the file in place — replacing the placeholder text with the real delta, not appending around it.

---

## How Claude Code Will Use This

1. Claude reads the task file (or, for Week 1, `WEEK1_INSTRUCTIONS.md`) in full, plus the `SCHEMA.md`/`BUSINESS_LOGIC.md` it references.
2. If this is the track-iteration's first task: checks out a current `main`, creates `[TRACK]_[SUFFIX]` (e.g. `WEEK4_BE`, `FRONTEND_FE`), and (once this task is committed and pushed) opens the track's draft PR — see "Git Workflow."
3. Executes the "Implementation" section.
4. Runs the "Testing" section to verify.
5. Generates the report at `execution/week[N]/reports/task[ID].md` (or `execution/frontend/reports/task[ID].md`).
6. Upserts this task's row in the track's `STATUS.md` (creating the file if it's the track's first completed task).
7. If implementation deviated from the schema or business logic as documented, updates `SCHEMA.md`/`BUSINESS_LOGIC.md` to match reality and flags the deviation in the report — the docs describe what was actually built, not just what was planned.
8. Commits code + report + `STATUS.md` together and pushes to `[TRACK]_[SUFFIX]` — see "Git Workflow."
9. If this was the track-iteration's last task, marks the PR ready for review (still doesn't merge).
10. Moves to the next task.

---

## Key Principles

1. **Self-contained** — a task file has everything Claude Code needs, without requiring the full conversation history.
2. **Concrete** — exact file paths, specific commands, real code patterns.
3. **Verifiable** — the Testing section has clear pass/fail criteria.
4. **Consistent** — same shape across all weeks and tasks, and across both tracks.
5. **Progressive** — tasks build on prior weeks' (or, for frontend, prior tasks') work.
6. **Schema and business logic documented once, referenced everywhere** — a task file states only its delta; `SCHEMA.md`/`BUSINESS_LOGIC.md` are the single source of truth for a given week or track. This avoids the duplication `yt_shorts` had between `WEEK1_PLAN.md` (which inlined the full Prisma schema) and `DATA_MODEL.md` (which also had it) — two places that could silently drift apart.
7. **Track identity is never ambiguous** — every branch, commit, and PR carries `_BE` or `_FE`, so two people (or two Claude Code chats) working the backend and frontend tracks in parallel never collide on naming or accidentally review the wrong diff against the wrong track's `STATUS.md`.
