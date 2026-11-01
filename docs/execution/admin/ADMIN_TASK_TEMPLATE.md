# 7AI Admin Track — Task Template

**Authority**: this file is the template for every task in the **admin track** (`docs/execution/admin/`). It
restates every rule from `docs/execution/templates/TASK_TEMPLATE.md` that applies here (Hard rules, branch
discipline, one commit per item, STATUS upkeep, reports, real-verification bar) and adds the rules that
only an admin module needs (authorization, audit, no secrets, sandbox data). **Where this file and
`docs/execution/templates/TASK_TEMPLATE.md` disagree, the main template wins**, except for the four
deliberate admin-track differences listed under "How the admin track differs", which are authorised here.

**Read this file in full, plus `docs/execution/admin/ADMIN_MODULE_DESIGN.md`, before starting any admin task.**

---

## 1. What the admin track is

The admin module gives the platform owner (the **Admin** role) one place to **see**, **modify** and
**decide** across every tenant, channel, run, cost and bug report, with every change audited. Roles are
**Admin** (platform-wide, `User.isPlatformAdmin`, or the ops token) and **Account owner** (`User.role =
'owner'`, one tenant). `approver` is dormant and must not be built or checked. Full design:
`ADMIN_MODULE_DESIGN.md`.

Work is organised in **Admin sprints**. Each sprint has a backend task and a frontend task, written
separately, each on its own branch and PR, built in that order.

```
docs/execution/admin/
├── ADMIN_MODULE_DESIGN.md
├── ADMIN_TASK_TEMPLATE.md              ← this file
├── sprint1/
│   ├── STATUS.md                       ← one row per task, upserted as each completes
│   ├── SCHEMA.md                       ← this sprint's schema delta (or "No schema changes this sprint")
│   ├── BUSINESS_LOGIC.md               ← this sprint's rules delta (or "No new control flow this sprint")
│   ├── be/task1.md ...                 ← backend tasks (role BE, `studio/`)
│   └── fe/task1.md ...                 ← frontend tasks (role FE or APP, `app/`)
└── report/
    └── sprint1/
        ├── be/task1.md ...             ← same structure as the tasks
        └── fe/task1.md ...
sprint2/ (archived, see docs/ARCHIVE_INDEX.md) ... (same shape)
```

`SCHEMA.md` and `BUSINESS_LOGIC.md` are **incremental** (a diff against the running system, not a full
picture) and are created by the sprint's first task even when nothing changed ("No schema changes this
sprint" is an explicit statement, never an omitted file). A later task that changes something updates the
file in place, replacing the placeholder.

## 2. How the admin track differs from the main template (the only three differences)

1. **Branch names**: `admin_sprint<N>_be` and `admin_sprint<N>_fe` (lower case, e.g. `admin_sprint1_be`,
   `admin_sprint1_fe`), each cut from a freshly pulled `origin/main`. One branch **per track per sprint**, the
   same `_BE` / `_FE` split the main template uses, in this track's naming style.
2. **Track identity is also in the commit message**:
   `ADMIN_SPRINT<N>_TASK<ID>_<BE|FE>_R<X>: ...`, so `git log` is unambiguous even in a merged history.
3. **Reports** live under `docs/execution/admin/report/sprint<N>/<be|fe>/task<ID>.md`, mirroring the task
   folders, not under `sprint<N>/reports/`.

Everything else is the main template's behaviour, including its Hard rules (section 4).

**Order of the two tracks inside a sprint.** The FE task consumes the BE task's API through the generated
`AppRouter` types, so **the FE branch is cut only after the BE PR has been merged to `main`** (the founder
merges it). That keeps every branch cut from `origin/main` and every Hard rule intact. If the founder
explicitly asks for the FE to start earlier, the FE branch may instead be cut from `admin_sprint<N>_be`
(a stacked PR); that needs the founder's instruction in chat, and the FE task records the base branch in
`STATUS.md`.

