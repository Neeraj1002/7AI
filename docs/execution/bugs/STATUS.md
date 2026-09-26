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

**Folder status**: 3 items logged. Tasks 1, 2, and 3 are all **code-complete**, waiting only on
founder-side real-device/dev-DB-migration/Telegram-bot verification (see each task's own row below).
Task 3's second device-test pass covered five real build items in priority order — a confirmed live
cross-tenant data leak (fixed and live-verified against an isolated sandbox database, not just code
review), the bug-report tool not working, Script Review's score never actually blocking a bad script,
a keyboard-overlap issue across several screens, and friction getting a usable magic-link token onto the
phone via a small new Telegram-bot delivery path — plus one design-note-only item (stale/pending runs
overcrowding the queue, not a build item this round).
**Last updated**: 2026-09-26 (Task 3 code-complete and reported; branch/release model changed for
releases *after* Task 3 — see below).

**Shipping boundary — read this before deciding whether a fix needs a rebuild.** `expo-updates` is fully
configured (`runtimeVersion.policy: "fingerprint"`, `updates.checkAutomatically: "ON_LOAD"`). A
**JS/React-Native-logic-only** change (no new native dependency, no new permission, no `app.json`
plugin, nothing in `android`/`ios` — same shape as Task 1's own R2/R4, and confirmed true of all of Task
3's R1-R5) ships via `eas update --branch preview`, **no new APK, no reinstall**. Only a genuinely
**native** change needs another full `eas build` — check for other pending native changes to bundle into
the same build first, per Task 2's own principle. This is a per-**item** shipping characteristic (see
each `R#`'s own role tag) — it no longer implies a separate branch; see the branch convention below.
(Task 3's R4 raised a candidate native change, `android.softwareKeyboardLayoutMode` — deliberately not
added without live proof it's needed; see `reports/task3.md`.)

**Checkout location — read this before touching anything.** This track's docs are kept in sync in
**two** places: this Project (read by any chat via the docs tool) and the actual worktree the
hot-fixer works from on disk, `D:\Study Material\7AI-bugs` (created fresh from `origin/main` — **not**
a rename of the old `D:\Study Material\7AI-bugs-fe`, which is still on disk and should be deleted once
its OS-level file lock clears — see `reports/task1.md`'s own note). A doc written only into the main
checkout (`D:\Study Material\7AI`) is **not** automatically visible from a different worktree's own
`git status`/local files.

| Task | Name | Status | Owner | Branch | Notes |
|---|---|---|---|---|---|
| 1 | First Device Test — Login Unreachable, Wrong Host Default, Stale Build, Empty Channel Picker | Done — action needed | **Founder** (real-device verification only) | `BUGS_TASK1_REPORT` | R1/R2/R4 all confirmed on `main` by direct read; R3's process step reconfirmed. Report at `reports/task1.md`. Only real on-device verification remains. Predates the one-branch-per-release model below — not retroactively restructured. |
| 2 | Bundle All Remaining Native-Config Changes + Finish OTA Update Support | Done — action needed | **Founder** (build + real device/OTA verification only) | `BUGS_APP_b2` | `expo-updates` fully configured (`fingerprint` runtime policy, `ON_LOAD` auto-check). Build/lint/typecheck all pass. Report at `reports/task2.md`. Real build + on-device install + one real OTA proof are founder-action-pending. Predates the one-branch-per-release model below — not retroactively restructured. |
| 3 | Second Device Test — Cross-Tenant Data Leak, Bug-Report Tool Broken, Script-Review Gate Not Enforced, Keyboard Overlap, Magic-Link Delivery via Telegram | Done — action needed | **Founder** (dev-DB migration deploy + real device/Telegram-bot verification) | `BUGS_BE` (#18) + `BUGS_FE_TASK3` (#19) + `BUGS_TASK3_REPORT` (#21) — three branches, not one `BUGS_TASK3`; **also predates the one-branch-per-release model below, grandfathered like Task 1/2 rather than retroactively restructured, even though this model's own text below was originally drafted (concurrently, in this same worktree) assuming Task 3 hadn't started yet** | R1 (tenant leak) **confirmed fixed by a real, live two-tenant test against an isolated sandbox DB**. R3's auto-reject/retry-cap loop also live-verified the same way. R2's file-location note (below, now historical) turned out stale — `ReportBugButton.tsx` was already on `main`. R4 audited; FE-only fix applied, native `softwareKeyboardLayoutMode` deliberately deferred pending a real retest. R5 needed a real migration the task doc didn't anticipate (`telegramChatId` was dropped, not just unused) — added, applied to a sandbox DB, verified live; still needs deploying to the shared dev DB. Full detail: `reports/task3.md`. |

## Naming and branch convention *(changed 2026-09-26 — one branch per release, replacing the old per-role split, effective starting with the release after Task 3)*
Same per-task-doc git discipline as every other track in this repo (see `docs/execution/templates/TASK_TEMPLATE.md`
§ Git Workflow), with its own track identifier: **`BUGS`**. Starting with **Task 4**, this track uses
**one branch per release** (a "release" = one numbered Bugs Task), not a branch per role:

- **`BUGS_TASK<N>`** — the one branch for release (Bugs Task) `<N>`'s entire scope, every item, every
  role. One commit per `R#` item (`BUGS_TASK<N>_R<X>: ...`), plus one closing commit for the report and
  this file's own upsert (`BUGS_TASK<N>_REPORT: ...`). One PR for the whole release, opened as a draft
  when the first item is picked up, marked ready once every item is done.

Distinct from any `SPRINT[N]_BE`/`_FE` or `FRONTEND_FE` branch, and from `UIUX_FE`/`UIUX_APP_b<N>` (the
UI/UX track's own convention). See `HOTFIXER_AGENT_PROTOCOL.md`'s **Release & Branch Model** section for
the full rule and why it replaced the old three-way `BUGS_BE`/`BUGS_FE`/`BUGS_APP_b<N>` split — that
model produced multiple sibling branches per release, all cut from `main` around the same time and
frequently touching the same shared files, which is what caused several open PRs to pile up in conflict
with each other. **Tasks 1, 2, and 3 predate this change and are not retroactively restructured** — Task
3 in particular was already fully implemented (three sibling branches, #18/#19/#21) by the time this
rewrite was drafted; it stays as three branches rather than being consolidated after the fact.

Role tags (`BE`/`FE`/`APP`) still apply per item — see `HOTFIXER_AGENT_PROTOCOL.md`'s **Role Tags**
section — but now only describe shipping/verification mechanics (does this item ship via OTA, or does it
need a fresh `eas build`), not which branch a commit lands on.

## Full detail
Task docs: `docs/execution/bugs/tasks/task1.md`, `docs/execution/bugs/tasks/task2.md`,
`docs/execution/bugs/tasks/task3.md`.
Per-task reports (written once each is actually fixed and verified):
`docs/execution/bugs/reports/task1.md`, `docs/execution/bugs/reports/task2.md`,
`docs/execution/bugs/reports/task3.md`.
Hot-fixer agent operating protocol: `docs/execution/bugs/HOTFIXER_AGENT_PROTOCOL.md`.

## Communication shorthand used in these docs
**7fe** = `D:\Study Material\7AI-frontend` — the git worktree the founder actually builds and tests
from. Not a folder rename, just shorthand agreed in chat to keep task docs shorter. The main checkout
at `D:\Study Material\7AI` is the same repo (linked worktree, same DB, same remote) but can run stale
code if a build isn't taken from 7fe specifically — see Task 1/R3.
