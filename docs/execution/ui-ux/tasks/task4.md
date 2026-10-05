# UI/UX Task 4: UIEnhancement-3 — Design the Screens the Bug Fixes Added + Run Visibility

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting**, plus
`docs/execution/ui-ux/UI_UX_AGENT_PROTOCOL.md` and `tasks/task1.md`–`task3.md`. The template governs the
Git Workflow and the Hard rules (never push/merge to `main`, only commit to a branch you created, record
the branch in `STATUS.md` the moment it exists).

**Order — strict**: start only after **`tasks/task3.md` (UI-e2-bug) has merged** and the founder has
approved the "Under review" designs (see Design source below). Bugs first, then enhancement. Skip the
order only if the founder says so in writing in `STATUS.md`.

> **UPDATE 2026-09-28**: designs approved — build from the locked "Visual Directions" canvas **row 5**
> (Queue + In progress, New brief — channel not connected, Can't reach the server), not Future Screens.
> E2–E4 moved to `task6.md`. E1's progress bar polls the new `runs.progress({ runId })` → `{ stage,
> attemptNo, pct? }` (backend Sprint 3 Task 11, PR #42) instead of deriving it from the stepper; if `pct`
> is missing, fall back to stepper index ÷ 7. Order: after task 6, same `UIEnhancement-3` branch/PR.

**Objective**: The bug-fix PRs (#33, #36, #37) added real flows to the app — Retry/Cancel on a stuck run,
"Decision sent", "Published to YouTube", the unconnected-channel block on New brief, and a "Can't reach the
server" screen — with no design; they use generic cards and copy. Bring them into direction C, add the
missing "In progress" view so a running run is visible somewhere, move the pickers onto the backend's
options list, and (native, last) ship watermark upload.
**Duration**: ~2 dev days (+ one native build for E8)
**Depends On**: `tasks/task3.md` merged. Backend: nothing new — B6 (watermark routes) and B9
(`options.list`) are already on `main`.
**Owning Component**: `app/` only. No `studio/` changes.
**Role**: `FE` for E1–E7 (OTA-eligible). **`APP` for E8** (new native module → fingerprint changes → a
fresh `eas build`); build E8 last, as its own commit, so E1–E7 can still ship over the air if the build
has to wait.
**Branch**: `UIEnhancement-3` (founder-named, 2026-09-28), cut from a fresh `origin/main` after task 3
merges. One commit per item (`UIEnhancement-3_E<N>: ...`), closing commit for report + `STATUS.md`
(`UIEnhancement-3_REPORT: ...`), one draft PR with the first push.
**Success Criteria**: every screen/state below matches its board; a run is visible from the Queue at
every status (waiting, needs attention, in progress); no picker list is hardcoded where the backend
provides it.

---

## Design source of truth
Canvas **"7AI Studio — Future Screens"**, row **5 · UNDER REVIEW** (added 2026-09-28): boards "Queue +
In progress section (proposed)", "Run — needs attention (Retry / Cancel)", "Run — decision sent", "Run —
published to YouTube", "New brief — channel not connected", "Can't reach the server". **These are under
founder review.** Once approved they move to the locked "Visual Directions" canvas and that becomes the
source of truth; if the founder changes a board, build the changed version. Direction C tokens from
`app/lib/theme.ts`.

---

## Items

### E1 — Queue: "In progress" section (new)
Today `index.tsx` lists only `paused_gate1`, `paused_gate2` and `needs_attention`
(`QUEUE_STATUSES`), so a run that's `running` appears nowhere in the Queue after you create it.
Add a third section, **"In progress"**, below "Needs attention": runs with status `running` (and any
other non-terminal, non-paused status in `PIPELINE_RUN_STATUSES` — check the enum), newest first.
Row (board "Queue + In progress"): `surface2` background card, no border, radius 16; brief (14/700,
1 line); 6px progress bar = stepper index ÷ 7 (reuse `stepperIndexForStage`); meta "{stage label} ·
{channel}" (12 muted); relative time right. Tap → Run detail. Subtitle adds "· {n} in progress".
Keep the 15s poll. Empty state unchanged ("Nothing needs you right now") only when all three are empty.

### E2 — Run detail: needs attention
Board "Run — needs attention". Status chip "Needs attention" (warn colours); the stepper marks the failed
step with the warn ring. "What went wrong" card: 32px warn icon tile + title (16/800); body = the
humanised error + "(at {stage})" muted; the helper line "Retry runs this step again from scratch. Cancel
stops the run for good — nothing is published."; the raw `lastError` moves behind a **"Technical details
▼"** toggle (monospace 11px on `surface2`), collapsed by default. Bottom bar: primary "Retry this step"
(rotate icon) and a **danger-outline** "Cancel run" (today it's a neutral secondary). Cancel keeps its
existing `ConfirmSheet`.

### E3 — Run detail: decision sent
Board "Run — decision sent". Replace the plain "Decision sent" card with a dark card (`ink` background):
check-circle + a summary of what was sent — "Approved · upload as {visibility}" / "Approved script" /
"Sent back with notes" / "Rejected" — then "Decision sent. The pipeline is picking it up — this screen
updates on its own." and a 6px indeterminate bar. Under it, centred: "Still stuck after a few minutes?
**Answer again**" (keeps today's behaviour: re-shows the gate actions).

### E4 — Run detail: published
Board "Run — published to YouTube". Status chip "Published" (ok colours); card with a 2px `okText`
border: play icon tile + "Published to YouTube"; video title (15/600); chips for visibility and
"Uploaded {relative time}"; full-width dark button "Open on YouTube ↗"; footnote "Views and likes show up
on the Dashboard once the first poll runs."

### E5 — New brief: channel not connected
Board "New brief — channel not connected". The hint becomes part of the channel field: a warn strip
attached under the channel row (link icon, "Not connected to YouTube. Runs need a connected channel.",
dark **Connect** button → the same YouTube connect flow as Channel detail, returning to New brief).
Create run stays disabled, now visibly (grey fill) with the helper "Connect YouTube or pick another channel
to continue". The Options section is dimmed with "Available once connected".

### E6 — Can't reach the server
Board "Can't reach the server". Keep the logic in `app/app/server-down.tsx`. Restyle to match: 64px
accent-soft icon tile, 28/800 title, body copy unchanged, a bordered **Server** row showing the URL
(ellipsised), "Still unreachable. Try again in a minute." in danger colour after a failed retry, primary
"Try again", neutral "Sign out".

### E7 — Pickers from the backend's options list (B9)
`options.list` returns `voices` (`{key, label}`), `visualSources` and `moodTags`. Use it for the Voice
and Music sheets and the Visuals segments, with `app/lib/pipeline-options.ts` kept only as the offline
fallback while the query loads or fails (keep its `satisfies` type checks). Labels come from the server;
keep the app's own display labels only for visual sources ("AI images" for `ai-stills`) and "No music" for
`none`.

### E8 — Watermark upload (APP — native build)
Backend is ready: `POST /channels/:id/watermark` (multipart), `GET` (serves the image) and `DELETE`
(`studio/src/api/watermark-route.ts`); the channel's `brandAssets.watermarkUrl` is set when present.
Add `expo-image-picker` (→ `app.json` plugin with a photo-library permission string). Channel settings
"Watermark" row (locked board "Channel settings (ENH2 · E3)"): "Upload logo" dashed button; when set, a
40×40 thumbnail (fetched with the session's auth header) + "Replace" + "Remove". PNG only, show the
server's error message on rejection. Flip `watermarkUpload` in the same commit.
**This changes the fingerprint**: check `docs/execution/bugs/STATUS.md` for a queued native build to
bundle with, agree a build window with the founder, then `eas build` + install before the OTA of this
branch. If the build can't happen now, leave E8 out of the PR and say so in the report.

---

## Schema Impact
None.

## Business Logic / State Transition
None. E1 only widens the statuses the Queue already requests from `runs.list`.

## Shipping
E1–E7: `eas update --branch preview` (fingerprint = `main`). E8: new `eas build` first.

## Testing
```bash
cd app && npm run typecheck && npm run lint
npx expo-updates fingerprint:generate --platform android
```
Device checks on the OnePlus, screenshots in the report: a fresh run appears under "In progress" within
15s of creating it; a `needs_attention` run shows E2 and Retry works; approve at Gate 2 → E3 card → E4 card
after publish; pick an unconnected channel → E5; stop the server → E6, start it → Try again recovers;
Voice sheet lists the server's voices; (E8) upload, replace and remove a logo, and see it on the next
video.

## Report
`docs/execution/ui-ux/reports/task4.md` — per item: done / deviations / screenshot; fingerprint
result; whether E8 shipped.

## Links & References
- Future Screens canvas, row 5 (under review) → locked canvas once approved
- `docs/execution/ui-ux/tasks/task3.md` (must merge first)
- `docs/execution/bugs/reports/task8.md`, `task9.md` (where these flows came from)
- `studio/src/api/routers/options.ts`, `studio/src/api/watermark-route.ts`