## 3. Roles (tags on every `R#` item)

Every `R#` item carries exactly one tag. The tag decides how it ships and how it is verified; it does not
decide the branch (everything lands on that task's own `admin_sprint<N>_<be|fe>` branch).

- **`BE`**: backend (`studio/`). Deployed by merging to `main` (auto-deploy). Verified by a real API call.
- **`FE`**: JS/React-Native logic inside `app/` that touches no native config. Ships by OTA
  (`eas update --branch preview`) after merge. No new native dependency, permission, `app.json` plugin or
  `android`/`ios` change.
- **`APP`**: any native change (new native dependency, permission, `app.json` plugin, `android`/`ios`,
  `runtimeVersion`/`updates`). Needs a fresh `eas build` and reinstall; state the target Android version
  code in the item (`eas build:version:get --platform android`, plus 1). **Avoid `APP` items in admin tasks**:
  if one is needed, stop and ask the founder first.

## 4. Git workflow

**Hard rules (same as the main template, no exceptions):**
1. **Never push or merge to `main` directly.** Not even to resolve a conflict. Everything goes on this task's
   branch and into its draft PR. If finishing a task seems to require touching `main`, stop and ask the
   founder.
2. **Only ever commit to a branch you created yourself.** Before pushing to an existing
   `admin_sprint<N>_<be|fe>` branch, confirm via `git log`, `git branch -vv` and the sprint's `STATUS.md`
   `Branch` column that you created it this sprint. If it has commits you don't recognise, treat it as
   another session's in-flight work: stop and ask.
3. **Record the branch name in `STATUS.md` the moment it is created** (the `Branch` column), before or
   immediately after `git checkout -b`, so any later session finds it.

**Checkout locations** (task docs, STATUS and reports are committed from the same checkout as the code):
- **Backend tasks**: `D:\Study Material\7AI` (holds `studio/` and `app/`; the main checkout).
- **Frontend tasks**: `D:\Study Material\7AI-frontend`.
- Never connect any checkout directly to `sevenai_preview`.

**Starting a task (first action of every admin task):**
1. `git fetch origin && git checkout main && git pull`, then `git status` and `git log -1` (a clean tree,
   `HEAD` equal to `origin/main`). For an FE task, also confirm the BE task's row in `STATUS.md` is `Done` or
   `Done — action needed` **and its PR is merged** (see the order rule in section 2).
2. Read the sprint `STATUS.md` fresh. If a `Branch` is already recorded for your task and unmerged, and you
   created it, check it out instead of creating another.
3. `git checkout -b admin_sprint<N>_<be|fe>` and record the name in `STATUS.md` immediately; claim the task's
   row as `In Progress`.
4. **BE task of a sprint only, first commit**: `ADMIN_SPRINT<N>_DOCS: admin track docs for sprint <N>`, adding
   the track's docs that were delivered to the working tree as untracked files (`ADMIN_MODULE_DESIGN.md`,
   `ADMIN_TASK_TEMPLATE.md`, `sprint<N>/` task files and `STATUS.md`). Do not edit them in this commit. (The FE
   branch is cut after the BE PR merged, so these files are already on `main`.)
5. After the first push, open the PR as a draft: `gh pr create --draft --title "admin_sprint<N>_<be|fe>:
   <theme>" --body "Tracking PR for Admin Sprint <N> (<BE|FE>). Live status:
   docs/execution/admin/sprint<N>/STATUS.md. Do not merge until marked ready for review."`

**During a task:**
- **One commit per `R#` item**, committed as soon as that item is implemented and verified:
  `ADMIN_SPRINT<N>_TASK<ID>_<BE|FE>_R<X>: <short description>`. Do not batch items, and do not wait until
  the end to make the first commit.
- Push after every commit.

