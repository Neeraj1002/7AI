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

**Folder status**: 2 items logged — UI Enhancement 1 (task 1) merged, awaiting founder device verification; UI Enhancement 2 (task 2) code complete in draft PR #28.
**Last updated**: 2026-09-27 (task 2 implemented).

**Checkout location**: this track works from its own dedicated worktree, **`D:\Study Material\7AI-UI`**,
created fresh from `origin/main` — separate from `D:\Study Material\7AI-frontend` (**"7fe"**, the
frontend track's own checkout), so this track's chat and the frontend track's own work never collide by
editing the same working directory at once. Same reasoning that gave `bugs` its own worktree
(`D:\Study Material\7AI-bugs`) — see that track's `STATUS.md` for the full history. 7fe is still the
real "what's actually built and tested" reference — pull `7AI-UI` to current before trusting it, and
cross-check 7fe directly if anything looks stale. **Update 2026-09-26**: the founder confirmed
`D:\Study Material\7AI-frontend` no longer exists — `7AI-UI` (pulled from `origin/main`) is the only
reference this track reads from.

| Task | Name | Sprint | Status | Owner | Branch | Notes |
|---|---|---|---|---|---|---|
| 1 | UI Enhancement 1 — Visual Foundation + Core Screen Redesign (direction C "Bold red"; theme, bottom tabs, Queue, Run detail Gate 1/2, New brief + channel picker, Dashboard, Channels + Channel detail + delete, Sign in, keyboard handling) | Sprint 4 | Merged — founder device verification pending | **Founder** | `UIUX_ENH1_FE` (created from `origin/main` 2026-09-26) | Report: `reports/task1.md`. Code complete; founder must verify on the OnePlus (no screenshots yet). Fingerprint identical to main → OTA-eligible. Full spec: `tasks/task1.md`. Design locked by founder 2026-09-26 on the "7AI Studio — Visual Directions" canvas. FE-only / OTA-eligible unless the fingerprint check in the task's Shipping section says otherwise. 3 controls ship hidden behind `app/lib/feature-flags.ts` until backend items B1 (Gate 2 visibility), B2 (edit channel), B3 (soft-delete channel) land — handed to the architect chat 2026-09-26. E8 supersedes Bugs Task 3/R4's Android keyboard handling, which is a no-op on Android (`behavior: undefined`). |
| 2 | UI Enhancement 2 — Channel Settings + New Brief Options | Sprint 4 | Done — action needed | **Founder** | `UIUX_ENH2_FE` (PR #28, draft) (created from `origin/main` 2026-09-27) | Spec: `tasks/task2.md`; report: `reports/task2.md`. Needs device verification. Fingerprint matches main. FE-only; flag-gated on backend B5–B7, B10. |

## Naming and branch convention
**UI enhancements (added 2026-09-26, founder direction)**: one branch per UI enhancement, named
**`UIUX_ENH<N>_FE`** (or `UIUX_ENH<N>_APP` if it turns out to need a native rebuild), unless an
enhancement is too large for one branch — then split it and record every branch here. One commit per
`E#` item, one draft PR per enhancement. Single small findings still use the convention below.

See [UI_UX_AGENT_PROTOCOL.md](UI_UX_AGENT_PROTOCOL.md) for the full definitions:
- **`UIUX_FE`** — non-native JS/React-Native layout/logic fixes — OTA-eligible.
- **`UIUX_APP_b<N>`** — a fix that needs a native/`app.json`-level change — needs a fresh `eas build`.
  Check `docs/execution/bugs/STATUS.md` first for an already-queued `APP` branch to bundle into, rather
  than shipping a separate native rebuild for one small UI fix.

No `UIUX_BE` — backend changes are out of this track's scope; a finding that turns out to need one gets
handed back to the founder/BA chat instead of a task doc here.

## Full detail
Task docs: `docs/execution/ui-ux/tasks/task1.md`, `docs/execution/ui-ux/tasks/task2.md`.
Protocol: `docs/execution/ui-ux/UI_UX_AGENT_PROTOCOL.md`.

## Communication shorthand used in these docs
**7fe** = `D:\Study Material\7AI-frontend` — same shorthand the bugs track uses, see its own `STATUS.md`
for the full note.
