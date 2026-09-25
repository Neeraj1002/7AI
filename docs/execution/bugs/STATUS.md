# Bugs Status: Founder/Device-Tested Production Issues

**Purpose**: not a sprint. This folder tracks real, founder-found bugs surfaced by actually running a
built app/API against real devices — as opposed to `sprint[N]/`, which tracks planned feature work.
Items land here when the founder hits something broken while testing, not when a task is scheduled in
advance. Expect this folder to keep growing as more hotfixes are found (the founder's own words:
"I'll build again and share other hot fixes") — each new report gets the next `task[N].md`, this file
gets a new row, nothing here is sprint-numbered or bound to a `SPRINT[N]_BE`/`_FE` branch.

**This track can be worked by a dedicated chat.** A separate chat attached to this Project, linked to
the same computer, can act as an independent "hot fixer" against this folder specifically — see
[HOTFIXER_AGENT_PROTOCOL.md](HOTFIXER_AGENT_PROTOCOL.md) for its scope, the coordination rules that
keep it from colliding with sprint work or another concurrent bug-fixer chat, and a ready-to-paste
kickoff message.

**Folder status**: 1 item logged, 0 fixed. All items below are **high priority / production issues** —
the founder cannot currently complete a real device sign-in at all (Task 1), which blocks every other
piece of on-device testing until it's fixed.
**Last updated**: 2026-09-25 (Hot-fixer agent protocol added).

| Task | Name | Status | Owner | Notes |
|---|---|---|---|---|
| 1 | First Device Test — Login Unreachable, Wrong Host Default, Stale Build, Empty Channel Picker | In Progress | Hot-fixer chat, started 2026-09-26 | 4 real, code-confirmed problems from the founder's first physical-device test (3 screenshots: New Brief, Queue, Dashboard). Root blocker is R1 (Android cleartext-traffic block) — nothing else in this report can be verified on-device until it's fixed. |

## Naming and branch convention
Same per-task git discipline as every other track in this repo (see `docs/execution/templates/TASK_TEMPLATE.md`
§ Git Workflow), with its own track identifier: **`BUGS`** (e.g. branch `BUGS_FE`, commit
`BUGS_TASK1_FE: ...`) — distinct from any `SPRINT[N]_BE`/`_FE` or `FRONTEND_FE` branch, since a
production-bug fix should never get tangled up with in-flight sprint scope on the same branch. A bug
found in backend code uses `BUGS_BE` instead; most items here are expected to be frontend/mobile-app
issues given how they're found (on-device testing), but nothing about this folder assumes that.

## Full detail
Task docs: `docs/execution/bugs/tasks/task1.md` (more will be added as they're found).
Per-task reports (written once each is actually fixed and verified): `docs/execution/bugs/reports/task1.md`, etc.
Hot-fixer agent operating protocol: `docs/execution/bugs/HOTFIXER_AGENT_PROTOCOL.md`.

## Communication shorthand used in these docs
**7fe** = `D:\Study Material\7AI-frontend` — the git worktree the founder actually builds and tests
from. Not a folder rename, just shorthand agreed in chat to keep task docs shorter. The main checkout
at `D:\Study Material\7AI` is the same repo (linked worktree, same DB, same remote) but can run stale
code if a build isn't taken from 7fe specifically — see Task 1/R3.