**Closing a task:**
1. Write the report at `docs/execution/admin/report/sprint<N>/<be|fe>/task<ID>.md`.
2. Upsert this task's row in `docs/execution/admin/sprint<N>/STATUS.md` (status, owner, the real `Branch`,
   notes). Update only this task's row.
3. If the build deviated from `SCHEMA.md` / `BUSINESS_LOGIC.md`, update them to match what was actually
   built and say so in the report.
4. Commit report + STATUS + doc updates as one commit:
   `ADMIN_SPRINT<N>_TASK<ID>_<BE|FE>_REPORT: <task name>`, and push.
5. Mark the PR ready with `gh pr ready`. **Never merge it**, and never push to `main`: merging is the
   founder's decision.
6. Re-read `STATUS.md` once more before ending, in case another session wrote to it.

**One PR per branch.** Never open a second PR for the same branch.

## 5. Coordination

1. Before claiming a task, read `docs/execution/admin/sprint<N>/STATUS.md` fresh from the Project. If the row
   says `In Progress` with another owner, do not touch it.
2. **Claim before starting**: set the row to `In Progress`, owner `<this chat>, started <date>`, as its own
   small write before any code.
3. Before touching files on the computer, run `git status` and `git log -1`. If the tree is dirty or `HEAD`
   is not what `STATUS.md` expects, stop and report.
4. If the task needs a schema migration beyond the one it already specifies, a new external credential, a new
   dependency with cost or licence implications, or a change to auth beyond what the task states, **stop and
   ask the founder**.

## 6. Verification bar

- A task is not `Done` until it has been verified for real, with evidence in the report: a real API call and
  response, a real screen, a real log line. "Should work" is not evidence.
- **Verification environment for admin tasks**: a **local sandbox database** seeded by the task's fixture
  script (several tenants, including the tricky cases the real data showed), never `sevenai_preview`. A
  branch is not deployed to preview before merge, so preview verification is a **founder action after the
  merge**, listed in the report's "Founder actions" section with exact steps.
- Run `npm run build`, `npm run lint`, `npm run typecheck`, and `npx vitest run` for `studio/`; for `app/`
  run `npx tsc --noEmit` and `npm run lint`. All must pass before an item's commit.
- Migrations are **additive only**, idempotent on a fresh DB and a no-op on a DB that already has them,
  never destructive.

## 7. Admin security rules (apply to every admin task)

1. **Deny by default.** Every `admin.*` procedure uses `adminProcedure`. A tenant `owner` session, an
   unauthenticated call, or a session whose user row has `isPlatformAdmin = false` is `FORBIDDEN`.
2. **The platform-admin flag is read from the database on every admin call**, never trusted from the session
   token.
3. **Tenant is always an explicit input** on admin calls. Admin procedures never read `ctx.tenantId`.
4. **Never return secrets**: no tokens, refresh tokens, API keys, `.env` values, presigned URLs that were not
   asked for. Environment checks return key **names** present or missing only.
5. **Every admin write is audited** in `admin_audit_log` in the same transaction as the change: actor, action,
   target, before, after, reason. A `reason` is required for force actions and budget changes.
6. **No impersonation.** Admin reads other tenants' data but never acts as them.
7. **Tenants never see other tenants' data.** Existing tenant-scoped routers stay tenant-scoped, unchanged.
8. Admin screens in the app are only reachable when the server says the user is an Admin, and the server
   re-checks on every call (hiding a screen is a convenience, not security).

## 8. Task file structure

Every task file follows this order. Sections that do not apply say so explicitly ("No schema changes").

