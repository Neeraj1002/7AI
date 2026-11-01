# Sprint 6 Task 4 (app): creative direction and settings (PR B, NEXT 6)

**Date**: 2026-11-01
**Status**: PR B built and checked against the design canvas (rows 5 and 6). PR A has its own report, `task3-fe.md`.
**Branch / worktree / PR**: PR B `SPRINT6_TASK4_FE`, worktree `D:\Study Material\7AI-SPRINT6_TASK4_FE`, PR number: see PR. PR A `SPRINT6_TASK3_FE`, worktree `D:\Study Material\7AI-SPRINT6_TASK3_FE`, PR 151.
**Task doc**: handed over in chat only; not in the repo or the synced docs folder, so nothing was copied (Hard rule 5). Revision used: r1, 2026-11-01.

## R0 items for PR B

| # | Item | Where | Result |
|---|------|-------|--------|
| 7 | Content profile screen, Formats card, "Save as v4" | `app/(app)/channel/[id]/profile.tsx`. `buildProfileData` (`lib/profile-form.ts`) rebuilds the data from the form; it has no field for `direction` or `storyTests`, so the old save dropped any such key | yes. Differs: see "Deviations" |
| 8 | `getActiveProfile` states | `channel/[id].tsx` `useQuery`: loading, success with null, success, error; subtitle from `profileEntrySummary(version, data, createdAt)` (version, format count, saved date) | yes |
| 9 | Settings duplicates | **Already removed on main** by `BUGS_CHANNEL_SETTINGS_DUPES` (e43d9f0, ce47e1d): no Style guide box, no Default voice row, no "edit them there" note. Voice and style guide are editable in the content profile (Script guide, Audio default voice) | differs from the brief: R21 first two bullets were done before this task |
| 10 | Components | `Card`, `PrimaryButton`/`SecondaryButton`, `BottomActionBar`, theme tokens, `TextInput` as used in `profile.tsx` | yes |
| 11 | Commands | tests in CI (`app-check`): `cd studio && npx vitest run --root ../app`; `npm run typecheck`; lint | yes |

Contract check (architect, no change needed): the backend maps `readerRuns` to `readerPicks` and has no `chosenAt` (Task 3 side); the types here follow the contract. Follow-up PR: replace the hand-written types (comment at the top of `lib/direction.ts`) and the untyped `directionPresets` call with the router types once the Task 4 backend is on `main`. **Architect: it can start as soon as that backend merges.**

Contract fields used (Task 4 C1 to C3): `channels.directionPresets` (`key`, `version`, `label`, `summary`, `parts[]`), `data.direction { preset, note }`, `createProfileVersion` result `warnings?: string[]`. None of them is on `main` yet, so the app uses hand-written types (`lib/direction.ts`) and an untyped call for `directionPresets`.

## What was done

- **R11 flag** `creativeDirection`, default false.
- **R12 to R18 card** (`components/DirectionCard.tsx`, logic in `lib/direction.ts`), under the Formats card. Tags: "Default, nothing saved", "Current", "Not saved yet". Radio rows at least 48 px, fold button at least 44 px, no fold for a preset without parts. Note: label, placeholder, 300 cap, counter amber from 270 and "· limit reached" at 300, dimmed and not editable while saving. The "A change affects new videos only…" line is in every state. Warnings box "Saved as v<n>, with a warning:" lists each warning as sent.
- **Save** is the existing button: "Save as v<n>" / "No changes to save" / "Saving…" with spinner / "Try again". The version number still comes from `nextVersion`. Under it the existing "Saving creates a new version; runs already started keep theirs." Direction is sent only when it changed.
- **R18** with the flag on, a save that fails for no particular field shows only "Couldn't save. Your choice is still here: try again." Field errors still mark their fields. Selection and note stay.
- **R19** "Nothing was changed" is not in the diff (grep below).
- **R21 to R22** (not flagged): section renamed "Look"; the Content profile entry moved to the top, above Identity, with four states (loading draws nothing; profile: "Content profile" + the version/formats/date subtitle; null: "Set up content profile" + "Not set up yet. Voice and style guide are set here."; error: red box "Couldn't load the content profile" + "Try again"); the second "Set up content profile" row inside the Look card is removed.
- **R23**: not triggered by anything I could see. The duplicates were already removed on main; I did not look at the founder's channels or builds, so if they still see duplicates the channel and build are needed.

## Files

- Created: `app/lib/direction.ts`, `app/lib/direction.test.ts`, `app/components/DirectionCard.tsx`
- Modified: `app/lib/feature-flags.ts`, `app/lib/profile-setup.ts`, `app/components/Buttons.tsx` (`loadingLabel`), `app/app/(app)/channel/[id]/profile.tsx`, `app/app/(app)/channel/[id].tsx`

