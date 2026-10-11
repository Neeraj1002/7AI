# Sprint 4 Frontend Task 1: Sprint 4 Front End — Gate 2 Quality, Compare, Gate 1 Review, Formats, Content Profile

**Rewritten 2026-10-06** to cover every Sprint 4 screen (was: profile screen + format picker only, written
before Channel settings existed). Picked up by the UI/UX code agent from this folder.

**Read `docs/execution/templates/TASK_TEMPLATE.md`, `UI_UX_AGENT_PROTOCOL.md` and the Definition of Done in
`tasks/task5.md` before starting.** Hard rules apply (never push/merge to `main`, only commit to a branch you
created, record every branch in `STATUS.md` the moment it exists).

**Order — strict**: **Bugs Task 10** (`docs/execution/bugs/Sprint3/tasks/task10.md`, branch `BUGS_TASK10_CANCEL_PUSH`, PR #52: the
cancel-run fix and the push-notification fix) merges before any item here. The cancel fix was once reserved as
"UI/UX task 7"; that task no longer exists, because the fix needs backend and app changes together and moved to
the bugs track. Task 10's R5 adds `google-services.json` and changes the native fingerprint, so build these
items from a `main` that already contains it, and publish their OTA (`eas update --branch preview`) only after
the founder has installed the new APK. Within this task, build each item
**only after its backend task is merged on `main`** (check `docs/execution/sprint4/STATUS.md`), in the order
below, which follows Sprint 4's own build order. Never build against an unmerged backend branch and never
fake the data.
The old R21/R22/R27/R28 of this doc are now E4–E5 below.
**Objective**: show in the app what Sprint 4's backend adds — render quality at Gate 2, channel × format
comparison, the fuller Gate 1 review, content formats, and the per-channel content profile.
**Owning Component**: `app/` only. **Role**: `FE`, JS-only, OTA-eligible (fingerprint must match `main`).
**Branches**: one small branch + PR per item, cut from fresh `origin/main` when that item's backend has
merged: `SPRINT4_FE_E<N>` (e.g. `SPRINT4_FE_E1`). Commits `SPRINT4_FE_E<N>: ...`. Record each branch in
`docs/execution/sprint4/STATUS.md` (Frontend 1 row).
**Design source**: locked canvas "7AI Studio — Visual Directions", **row 6 "Sprint 4"**. Build only the
elements outlined in dashed blue with a "NEW · S4 …" tag; everything else on those boards already exists.

## Founder decisions (2026-10-06 — defaults below unless the founder changes them in STATUS)
- Default voice and style guide **move to the Content profile**. Once a channel has a profile, Channel
  settings hides those two fields and shows the note on board "Channel settings — Content profile entry".
- "Compare channels ›" is a link at the top of Dashboard.

## Items (build order)

### E1 — Gate 2 Quality checks · needs Sprint 4 **Task 8** (R7)
Board "Gate 2 — quality checks". New card under Video review, from `video_review` stage output
`qualityMetrics` (loudness LUFS, true peak, resolution + fps, longest single shot, captions present).
Row icon: green ✓ inside spec, **red ✕ hard failure** (outside −14 ±3 LUFS, wrong resolution/fps, no audio —
these already block the run server-side), **amber !** outside spec but not blocking. Thresholds: read them
from the stage output if the backend includes them; otherwise ask — don't hardcode a second copy of
`QUALITY_SPEC`. Card hidden when `qualityMetrics` is absent (older runs).

### E2 — Compare channels × formats · needs Sprint 4 **Task 7**
Board "Compare channels × formats". New route `app/app/(app)/compare.tsx` from `dashboard.comparison`;
entry link "Compare channels ›" at the top of Dashboard. One card per channel (avatar, views, avg/video,
videos), then a format table (format · videos · avg views); `formatKey: null` reads "Freeform". Channels
with no videos show "No published videos yet" — never hidden. Footnote: "Revenue appears once a channel
joins the YouTube Partner Program."
**Note:** Sprint 4 Task 7 says it builds `compare.tsx` itself. Build the screen here instead, from this
design, and tell the backend agent to ship the API only (see the backend prompt in chat).

### E3 — Gate 1 review cards + Sources on New brief · needs Sprint 4 **Task 2** (R5, R8)
Board "Gate 1 — repeat-topic, factual concerns…" and "New brief — format picker + sources".
- Gate 1, from `script_review` output: **Factual concerns** card (amber tint, count in title),
  **Style guide violations** card, **Sources you gave** card (from `creationOptions.sources`). Each card is
  hidden when its list is empty. Use the existing `ClampedText` (UI/UX task 5) (3 lines) on long items.
- New brief: optional **Sources** list — "+ Add a source link", each a removable row; sent as
  `sources: string[]` on `runs.create` only when non-empty. Validate as URLs before sending.

### E4 — Format picker on New brief · needs Sprint 4 **Task 6** (+ Task 1)
Boards "New brief — format picker + sources" and "Format picker sheet". Chips row above the brief: **Freeform
(default, selected)**, two recent/most-used formats, "More formats ▾" → sheet listing all 9 from
`channels.listFormats` (label + target seconds). Picking one: the brief placeholder becomes its
`briefTemplate` (never pre-filled text), the helper line shows its `scriptStructure`, Options shows
"Length: {n}s (from format)" and the Length control is disabled with that value. `formatKey` is sent
only when not Freeform. Verify: a Freeform submit sends **no** `formatKey` field.

### E5 — Content profile screen + Channel settings entry · needs Sprint 4 **Task 1 + Task 6**
Boards "Content profile — full screen" and "Channel settings — Content profile entry".
- Channel settings: new "Content profile ›" row (shows "v{n} · script, visuals, audio, packaging", or "Not
  set up — uses channel defaults") → `app/app/(app)/channel/[id]/profile.tsx`. When a profile exists, hide
  Default voice + Style guide on Channel settings and show the amber note instead.
- Profile screen: four sections (Script, Visuals, Audio, Packaging) with exactly the fields of
  `ChannelProfileDataSchema`, each labelled "leave blank to use the default" (made-for-kids: "defaults to
  No"); reuse the Voice/Music sheets from ENH2. Save bar "Save as v{n+1}" → `channels.createProfileVersion`;
  helper "Saving creates a new version; runs already started keep theirs." A Zod error shows inline under
  its field. Read-only grey **Platform limits** block (60 s max, AI-visuals synthetic flag, and the
  safety-negative line only when the resolved visual source is `ai-stills`). **Version history** list
  (v, date, creator or "system", newest first) from `channels.listProfileVersions`. Discard-changes confirm
  like Channel settings. Keyboard must not cover any field (`FormScreen`).

### E6 — Repeat-topic warning at Gate 1 · needs Sprint 4 **Task 5** + backend change B16
Amber banner at the top of Gate 1 (board "Gate 1 — …"): "Similar to a run from {n} days ago: “{brief}”.
Approve only if the angle is different." Tap → that run. **Blocked** until the backend stores the warning
where the app can read it (Task 5 only appends it to the Telegram message) — see B16 in chat.

## Not in this task (backend-only, no screen)
Sprint 4 Task 1 resolver, Task 3 visual prompts, Task 4 approver identity, Task 5 upload fields (edited in
E5's Packaging section), Task 8 R1–R6 rendering.

## Verify / Report
Per item: phone screenshot beside its board (Definition of Done), real API check where the item sends data
(E3 sources, E4 Freeform sends no `formatKey`, E5 new version created). Report: `docs/execution/sprint4/reports/frontend-task1.md`, one
section per item, added as each PR lands.
