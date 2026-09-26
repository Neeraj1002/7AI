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

**Folder status**: 3 items logged. Task 1 and Task 2 are both **code-complete**, waiting only on
founder-side real-device verification (see their own rows below). **Task 3 is new** — a second
founder device-test pass surfaced six more issues, ranked by real severity rather than report order:
a confirmed live cross-tenant data leak (any signed-in user can currently see and open every other
tenant's runs — more urgent now than when found, given the founder is about to stand up a real second
production tenant), the bug-report tool itself not working (submit does nothing, no feedback, in-app
browser never closes — this was blocking the founder from logging anything else), Script Review's score
never actually blocking a bad script from reaching video generation, a keyboard-overlap issue across
every screen with a text field, and friction getting a usable magic-link token onto the phone. One item
(stale/pending runs overcrowding the queue) is logged as a design note only, not a build item yet.
**Last updated**: 2026-09-26 (Task 3 code complete for R1-R5, real-device/Telegram-token/dev-DB-migration
verification pending — see its row below and `reports/task3.md`).

**Shipping boundary — read this before deciding whether a fix needs a rebuild.** `expo-updates` is fully
configured (`runtimeVersion.policy: "fingerprint"`, `updates.checkAutomatically: "ON_LOAD"`). A
**JS/React-Native-logic-only** change (no new native dependency, no new permission, no `app.json`
plugin, nothing in `android`/`ios` — same shape as Task 1's own R2/R4, and confirmed true of all of Task
3's R1-R5 too) ships via `eas update --branch preview`, **no new APK, no reinstall**. Only a genuinely
**native** change needs another full `eas build` — check for other pending native changes to bundle into
the same build first, per Task 2's own principle. (Task 3's R4 raised a candidate native change,
`android.softwareKeyboardLayoutMode` — deliberately not added without live proof it's needed; see
`reports/task3.md`.)

**Checkout location — read this before touching anything.** This track's docs are kept in sync in
**two** places: this Project (read by any chat via the docs tool) and the actual worktree the
hot-fixer works from on disk, `D:\Study Material\7AI-bugs` (created fresh from `origin/main` — **not**
a rename of the old `D:\Study Material\7AI-bugs-fe`, which is still on disk and should be deleted once
its OS-level file lock clears — see `reports/task1.md`'s own note). A doc written only into the main
checkout (`D:\Study Material\7AI`) is **not** automatically visible from a different worktree's own
`git status`/local files.

**Note on Task 3's R2 (resolved)**: `app/components/ReportBugButton.tsx` turned out to already be on
`main` (commit `a3ea7e5`) — the earlier note above (and the task doc's own claim) that it only existed in
`7AI-frontend` was stale, confirmed by direct read before editing. No file move was needed.

| Task | Name | Status | Owner | Branch | Notes |
|---|---|---|---|---|---|
| 1 | First Device Test — Login Unreachable, Wrong Host Default, Stale Build, Empty Channel Picker | Done — action needed | **Founder** (real-device verification only) | `BUGS_TASK1_REPORT` | R1/R2/R4 all confirmed on `main` by direct read; R3's process step reconfirmed. Report at `reports/task1.md`. Only real on-device verification remains. |
| 2 | Bundle All Remaining Native-Config Changes + Finish OTA Update Support | Done — action needed | **Founder** (build + real device/OTA verification only) | `BUGS_APP_b2` | `expo-updates` fully configured (`fingerprint` runtime policy, `ON_LOAD` auto-check). Build/lint/typecheck all pass. Report at `reports/task2.md`. Real build + on-device install + one real OTA proof are founder-action-pending. |
| 3 | Second Device Test — Cross-Tenant Data Leak, Bug-Report Tool Broken, Script-Review Gate Not Enforced, Keyboard Overlap, Magic-Link Delivery via Telegram | Done — action needed | **Founder** (dev-DB migration deploy + real device/Telegram-bot verification) | `BUGS_BE` (R1, R3, R2/R5 backend halves) + `BUGS_FE_TASK3` (R2/R5 frontend halves, R4) — see `reports/task3.md`'s Deviations for why two branches, and why `_TASK3` not plain `BUGS_FE` | R1 (tenant leak) **confirmed fixed by a real, live two-tenant test against an isolated sandbox DB** — not just code review. R3's auto-reject/retry-cap loop also live-verified the same way. R2's file-location note above turned out stale (already on `main`). R4 audited; FE-only fix applied, native `softwareKeyboardLayoutMode` deliberately deferred pending a real retest. R5 needed a real migration the task doc didn't anticipate (`telegramChatId` was dropped, not just unused) — added, applied to the sandbox DB, verified live; **still needs deploying to the shared dev DB** before merge. Full detail: `reports/task3.md`. |

## Naming and branch convention
Same per-task git discipline as every other track in this repo (see `docs/execution/templates/TASK_TEMPLATE.md`
§ Git Workflow), with its own track identifier: **`BUGS`**, and a three-way branch split by **role**
(see `HOTFIXER_AGENT_PROTOCOL.md`'s Track Roles section for the full definitions):
- **`BUGS_BE`** — backend/API (`studio/`) fixes.
- **`BUGS_FE`** — non-native JS/React-Native logic fixes inside `app/` — OTA-eligible.
- **`BUGS_APP_b<N>`** — native mobile-app changes — always needs a fresh `eas build` + reinstall, never
  OTA. `<N>` is the Android version code this branch's work ships in, read from `eas build:version:get
  --platform android` plus 1.

All three are distinct from any `SPRINT[N]_BE`/`_FE` or `FRONTEND_FE` branch.

**Task 3's own branch note (resolved)**: confirmed as expected — none of R1-R5 needed a native/app.json
change, so no `APP`-role rebuild was forced. But per the protocol's "a branch should not span roles"
rule, R2 and R5 (each spanning `BE`+`FE`) were still split across two branches rather than forced onto
one: `BUGS_BE` (R1, R3, plus R2/R5's backend halves) and `BUGS_FE_TASK3` (R2/R5's frontend halves, plus
R4). Plain `BUGS_FE` was unavailable — see `reports/task1.md`'s note on that same collision from Task 1's
first session.

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
