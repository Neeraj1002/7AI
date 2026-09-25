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
kickoff message. **The protocol was revised on 2026-09-25** after three real findings this session
surfaced: (1) a worktree-naming mistake (see below), (2) a hot-fixer/conflict-resolution session
pushing straight to `main` — now a hard, no-exceptions violation of scope, and (3) the old two-way
`_BE`/`_FE` branch split didn't distinguish native (rebuild-required) from non-native (OTA-eligible)
frontend work, which matters a lot given Task 2 below — see the protocol's new **Track Roles**
(`BE`/`FE`/`APP`) section.

**Folder status**: 2 items logged. **Task 1's code is fully on `main`**: R1 (`expo-build-properties`/
cleartext), then R2 (login default) and R4 (channel-picker states) — all confirmed by direct read as of
2026-09-25, all landed via the founder pushing directly from 7fe to `main` (a deliberate founder action,
not a hot-fixer push; the no-direct-push-to-`main` rule in the protocol binds hot-fixer/agent sessions,
not the founder). **No report has ever been written for Task 1 anywhere durable** — that's the one real
remaining item, plus R3's process step and real on-device verification. Task 2 is a new, high priority
production task: bundle every other pending native-config change into the next build (so this is the
last native-only rebuild needed for a while) and finish the OTA (`expo-updates`) setup — which turned
out, on inspection, to be already partially in place (the package and an `updates.url` are already
there; the policy/`checkAutomatically` decisions and real verification are what's missing).
**Last updated**: 2026-09-26 (Task 1 closed out — report written and committed; worktree situation
resolved differently than planned, see checkout-location note below).

**Checkout location — read this before touching anything.** This track's docs are now kept in sync in
**two** places, not one: this Project (read by any chat via the docs tool) and the actual worktree the
hot-fixer works from on disk. As of 2026-09-26 the shared worktree is `D:\Study Material\7AI-bugs`,
created fresh from `origin/main` — **not** a rename of the old `D:\Study Material\7AI-bugs-fe`. That
rename was attempted (`git worktree move`, plain filesystem move, PowerShell `Rename-Item`) and failed
every time with "device or resource busy" / "used by another process," with no process or open handle
found referencing that path — most likely a transient OS-level lock (Windows Search/Defender scanning
the ~1,200 files just installed into its `node_modules`). Per the protocol's own fallback, `7AI-bugs` was
created fresh instead. **`D:\Study Material\7AI-bugs-fe` is still on disk and should be deleted once the
lock clears** — its content is superseded (see `reports/task1.md`), nothing is lost by removing it. A doc
written only into the main checkout (`D:\Study Material\7AI`) is **not** automatically visible from a
different worktree's own `git status`/local files — that was the original mistake this note exists to
prevent happening again.

| Task | Name | Status | Owner | Branch | Notes |
|---|---|---|---|---|---|
| 1 | First Device Test — Login Unreachable, Wrong Host Default, Stale Build, Empty Channel Picker | Done — action needed | **Founder** (real-device verification only) | `BUGS_TASK1_REPORT` (docs-only closure commit — see `reports/task1.md`'s Branch note for why this isn't `BUGS_FE`) | R1 (`APP`), R2 (`FE`), R4 (`FE`) all confirmed on `main` by direct read; R3's process step reconfirmed (7fe's merge conflict is now resolved). Report written and committed at `reports/task1.md` — the only thing left is real on-device verification, which no hot-fixer session has had the tooling/device for. |
| 2 | Bundle All Remaining Native-Config Changes + Finish OTA Update Support | In Progress | Hot-fixer chat, started 2026-09-26 | `BUGS_APP_b2` (`eas build:version:get --platform android` returned current versionCode 1, so `<N> = 2`) | HIGH PRIORITY / production issue. Role `APP`. Audits for any other pending native-config change and bundles it into this build; finishes `expo-updates` configuration (already partially in place — see task doc's corrected R2). See `tasks/task2.md`. |

## Naming and branch convention
Same per-task git discipline as every other track in this repo (see `docs/execution/templates/TASK_TEMPLATE.md`
§ Git Workflow), with its own track identifier: **`BUGS`**, and — as of 2026-09-25 — a three-way branch
split by **role** rather than the old two-way FE/BE split (see `HOTFIXER_AGENT_PROTOCOL.md`'s Track
Roles section for the full definitions):
- **`BUGS_BE`** — backend/API (`studio/`) fixes.
- **`BUGS_FE`** — non-native JS/React-Native logic fixes inside `app/` — OTA-eligible once Task 2 lands.
- **`BUGS_APP_b<N>`** — native mobile-app changes (new dependency, permission, `app.json` plugin,
  anything in the `android`/`ios` blocks) — always needs a fresh `eas build` + reinstall, never OTA.
  `<N>` is the Android version code this branch's work ships in, read from `eas build:version:get
  --platform android` (this repo uses `appVersionSource: "remote"`, so the real number lives on EAS's
  servers, not in `app.json`) plus 1.

All three are distinct from any `SPRINT[N]_BE`/`_FE` or `FRONTEND_FE` branch, since a production-bug fix
should never get tangled up with in-flight sprint scope on the same branch.

**Worktree correction (2026-09-25)**: Task 1's hot-fixer session created a worktree at
`D:\Study Material\7AI-bugs-fe`, named by analogy to the branch suffix (`BUGS_FE`) — a reasonable
inference, but the wrong model. This track works one task at a time regardless of which side of the
codebase it touches, so it uses a **single shared worktree** at `D:\Study Material\7AI-bugs` (no `-fe`
suffix), not one worktree per branch suffix. `7AI-bugs-fe` should be reused/renamed to `7AI-bugs` rather
than left in place with a second worktree created alongside it. See the revised protocol's Coordination
§4.

## Full detail
Task docs: `docs/execution/bugs/tasks/task1.md`, `docs/execution/bugs/tasks/task2.md` (more will be
added as they're found).
Per-task reports (written once each is actually fixed and verified):
`docs/execution/bugs/reports/task1.md`, `docs/execution/bugs/reports/task2.md` (once Task 2 is done).
Hot-fixer agent operating protocol: `docs/execution/bugs/HOTFIXER_AGENT_PROTOCOL.md`.

## Communication shorthand used in these docs
**7fe** = `D:\Study Material\7AI-frontend` — the git worktree the founder actually builds and tests
from. Not a folder rename, just shorthand agreed in chat to keep task docs shorter. The main checkout
at `D:\Study Material\7AI` is the same repo (linked worktree, same DB, same remote) but can run stale
code if a build isn't taken from 7fe specifically — see Task 1/R3.