```markdown
# Admin Sprint [N] [BE|FE] Task [ID]: [Task Name]

**Read `docs/execution/admin/ADMIN_TASK_TEMPLATE.md` and `docs/execution/admin/ADMIN_MODULE_DESIGN.md` in
full before starting.** Branch: `admin_sprint[N]_[be|fe]` (this task creates it from a fresh `origin/main`).

**Objective**: one sentence.
**Duration**: hours per item and total.
**Depends On**: tasks, closure items, founder actions.
**Owning Component**: ...
**Success Criteria**: numbered, checkable.

---

## Verified findings (date, what was read, from where)   ← facts from the code, so nobody re-litigates them
## Founder decisions already made — don't reopen
## Roles and permissions                                    ← who may call what (Admin / Account owner / none)

### R1 (Role: `BE`|`FE`|`APP`) — Item name
**Where**: exact file / procedure.
**Fix**: concrete enough that no further design decisions are needed.
**Verify**: a real check with a pass condition.

## Schema Impact                  ← delta only; full definitions live in sprint SCHEMA.md
## Business Logic / State Transition   ← preconditions, postconditions, failure modes
### Failure Modes & Handling
## Implementation
### Files to Create / Files to Modify
## Testing                        ← commands and expected results
## Report Template                ← path under admin/report/sprint[N]/, shape below
## Additional Notes
## Known Issues / Future Improvements
## Links & References
## Git Workflow                   ← this task's specifics only; the template governs the rest
```

## 9. Report template

```markdown
# Admin Sprint [N] [BE|FE] Task [ID]: [Task Name]

**Date**: YYYY-MM-DD
**Status**: Complete | Complete — founder actions pending
**Branch**: `admin_sprint[N]_[be|fe]`, commits `ADMIN_SPRINT[N]_TASK[ID]_[BE|FE]_R*`
**Files Created**: N  **Files Modified**: N  **Tests**: all passing

## What Was Done
## Files Created/Modified
## Schema Changes Applied            ← the real migration name, or "None"
## Evidence                          ← per R#: the real request/response, screenshot description, or log
## Test Results                      ← command output
## Deviations from Spec              ← and why; also reflected in SCHEMA.md / BUSINESS_LOGIC.md
## Founder Actions                   ← exact steps (merge, migrate, run script, OTA, preview check)
## Sign-Off
- Task Objective: Met
- Schema Impact: matches SCHEMA.md (or: SCHEMA.md updated)
- Business Logic: matches BUSINESS_LOGIC.md (or: updated)
- Security rules (section 7): all met
- Ready for Integration: Yes
```

## 10. STATUS.md shape (`docs/execution/admin/sprint[N]/STATUS.md`)

```markdown
# Admin Sprint [N] Status: [theme]

**Sprint status**: one line.
**Last updated**: YYYY-MM-DD (after [BE|FE] Task [ID])

| Task | Track | Name | Status | Owner | Branch | Notes |
|---|---|---|---|---|---|---|
| BE 1 | BE | ... | Done | Claude Code | `admin_sprint[N]_be` | |
| FE 1 | FE | ... | Done — action needed | **Founder** | `admin_sprint[N]_fe` | what the founder must do, and where the steps live |
```

**Status** values: `Not started`, `In Progress`, `Done`, `Done — action needed`, `Blocked`.
**Owner**: `Claude Code` (nothing more needed from the founder) or `Founder`. Fill `Branch` the moment the
branch exists. Update only your own row, and never let the file contradict the task's report.

## 11. Delivery of task docs

Whoever writes an admin doc delivers it to **both** the Project (`project_write`) and the real checkout
(`D:\Study Material\7AI`, via the device bridge). A doc that exists in only one place is incomplete. The
BE session commits these as the sprint's first commit (section 4).

## 12. Key principles

1. **Self-contained.** A task file has everything an implementer needs without the conversation history.
2. **Concrete.** Exact files, procedures, commands, expected values.
3. **Verifiable.** Every item has a Verify with a pass condition.
4. **Documented once.** A task states its delta; `SCHEMA.md` / `BUSINESS_LOGIC.md` are the source of truth.
5. **Security is part of the task, not a follow-up.** Section 7 applies to every item.
6. **No scope drift.** If something found along the way is out of scope, record it under Known Issues and
   tell the founder; do not build it.
