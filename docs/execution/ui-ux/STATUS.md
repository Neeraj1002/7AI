# UI/UX Status: Design & Usability Findings

**Purpose**: not a sprint. This folder tracks UI/UX findings surfaced by reviewing real screenshots of
the app against its actual current code — as opposed to `sprint[N]/`, which tracks planned feature work,
and `bugs/`, which tracks founder-found functional breakage. A finding here is about how a screen looks,
flows, or feels, not whether it works at all (a screen that's functionally broken belongs in `bugs/`
instead — see that track's own `STATUS.md`).

**This track can be worked by a dedicated chat.** A separate chat attached to this Project, linked to
the same computer, acts as this track's own "UI/UX agent" — see
[UI_UX_AGENT_PROTOCOL.md](UI_UX_AGENT_PROTOCOL.md) for its scope, the `FE`/`APP` branch convention
(no `BE` — this track never touches `studio/`), and a ready-to-paste kickoff message.

**Folder status**: 0 items logged yet — this track was just set up (2026-09-26), spun out of `sprint4`'s
task numbering into its own folder before it started, the same way the `bugs` track got its own space
once founder-found issues stopped fitting cleanly into sprint numbering. Two related UI items are
already open in the **bugs** track, not here — `docs/execution/bugs/tasks/task3.md`'s R2 (bug-report
tool's broken submit/no feedback/browser-never-closes) and R4 (keyboard overlap on every screen) — the
UI/UX agent should read those before starting and build on R4 rather than re-scoping it here.
**Last updated**: 2026-09-26 (track created, no findings yet).

**Checkout location**: this track works from its own dedicated worktree, **`D:\Study Material\7AI-UI`**,
created fresh from `origin/main` — separate from `D:\Study Material\7AI-frontend` (**"7fe"**, the
frontend track's own checkout), so this track's chat and the frontend track's own work never collide by
editing the same working directory at once. Same reasoning that gave `bugs` its own worktree
(`D:\Study Material\7AI-bugs`) — see that track's `STATUS.md` for the full history. 7fe is still the
real "what's actually built and tested" reference — pull `7AI-UI` to current before trusting it, and
cross-check 7fe directly if anything looks stale.

| Task | Name | Sprint | Status | Owner | Branch | Notes |
|---|---|---|---|---|---|---|
| *(none yet)* | | | | | | |

## Naming and branch convention
See [UI_UX_AGENT_PROTOCOL.md](UI_UX_AGENT_PROTOCOL.md) for the full definitions:
- **`UIUX_FE`** — non-native JS/React-Native layout/logic fixes — OTA-eligible.
- **`UIUX_APP_b<N>`** — a fix that needs a native/`app.json`-level change — needs a fresh `eas build`.
  Check `docs/execution/bugs/STATUS.md` first for an already-queued `APP` branch to bundle into, rather
  than shipping a separate native rebuild for one small UI fix.

No `UIUX_BE` — backend changes are out of this track's scope; a finding that turns out to need one gets
handed back to the founder/BA chat instead of a task doc here.

## Full detail
Task docs: `docs/execution/ui-ux/tasks/` (none yet — created as findings come in).
Protocol: `docs/execution/ui-ux/UI_UX_AGENT_PROTOCOL.md`.

## Communication shorthand used in these docs
**7fe** = `D:\Study Material\7AI-frontend` — same shorthand the bugs track uses, see its own `STATUS.md`
for the full note.
