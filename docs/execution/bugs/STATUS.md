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

**Folder status**: 2 items logged, both **code-complete**, both waiting only on founder-side real-device
verification. Task 1's R1/R2/R4 are confirmed on `main`, reported at `reports/task1.md`. Task 2's audit
found nothing else pending, and `expo-updates` is now fully configured (`fingerprint` runtime policy,
`ON_LOAD` auto-check) on branch `BUGS_APP_b2` — reported at `reports/task2.md`. What's left for both:
the founder needs to build (`eas build --platform android --profile preview` from a clean checkout with
Task 1+2's changes merged), install, and run the real-device checks each report spells out — including
Task 2's one-time real OTA proof (publish a trivial JS change via `eas update --branch preview`, confirm
the installed app picks it up without a new APK).
**Last updated**: 2026-09-26 (Task 2 code complete — native-config audit done, `expo-updates` fully
configured; real on-device/OTA verification pending, founder action).

**Shipping boundary — read this before deciding whether a fix needs a rebuild.** As of Task 2 landing,
`expo-updates` is fully configured (`runtimeVersion.policy: "fingerprint"`,
`updates.checkAutomatically: "ON_LOAD"`). Going forward: a **JS/React-Native-logic-only** change (no new
native dependency, no new permission, no `app.json` plugin, nothing in `android`/`ios` — same shape as
Task 1's own R2/R4) ships via `eas update --branch preview`, **no new APK, no reinstall**. Only a
genuinely **native** change (a new native dependency, a new permission, an `app.json` plugin addition, or
touching `runtimeVersion`/`updates` itself) needs another full `eas build` — and per Task 2's own bundling
principle, whoever finds one next should check whether anything else pending can be bundled into that
same build too, rather than shipping native rebuilds one at a time.

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
| 2 | Bundle All Remaining Native-Config Changes + Finish OTA Update Support | Done — action needed | **Founder** (build + real device/OTA verification only) | `BUGS_APP_b2` (`eas build:version:get --platform android` returned current versionCode 1, so `<N> = 2`) | R1's audit found no other pending native-config gap (confirmed via `git log -p` on the EAS-config commit, `KNOWN_ISSUES_AND_BLOCKERS.md`, and a plugins-vs-dependencies cross-check). R2: `runtimeVersion.policy` set to `"fingerprint"` (was `"appVersion"`), `updates.checkAutomatically` set to `"ON_LOAD"`. Build/lint/typecheck all pass. Real build + on-device install + one real `eas update` OTA proof are founder-action-pending — see `reports/task2.md`. |

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

**Worktree correction (2026-09-25, resolved 2026-09-26)**: Task 1's hot-fixer session created a worktree
at `D:\Study Material\7AI-bugs-fe`, named by analogy to the branch suffix (`BUGS_FE`) — a reasonable
inference, but the wrong model; this track uses a **single shared worktree**,
`D:\Study Material\7AI-bugs`. The rename couldn't be completed (OS-level file lock — see the
checkout-location note above), so `7AI-bugs` was created fresh from `origin/main` instead, per the
protocol's own fallback. `7AI-bugs-fe` is dead and should be deleted by hand once the lock clears; do not
resume work from it.

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
