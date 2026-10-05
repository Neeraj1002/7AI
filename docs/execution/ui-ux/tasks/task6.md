# UI/UX Task 6: Run Lifecycle — Retry, Cancel, Run Again, and What Happens After Gate 2

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting**, plus
`UI_UX_AGENT_PROTOCOL.md` and `tasks/task1.md`–`task5.md`. Hard rules apply.

**Why (founder device check, 2026-09-28)**: "no UI for rerun or cancel run", and nothing tells you what
happened after you answer Gate 2. Today, on `main`:
- Retry / Cancel exist **only** for a run in Needs attention (PR #33). If they don't show on a Needs-attention
  run on the phone, the OTA hasn't landed — check that first (founder's OTA checklist).
- A running run **can't be cancelled** — `runs.cancel` refuses `running` (backend, B11 below).
- There is **no "run again"** for a rejected, cancelled or failed run (B12 below).
- After Gate 2 the app only shows a generic "Decision sent" card, then whatever status comes next — no
  screen for Approved-and-uploading, Sent-back-for-changes, or Rejected.

> **UPDATE 2026-09-28 — backend is done. Build everything in this task switched ON.**
> Backend Sprint 3 Task 11 (branch `UIENHANCEMENT3_BE`, **PR #42**, ready for review, live-verified) delivers
> B11–B14 and the optional progress query. **Start this task only once PR #42 is merged into `main`**
> (check `git log origin/main` for `UIENHANCEMENT3_TASK11_BE_R*` commits); then cut `UIEnhancement-3` from
> that `main`. If #42 isn't merged yet when you start, stop and tell the founder — don't build against the
> unmerged branch.
> What's now available, use the real `AppRouter` types (no loose/`any` client, no casts):
> | Item | API on `main` after #42 | Use in |
> |---|---|---|
> | B14 publish on approval | Gate 2 approval (manual, and automatic when Gate 2 is off) now publishes on the live server — no restart. Publishing that stalls > 10 min moves the run to `needs_attention`. | E3 "Approved → publishing" is now a real state that ends in Published |
> | B13 gate decision + end reason | `runs.get` → `lastGateDecision: { gate: 1\|2, outcome: 'approve'\|'edit'\|'reject'\|'revise', privacyStatus?, reason?, notes?, decidedAt } \| null` and `endReason: 'rejected'\|'cancelled'\|'failed'\|'channel_deleted' \| null` | E2, E3 — read these **instead of** parsing stage rows; drop the stage-row fallback entirely |
> | B11 cancel while running | `runs.cancel({ runId })` now also accepts `running` (and `pending`); returns `{ cancelled: true }` immediately, the run reaches `failed` / `'Cancelled by user'` at the next step boundary | E5 |
> | B12 run again | `runs.rerun({ runId })` → the new run (same channel, brief, options; same archived / not-connected checks as `runs.create`). `runs.get` also returns `creationOptions: { voice?, visualSource?, audioLayer?, targetDurationSec? } \| null` | E4 |
> | R5 progress | `runs.progress({ runId })` → `{ stage, attemptNo, pct? }` | progress bars in E3 (publishing / new version) and task 4 E1 (Queue "In progress") — poll this every 5 s instead of the whole `runs.get` |
> Confirmed backend behaviour to design around: after Gate 2 **reject** the run is `failed` with
> `currentStage: 'gate2'` and `endReason: 'rejected'`; after **revise** it's `running` + `video_generation`
> while under the regen cap, otherwise `needs_attention`.
> Two backend caveats the UI must handle: (1) a cancel request is held in memory — if the server restarts
> before the next step boundary the run just continues. After tapping Cancel, show "Cancelling…" on the
> button and keep polling; if the run is still `running` after 60 s, show "Couldn't cancel yet — try
> again" and re-enable the button. (2) `endReason` is derived from the error text server-side; if it's
> `null` on a `failed` run, fall back to the "This run stopped" copy with the humanised `lastError`.
> **Consequently: E6's three flags (`runAgain`, `cancelRunning`, `gateOutcomeFields`) are not needed —
> don't add them.** Everything in E1–E5 ships visible. The Definition of Done (task 5) applies: phone
> screenshot beside each locked board (locked canvas row 4) in `reports/task6.md`.

**This task supersedes `tasks/task4.md` E2, E3 and E4** (needs attention, decision sent, published) — they
are all run-lifecycle states and belong on one screen design. Task 4 keeps E1 and E5–E8.

**Order — strict**: tasks 3 + 5 merged → **this task** → task 4. The new Definition of Done in task 5 applies.
**Duration**: ~2 dev days
**Owning Component**: `app/` only.
**Role**: `FE` — JS-only, OTA-eligible.
**Branch**: `UIEnhancement-3` (founder-named), cut from fresh `origin/main` after tasks 3 + 5 merge. This
task's commits go first (`UIEnhancement-3_T6_E<N>: ...`); task 4's follow on the same branch and PR.

## Design source of truth
Locked canvas **"7AI Studio — Visual Directions", row 4 "Run lifecycle"** (approved by the founder
2026-09-28): Gate 1 real-length text, needs attention, decision sent, approved → publishing, published,
revise → new version, and ended → run again. The chips on those boards saying "needs backend B11/B12" are
obsolete — the backend is done.

## Items

### E1 — Needs attention (Retry / Cancel) — was task 4 E2
As specified in `tasks/task4.md` E2 (warn chip; "What went wrong" card with the raw error behind "Technical
details ▼"; bottom bar "Retry this step" primary + "Cancel run" danger outline; Cancel confirms).

### E2 — Decision sent — was task 4 E3
As in task 4 E3, and the dark card's summary names the decision: "Approved · upload as {visibility}",
"Approved script", "Script edited and approved", "Sent back with notes", "Rejected".

### E3 — After Gate 2: the three outcomes
Detect the outcome from `runs.get`'s `lastGateDecision` and `endReason` (B13, on `main`) plus the run's
`status`/`currentStage` — see the update box at the top.
- **Approved** → board "Approved → publishing": chip "Publishing", stepper at Publish, dark card
  "Uploading to YouTube" + "You approved this video as {visibility} {time} ago…", a "Your Gate 2 decision"
  card, footnote about Needs attention. When `publishing` output has `youtubeVideoId` → the "Published to
  YouTube" card (task 4 E4 design, moved here).
- **Revise** → board "Revise → new version": chip "Making a new version", stepper back at Video, dark card
  "Making the video again · attempt {n}", your notes quoted, "Regenerations used: n of 2". "Cancel run" button
  (E5).
- **Rejected** → board "Rejected / Cancelled / Failed": black chip "Rejected at Gate 2", card "You rejected
  this video" + your reason, "Nothing was published. Spent on this run: ${x}" (from `dashboard.cost` or the
  run's spend if available; omit if not).
The same ended layout covers **Cancelled** ("You cancelled this run") and **Failed** ("This run stopped" +
the humanised error).

### E4 — Run again (B12)
On every ended run (rejected, cancelled, failed): primary "Run again" → `runs.rerun({ runId })` → opens the
new run's detail; secondary "Edit brief & run again" → New brief pre-filled with the brief, channel and
options (voice, visuals, music, length) from `runs.get`'s `creationOptions`.

### E5 — Cancel while running (B11)
"Cancel run" (danger outline + `ConfirmSheet` "Cancel this run? The current step stops and nothing is
published.") on Run detail for runs that are `running` or `pending` (Run detail only — no swipe action in
the Queue). Handle the in-memory caveat from the update box ("Cancelling…", 60 s retry).

### E6 — Flags
**Dropped 2026-09-28** — the backend is merged, so nothing in this task is flagged.

## Verify (phone, screenshots beside each board)
Needs-attention run → Retry works, Cancel confirms and ends it (→ ended screen). Gate 2: approve as Private →
decision sent → publishing → published card with a working YouTube link. Revise with a note → new version
screen shows the note, returns to Gate 2. Reject with a reason → ended screen with the reason. Cancel a running run mid-video; Run again creates a new run with identical options.

## Shipping
JS-only → `eas update --branch preview`.

## Report
`reports/task6.md` — per item, screenshot beside its board, flag states.

## Backend dependencies
All delivered by backend Sprint 3 Task 11 (`UIENHANCEMENT3_BE`, PR #42): B11 cancel running, B12 `runs.rerun`,
B13 `lastGateDecision` / `endReason` / `creationOptions` on `runs.get`, B14 publish on approval, plus
`runs.progress`. Report: `docs/execution/sprint3/reports/task11.md`.
