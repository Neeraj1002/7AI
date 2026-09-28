# UI/UX Task 3: UI-E2 Bug Fixes — Device Review Fixes + Switch On Enhancement 2

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting**, plus
`docs/execution/ui-ux/UI_UX_AGENT_PROTOCOL.md`, `tasks/task1.md` and `tasks/task2.md`. The template governs
the Git Workflow and the Hard rules (never push/merge to `main`, only commit to a branch you created, record
the branch in `STATUS.md` the moment it exists).

**Order — strict**: this task (bugs) is built, device-checked and merged **before** `tasks/task4.md`
(UIEnhancement-3) starts. Only break that order if a bug here is blocked on something outside the app —
then say so in `STATUS.md` and ask the founder first.

**Objective**: Fix what the founder's device review of UI Enhancement 2 found (2026-09-27), and switch on
every Enhancement 1/2 control whose backend has now merged — so the app matches the locked designs and the
current backend.
**Duration**: ~1–1.5 dev days
**Depends On**: nothing open. Everything needed is on `origin/main` as of 2026-09-28 (commit `59c13de`):
PR #28 (UI Enhancement 2), PRs #33/#36/#37 (bug fixes), and backend items B1, B2, B3, B5, B6, B7, B9,
B10 (`channels.update` with all fields, `channels.archive`, `runs.gate2` privacy, `runs.create`
`targetDurationSec`, `options.list`, watermark routes).
**Owning Component**: `app/` only. No `studio/` changes.
**Role**: `FE` — JS-only, OTA-eligible. The fingerprint must still match `main`.
**Branch**: `UI-e2-bug` (founder-named, 2026-09-28 — replaces the `UIUX_ENH<N>_FE` pattern for this
task; record it in `STATUS.md`). Cut it from a **fresh** `origin/main`: `git fetch origin && git checkout
-B UI-e2-bug origin/main`. The `D:\Study Material\7AI-UI` worktree is still on the old
`UIUX_ENH2_FE` checkout and a local `main` that is missing PR #37 — don't build on either.
One commit per item (`UI-e2-bug_R<N>: ...`), a closing commit for report + `STATUS.md`
(`UI-e2-bug_REPORT: ...`), one draft PR opened with the first push.
**Success Criteria**: no truncated text on a cold start; Dashboard and Inbox match the locked canvas;
every Channel settings control saves for real and reloads with the saved value; no feature flag is left
off except `watermarkUpload`.

---

## Design source of truth
Canvas **"7AI Studio — Visual Directions"** (locked): row 2 (Enhancement 1) and row 3 (Enhancement 2 —
"Channel settings (ENH2 · E3)" now carries the **final** Approvals copy, updated 2026-09-28).

---

## Items

### R1 — Intermittent text truncation on cold start
Seen on the OnePlus: Sign in "Serve", "Chang", "1 · Get a", "2 · Enter", "Send my to…"; tab bar
"Inb…", "Dashboa…". Other launches render fine.
Cause (confirmed by reading `app/app/_layout.tsx`): `useFonts(...)` is called but its result is ignored
("Not blocking: until Archivo resolves, text renders in the system font"). Text is measured in the system
font, then drawn in wider Archivo, so single-line labels get clipped.
**Fix**: `const [fontsLoaded, fontError] = useFonts({...}); if (!fontsLoaded && !fontError) return null;`
before rendering the providers (no new package, no `app.json` plugin — the fingerprint must not change).
Also remove `numberOfLines={1}` from the tab labels (`(tabs)/_layout.tsx`), the Sign in segmented tabs and
the three button labels in `components/Buttons.tsx`; keep it only on the Sign in server URL value.
**Verify**: kill and cold-start the app 5 times on the phone; no label is cut off anywhere.

### R2 — Dashboard "Script review scores"
Today: a `react-native-gifted-charts` `BarChart` with a 0–1.1 y-axis and one bar labelled "8".
Locked design: a plain row of bars, **no axis**. Buckets `≤5, 6, 7, 8, 9, 10`; count above each bar
(11/700 muted), score below (12/600 muted); bar 28px wide, radius 6/6/2/2, height `count × 24px`
(3px when 0, scale down proportionally if the tallest would pass 104px); bars for 7 and up `#C8261F`,
below 7 `#F6C3C0`. Build it with plain `View`s and drop the `BarChart` import (keep `LineChart` if it's
still used elsewhere on the screen).

### R3 — Dashboard "Gate 1 decisions"
Header gets "{n} total" right-aligned (12, muted). The bar is 12px, radius 6, split approved `#C8261F` /
edited `#F2A19D` / rejected `#0F0F0F` with 2px gaps (widths proportional). Legend row below with 10×10
radius-3 swatches: "Approved n", "Edited n", "Rejected n". With 0 decisions: no bar, "No decisions yet".

### R4 — Dashboard "Success rate" copy
Both tiles (lines ~99 and ~108) say "No runs yet" when there are runs but none finished. Use "No finished
runs yet" when there are 0 finished runs, and "No runs yet" only when the channel has no runs at all.

### R5 — Inbox cards
A Gate 1 notification shows the whole script and review notes. Clamp each body to 3 lines
(`numberOfLines={3}`). When the notification has a `threadKey` (it holds the run id — the screen already
uses it for `PendingGateActions`), the card opens Run detail for that run, with a trailing
"Open run →" (13/700 accent). Keep the inline gate actions. Unread styling unchanged.

### R6 — Tab bar active pill
Active tab background is a squarish rectangle. Locked design: 60×32 pill, radius 16, `#FDEBEA`, icon
centred; label 12px below.