## Deviations from the task text

1. **Unknown profile keys are now kept on save, with the flag off too.** The old save rebuilt the data from the form and so dropped any key the form has no field for (for example a saved `direction`, or `storyTests`). R16 says "change nothing else", so `withDirection` carries those keys over. With the flag off nothing changes on screen, but the payload now keeps keys it used to drop. Tell me if you want it limited to the flag-on path.
2. **Character counting** follows a plain string length (what a zod `max(300)` counts); the contract does not say, so this is an assumption.
3. **"What this changes"** is offered on the selected choice only.
4. R21 bullets one and two were already done on main (see R0 item 9).

## Commands and results

```
Fresh checkout of the PR head (code commit 76808e2 after rebase onto main; later amends only change this report), packages junctioned from the base checkout:
cd studio && npx vitest run --root ../app -> 33 files, 232 tests passed (rebased on main with #151 merged)
cd app && npx tsc --noEmit                   -> 1 error, the known one: ../studio/src/packaging/lettering.ts cannot find '@napi-rs/canvas'. Nothing else.
cd app && npx eslint .                       -> 0 errors, 2 warnings (existing, lib/gate2-packaging.ts)
cd app && npm run build (expo export web)    -> succeeded, "Exported: dist"
```

`npm run lint` (`expo lint`) fails in a folder whose path has a space, so ESLint was run directly; CI runs `npm run lint` in a path without one.

## Not done / not verified

- **No screenshots** of the card states or the four settings states; nothing was rendered, and the backend that supplies presets is not on main. Needs a stubbed-data pass before the flag is flipped.
- The screens have no component tests (no renderer in the app's vitest); logic is tested.
- `createProfileVersion` was not called against a server; the save payload is covered by a unit test only.
- The design check below replaces the earlier "built from the task text only" note. It compares code to the canvas source; nothing was rendered.
- The tests for the settings entry cover its state function, not the rendering.

## Sign-off

PR B is code-complete against the contract, behind a flag that stays false. Not ready to turn the flag on until the backend is live and the states have been seen on a screen.

## Design check against the canvas (2026-11-01)

Source read: canvas board `T4Direction` and note n6note, light theme only, read as source (not screenshots). Compared: layout, spacing, colours, type sizes, copy, icons, states.

| Card / state | Result |
|---|---|
| Card frame, title, current choice (top right) | fixed: 14/16 padding, gap 12, 15/800 title, 12 grey current label |
| Nothing saved (Neutral, "Default, nothing saved") | matches (grey tag beside the label) |
| One chosen / "Current" | fixed: green "Current" tag inline with the label |
| Different pick ("Not saved yet") | fixed: grey tag (was amber) |
| Choice rows | fixed: 14 px radius, 2 px ink border when selected, grey border otherwise, 22 px radio, 13 grey summary |
| "What this changes" fold | fixed: offered on every choice with parts, constant label with ▼/▲, several can be open, parts as ruled label/text pairs; none on Neutral |
| Note field | fixed: label "Your note · optional", 96 px field, hint line as drawn, counter on the right in bold, amber from 270, "· limit reached" at 300 |
| Long note | matches (cap at 300) |
| Always-on change line | fixed: grey rounded box |
| Saving | fixed: choices and note dimmed, field not editable; button "Saving…" with spinner |
| Save error | fixed: red alert inside the card with icon, "Try again" button; bar no longer repeats the line |
| Saved with a warning | fixed: amber box, title then each warning as sent, no bullets |
| Save button | fixed: red when active, grey with grey text when "No changes to save" |
| Settings entry: has a profile | matches: "Content profile" 15/800, subtitle "v<n> · <k> formats · saved <date>" 13 grey, chevron, 1.5 ink border, 14/16 padding, at the top above Identity |
| Settings entry: no profile | matches: "Set up content profile" with "Not set up yet. Voice and style guide are set here."; shown only after a successful empty fetch |
| Settings entry: loading | matches: nothing drawn in that spot (the board note says the same) |
| Settings entry: couldn't load | fixed: pink row with "Couldn't load the content profile." (full stop added) and a white 36 px "Try again" button on the right |
| Look section | matches: "Look" replaces "Voice & look"; no voice row, no Style guide box, no "edit them there" note |
| Rest of the screen (Identity, Publishing, Approvals, Budget, Delete, Save bar) | not changed by this PR; the board redraws them and the existing screen was not compared line by line |

Could not match: font weights map to the app's Archivo 400/600/700/800; the board's "Choose a direction to save" state cannot occur because Neutral is always a choice. Decided by the architect, 2026-11-01 (all four rulings are on the PR A card; none changes this card): run chip stays "In progress"; the fail-card intro line stays fixed app copy; "Yes"/"No" before the first-sentence `why`; no timing claims in waiting copy.
