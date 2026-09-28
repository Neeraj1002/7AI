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

**Folder status**: 6 items logged. Tasks 1–2 merged. Tasks 3 + 5 built on `UI-e2-bug` (draft PR #41).
Tasks 6 + 4 (E1, E5–E7; E8 deferred) built on `UIEnhancement-3` (draft PR #43). All four await founder
device verification and screenshots before any can be marked "Done". New Definition of Done (task 5): no
UI task is "Done" without a phone screenshot beside each locked board it implements; built-but-flagged
code is reported "Built — hidden (flag X off)".
**Last updated**: 2026-09-28 (tasks 6 and 4 built in draft PR #43; E8 watermark deferred, needs a native build).

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
| 2 | UI Enhancement 2 — Channel Settings + New Brief Options | Sprint 4 | Merged (PR #28) — device review fixes and flag flips moved to task 3 | — | `UIUX_ENH2_FE` (PR #28, merged) (created from `origin/main` 2026-09-27) | Spec: `tasks/task2.md`; report: `reports/task2.md`. Needs device verification. Fingerprint matches main. FE-only; flag-gated on backend B5–B7, B10. |
| 3 | UI-E2 Bug Fixes — device review fixes (R1–R7; R8–R9 moved to task 5) (cold-start truncation, Dashboard charts/copy, Inbox cards, tab pill, cursor colour, picker copy) + fix Channel settings' saved-value reading and switch on `gate2Visibility`, `channelEdit`, `channelDelete`, `channelSettings`, `gateToggles`, `briefLength` | Sprint 4 | Built — awaiting founder device verification (no screenshots) | **Founder** | `UI-e2-bug` (created from `origin/main` 2026-09-28, commit `a667425`; draft PR #41) | Spec: `tasks/task3.md`; report: `reports/task3.md`. FE-only / OTA, fingerprint unchanged. All backend items it needs are on `main`. `watermarkUpload` stays off (native) → task 4. Not "Done" per the new DoD until the founder's OnePlus screenshots land in the report. |
| 4 | UIEnhancement-3 (E1, E5–E8; E2–E4 moved to task 6) — direction-C designs for the flows the bug-fix PRs added (Retry/Cancel, Decision sent, Published, unconnected channel on New brief, Can't reach the server), Queue "In progress" section, pickers from `options.list`, watermark upload | Sprint 4 | Built — E1, E5–E7 done; E8 (watermark) not built, needs a native `eas build` | **Founder** | `UIEnhancement-3` (with task 6; draft PR #43) | Spec: `tasks/task4.md`; report: `reports/task6.md` (second half). E1 uses `runs.list`'s own `currentStage` rather than a per-row `runs.progress` poll. Not "Done" per the DoD — no device screenshots this session. E8 left out entirely (not flagged, not shipped) per the task's own "leave it out if no build can happen now". |
| 5 | Pending from UI-E2 — switch on Length, full Channel settings, Delete channel, Gate 2 visibility (fix Channel settings' saved-value reading first) + Run detail long-text clamp | Sprint 4 | Built — awaiting founder device verification (no screenshots) | **Founder** | `UI-e2-bug` (same branch + PR #41 as task 3) | Spec: `tasks/task5.md`; report: `reports/task3.md` ("Task 5" section). **Supersedes task 3 R8–R9.** All 6 flags flipped on, one commit each; `watermarkUpload` stays off. Not "Done" per the new DoD until screenshots land. |
| 6 | Run lifecycle — Retry/Cancel (needs attention), Decision sent, the three after-Gate-2 outcomes (approved → publishing → published, revise → new version, rejected), Run again, Cancel while running | Sprint 4 | Built — awaiting founder device verification (no screenshots) | **Founder** | `UIEnhancement-3` (created from `origin/main` 2026-09-28, commit `be686c1`; draft PR #43) | Spec: `tasks/task6.md`; report: `reports/task6.md`. No flags — B11–B14 + `runs.progress` were already merged (PR #42) when this task started. **Supersedes task 4 E2–E4.** Not "Done" per the DoD until the founder's OnePlus screenshots land in the report. |

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
Task docs: `docs/execution/ui-ux/tasks/task1.md` … `task6.md`.
Reports: `docs/execution/ui-ux/reports/task1.md`, `task2.md`, `task3.md` (covers tasks 3+5), `task6.md`
(covers tasks 6+4).
Protocol: `docs/execution/ui-ux/UI_UX_AGENT_PROTOCOL.md`.

## Communication shorthand used in these docs
**7fe** = `D:\Study Material\7AI-frontend` — same shorthand the bugs track uses, see its own `STATUS.md`
for the full note.