### R7 — Small fixes
- Queue subtitle plural: "1 needs attention" / "2 need attention"; same rule for "waiting on you".
- Every `TextInput`: `selectionColor` and `cursorColor` = `color.accent` (`#C8261F`). Android's teal
  handle shows today on the Telegram chat-ID field.
- Channel detail header meta: "{n} runs · {n} published · ${x} spent" (the runs count is missing).

### R8 — Channel settings: fix saved-value reading, then switch it all on
The screen (`app/app/(app)/channel/[id].tsx`) reads fields the backend doesn't return. Checked against
`studio/src/types/channel.types.ts` and `api/routers/channels.ts` on `main`:
| Field | Screen reads today | Backend actually returns |
|---|---|---|
| Gate 1 / Gate 2 | `channel.gate1Enabled` / `gate2Enabled` | `channel.approvalGateConfig.gate1Enabled` / `.gate2Enabled` |
| Captions | `channel.captionsEnabled` | `channel.brandAssets.captionsEnabled` (missing = `true`) |
| Spend limit | `budgetOverrideUsd` as a number | a **string** (NUMERIC) or `null` — parse with `Number()` |
| Style guide | `''` when empty | `null` when empty — send `null` to clear, not `''` |
With the flags off none of this shows, which is why it slipped through; switching the flags on without
fixing it would show every switch as "on" and re-send unchanged values.
**Fix**: delete the `PendingFields` type and the `as PendingFields` cast; type everything from
`inferRouterOutputs<AppRouter>['channels']['list'][number]` and
`inferRouterInputs<AppRouter>['channels']['update']`. Read from the real paths above; the "changed fields
only" comparison must compare like with like (number vs parsed number, `null` vs `null`).
**Gate 2 rule (B7 as built)**: the server rejects `gate2Enabled: false` unless the channel's default
visibility is `private`, and rejects moving visibility away from `private` while Gate 2 is off. In the UI:
- visibility not Private → Gate 2 switch disabled (40% opacity), caption "Set default visibility to
  Private to turn this off."
- Gate 2 off → Unlisted/Public segments disabled, caption under the control "Turn Gate 2 back on to
  change this."
- If the server still returns `BAD_REQUEST`, show its message under the Save bar and keep the edits.
**Approvals copy (final, from the merged B7 task)**:
- Gate 1 caption: "Off: scripts that pass review (7+/10) go straight to video. A script that still fails
  after 3 retries waits for you."
- Gate 2 caption (when allowed): "Off: videos that pass review publish automatically as Private."
**Then flip, one commit each** (`UI-e2-bug_R8<x>: <flag> on`): `gate2Visibility`, `channelEdit`,
`channelDelete`, `channelSettings`, `gateToggles`, `briefLength`. In the same commits remove the
leftover loose typing — e.g. `run/[id].tsx`'s `as typeof input` around `privacyStatus` and the
`(channel as { defaultPrivacyStatus?: Privacy })` cast (both fields are real now).
`watermarkUpload` stays **off** — it needs `expo-image-picker` (native build); it moves to
`tasks/task4.md`.
**Verify** (against the real dev server after a restart onto `main`):
1. Change name, niche, style guide, default voice → Onyx, captions off, spend limit $1.00, visibility
   Private, Gate 1 off, Gate 2 off. Save, kill the app, reopen: every value comes back as saved.
2. Try Public with Gate 2 off → blocked in the UI; no request sent.
3. Delete a throwaway channel → it disappears from Channels and the picker; its open runs show
   "Channel deleted".
4. New brief with Length 45s → the run's creation options show `targetDurationSec: 45`.
5. Gate 2 on a run: the visibility selector shows, pre-selected from the channel default; approving as
   Unlisted uploads Unlisted.

### R9 — Channel picker copy for unconnected channels
Since PR #36 a run can't start on a channel without YouTube. The picker still says "Not connected —
can't publish yet". Change to "Not connected — connect to run". Selecting it stays allowed (New brief
then shows its connect hint and disables Create run).

---

## Schema Impact
None.

## Business Logic / State Transition
None in the app. Known backend limitation to mention in the report, **not** to fix here: an
auto-approved Gate 2 (Gate 2 off) sets the run to `publishing`, but the live pipeline loop doesn't drive
`publishing` until the next server restart (inherited gap, tracked in `KNOWN_ISSUES_AND_BLOCKERS.md`).
Tell the founder in the report so a Gate-2-off test isn't misread as an app bug.

## Shipping
JS-only → `eas update --branch preview` once the fingerprint matches `main`.

## Testing
```bash
cd app && npm run typecheck && npm run lint
npx expo-updates fingerprint:generate --platform android   # must equal main's
```
Plus every item's Verify on the founder's OnePlus, with before/after screenshots in the report.

## Report
`docs/execution/ui-ux/reports/task3.md` — per item: done / deviations / screenshot; which flags are on
at merge time (expected: all but `watermarkUpload`); fingerprint result. In `STATUS.md`, under this
task's row, add a section headed **"Device review fixes"** listing R1–R9 with their result.

## Links & References
- `docs/execution/ui-ux/tasks/task2.md` (Enhancement 2 spec) and `reports/task2.md`
- `docs/execution/bugs/reports/task8.md`, `task9.md` (PRs #33, #36, #37 — the app changes this task
  builds on)
- `docs/execution/sprint3/tasks/task9.md` / `reports/task9.md` (backend B5/B6/B7/B9/B10 as built)
- Next: `docs/execution/ui-ux/tasks/task4.md` (UIEnhancement-3) — starts only after this merges
