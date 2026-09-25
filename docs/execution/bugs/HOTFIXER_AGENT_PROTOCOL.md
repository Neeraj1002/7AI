# Bugs Track: Hot-Fixer Agent Protocol

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting** — this protocol governs
*which* tasks a dedicated hot-fixer chat picks up and *how it coordinates with other chats*; the
template still governs the shape of the work itself (branch/commit steps, report format, `STATUS.md`
upsert). This file is the missing piece that makes it safe to run a hot-fixer chat concurrently with
whatever other chat (planning, sprint work) is also touching this repo.

## Why this exists
A second chat, attached to the same "7AI" Project and linked to the same computer as any other active
chat, can genuinely work independently — it has its own copy of every tool, reads/writes the same
Project docs, and can read/edit/build/test/commit on the shared codebase on its own. It is **not**
sandboxed from other chats touching the same files at the same time. The two real risks are: (1) two
chats picking up the *same* task and duplicating or conflicting work, and (2) a hot-fixer chat's branch
or edits colliding with sprint work in progress on the same files. This protocol exists to prevent both,
not to prevent the setup itself — the setup is fine.

## Purpose
A chat operating under this protocol is a **hot fixer**: it exists to pick up already-documented items
in `docs/execution/bugs/tasks/`, implement them, verify them live, and report — nothing more. It does
not plan features, does not restructure sprints, and does not invent scope beyond what a task doc
already states.

## Scope — in and out

**In scope**:
- Any task under `docs/execution/bugs/tasks/` whose `STATUS.md` row is `Not started`.
- Writing a *new* minimal task doc for a genuinely new, small, founder-reported bug, following this
  same folder's conventions (Task doc shape from `TASK_TEMPLATE.md`, `R1/R2/...` requirements with
  Where/Fix/Verify) — only when the founder hands it a bug directly and no task doc for it exists yet.
  It still writes the doc before touching code, same as every other track in this repo — "just fix it"
  is not a license to skip the paper trail everything else here has.

**Out of scope — never touched by a hot-fixer chat**:
- Anything under `docs/execution/sprint[N]/` or `docs/execution/frontend/` — planned feature work
  belongs to whichever chat/track owns that sprint, not to the bug queue.
- Any task whose fix would require a schema migration, a new external credential/OAuth scope, or a
  change to auth/security logic beyond what's explicitly described in an existing bug task's Fix — stop
  and hand it back to the founder as "needs a real task doc + design decision, not a hot-fix."
- Merging to `main`. Same rule as every other track: a hot-fixer chat opens/updates a PR and marks it
  ready for review; the founder merges.

## Coordination — how it avoids colliding with other chats

1. **Before claiming a task**, read the current `docs/execution/bugs/STATUS.md` fresh from the Project
   (not from memory/context — another chat may have updated it since this chat last looked). If a
   task's row already says `In Progress` with a different owner, do not touch it — pick the next
   `Not started` row instead, or stop and tell the founder if none are available.
2. **Claim before starting**: update that task's row to `In Progress`, with an `Owner` value identifying
   this chat (e.g. `Hot-fixer chat, started 2026-09-25`) — this doubles as the lock other chats check in
   step 1. Do this as its own small commit/write before any code changes, so the claim is visible even
   if the fix itself takes a while.
3. **Before touching any file on the linked computer**, run `git status` and `git log -1` in the repo.
   If the working tree isn't clean, or `HEAD` isn't what `STATUS.md`/the task doc expects, stop and
   report the discrepancy rather than guessing — another chat may be mid-edit.
4. **Branch**: always `BUGS_BE` or `BUGS_FE` (per `STATUS.md`'s existing convention), branched fresh
   from a just-pulled `main` for each task unless a `BUGS_*` branch from an unmerged prior bug task
   already exists and this task is a direct continuation — check before assuming either way.
5. **Never rebase or force-push a branch this chat didn't create.** If `BUGS_FE` already exists with
   commits this chat doesn't recognize, treat it as another chat's in-flight work — stop and ask rather
   than overwriting.
6. **After finishing** (report written, `STATUS.md` row updated to its final status, commit pushed),
   re-read `STATUS.md` one more time before ending the session's work on that task, in case another
   chat's concurrent write needs merging in by hand rather than being silently overwritten.

## Per-task workflow
Otherwise identical to `TASK_TEMPLATE.md`'s own 10-step flow: read the task doc in full, implement,
test, write the report at `docs/execution/bugs/reports/task[N].md`, upsert the `STATUS.md` row, commit
(code + report + `STATUS.md` together, one atomic commit), push, open/update the draft PR, mark ready
for review once the fix is verified live — never merge.

## Definition of done / verification bar
Matches this repo's existing standard, not a lower one because it's "just a bug fix": every task doc in
this folder requires **real, live verification** (a real device, a real API call, a real log line —
never "should work" or a simulated check standing in for it). A hot-fixer chat does not mark a task's
`STATUS.md` row `Done` until it has actually reproduced the fix working, the same bar `hardening-
tenant-check.md` and every sprint task doc already hold themselves to.

## Guardrails — when to stop and ask the founder
- The fix, once started, turns out to need a schema change, a new dependency with licensing/cost
  implications, or touches `auth.tsx`/session/token logic beyond what the task doc already specifies.
- A `BUGS_*` branch already has unrecognized commits (see Coordination §5).
- Two task rows in `STATUS.md` look contradictory (e.g. both `In Progress` with different owners on
  what reads like the same underlying issue) — resolve by asking, not by picking one silently.
- Anything that would require deleting user data, rotating a live credential, or touching the
  production DB directly rather than through the app's own code paths.

## New-bug intake
The founder (or a planning chat) is the normal source of new task docs here, same as this session wrote
`task1.md`. A hot-fixer chat may draft a new minimal task doc itself only for a small, directly
founder-reported bug with no existing doc — see Scope above — and should default to *asking* rather
than assuming when a report is ambiguous enough that the Fix isn't obvious from the report alone.

## Kickoff message
To start a hot-fixer chat, open a new chat attached to this same "7AI" Project, link it to the same
computer this repo lives on (same "Link to this computer" step used for any session that needs to touch
real files), and open with something like:

> You are the hot-fixer for the 7AI project's `docs/execution/bugs/` track. Read
> `docs/execution/bugs/HOTFIXER_AGENT_PROTOCOL.md` in full and follow it exactly — especially the
> Coordination section, since other chats may be working on this repo at the same time. Read
> `docs/execution/bugs/STATUS.md`, claim the next `Not started` task per the protocol, and work it end
> to end: implement, verify live, report, update `STATUS.md`, commit on a `BUGS_*` branch, open/update
> the draft PR. Stop and ask me before merging anything, before touching sprint-track files, or if you
> hit any of the Guardrails in the protocol doc.

## Links & References
- [TASK_TEMPLATE.md](../templates/TASK_TEMPLATE.md)
- [STATUS.md](STATUS.md)
- [hardening-tenant-check.md](../sprint3/tasks/hardening-tenant-check.md) — precedent for a real,
  live-verification bar on a non-sprint-numbered fix
