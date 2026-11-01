# Sprint 6 Task 3 (app): story-test screens (PR A, NEXT 5)

**Date**: 2026-11-01
**Status**: PR A built and checked against the design canvas (rows 5 and 6). PR B has its own report, `task4-fe.md`.
**Branch / worktree / PR**: PR A `SPRINT6_TASK3_FE`, worktree `D:\Study Material\7AI-SPRINT6_TASK3_FE`, PR number: see PR. PR B `SPRINT6_TASK4_FE`: not yet created.
**Task doc**: this task's own doc was handed over in chat only and is not in the repo or the synced docs folder, so nothing was copied or committed (Hard rule 5). Revision used: r1, 2026-11-01.

## What exists (R0)

| # | Item | Where | Result |
|---|------|-------|--------|
| 1 | Contract docs | `docs/execution/sprint6/tasks/task3.md` "Contract (API and app)", `task4.md` C2, C3, C5, C6 (on `main`, newer than the copies in the old checkout) | yes. All field names used exist: readerTags, verdictLabel, promiseMatch.note, markLabel, mark, swipeAtPercent, swipeLine, notRunReason, run (in `readerPicks[]`), angleId |
| 2 | `runs.chooseAngle({ runId, angleId \| null })` | not on `main`. Exists on unmerged `SPRINT6_TASK3A_BE` (`studio/src/api/routers/runs.ts`): `angleId` is `string \| null`, errors BAD_REQUEST / CONFLICT / ownership as in the contract | differs: not on main |
| 3 | `paused_angle`, `not_run`, `runs.get` fields | contract C2/C3. Not on `main`; on the backend branch `SPRINT6_TASK3A_BE` | differs: not on main |
| 4 | Who owns status wording | the app. `lib/run-view.ts` `runChip` (run screen), `lib/run-labels.ts` `statusLabel`/`queueChip` (Queue), `lib/inbox.ts` (Inbox) | yes |
| 5 | Run screen on the NEXT 1 layout, Gate 1 Script tab, Script review card, action bar | `app/(app)/run/[id].tsx`, `components/Gate1ReviewCards.tsx`, `components/GateActionBar.tsx` | yes |
| 6 | Feature flags | `lib/feature-flags.ts`. `storyTestsCards` added here (false); `creativeDirection` not yet | yes / PR B |
| 7 | Content profile screen, "Save as v4" | `app/(app)/channel/[id]/profile.tsx` (`Save as v${nextVersion}`, l.189) | yes (PR B) |
| 8 | `getActiveProfile` states | `channel/[id].tsx` l.56 uses `useQuery(...getActiveProfile)`, `hasProfile = Boolean(data)` | yes (PR B) |
| 9 | Settings screen duplicates | `channel/[id].tsx` Style guide ~l.359, Default voice ~l.407, note ~l.400 | yes (PR B) |
| 10 | Components | `Card`, `StatusChip`, `PrimaryButton`/`SecondaryButton` (`Buttons.tsx`), `BottomActionBar`, `lib/theme.ts` tokens | yes |
| 11 | Tests and commands | App tests **are** in CI now (`app-check` job in `.github/workflows`): `cd studio && npx vitest run --root ../app`. `npm run typecheck`, `npm run lint`, `npm run build` | differs from the brief ("not in CI") |

### Contract check

1. Backend is not on `main`: no `paused_angle`, `runs.chooseAngle`, `runs.get.storyTests`. The app is built to the contract with hand-written types in `lib/story-tests.ts` (comment at the top of the file) and an untyped `chooseAngle` call.
2. Answer to the readerRuns question (architect, no change needed): the backend's `runs.get` already maps `readerRuns` to `readerPicks` and has no `chosenAt`, so the app's types follow the contract correctly.
3. Reader tag labels come from the server; the backend ask (R6) is "first try / second try" wording.
4. Follow-up PR: replace the hand-written types and the untyped `chooseAngle` call with the router types once the Task 3 backend is on `main`. **Architect: it can start as soon as that backend merges.**

## What was done (PR A, flag `storyTestsCards`, default false)

- R1 flag. R2 choose card with skeleton "making" state, select / clear / skip, bottom bar words. R3 not-run line. R4 the single `runs.chooseAngle` call (disabled while pending, app's own error words, selection kept). R5 done card (chosen, skipped, not run, toggle list with "You chose this"). R6 headings from `run`, mark chip from `mark`, text from `markLabel`. R7 script check card under the Script review card. R8 not-checked box and script-changed banner. R9 status wording in Inbox (with an "Angle" step row and "Choose an angle" button), Queue and the run chip.
- Pure logic is in `app/lib/story-tests.ts` and tested in `app/lib/story-tests.test.ts`.
- Queue and tab-badge queries ask for `paused_angle` only with the flag on, so a server that does not know the status is never sent it.

## Files

- Created: `app/lib/story-tests.ts`, `app/lib/story-tests.test.ts`, `app/components/AngleCards.tsx`, `app/components/ScriptCheckCard.tsx`
- Modified: `app/lib/feature-flags.ts`, `inbox.ts`, `run-labels.ts`, `run-view.ts`, `run-queries.ts`, `use-run-lists.ts`, `app/app/(app)/run/[id].tsx`, `(tabs)/index.tsx`, `(tabs)/_layout.tsx`

## R10: computation on server data

The only code touching server values beyond show/hide: `swipeStrip` clamps `swipeAtPercent` to 0..100 for placement; `chooseBar` and `angleTitle` look up an angle title by id; `matchLine` maps the server boolean `choseReaderPick` to a sentence. No score, tag, match or verdict is computed. Not verified: a screen-by-screen diff search beyond these.

## Commands and results

```
Fresh checkout of the PR head (code commit ed04fb5; later amends only change this report), packages junctioned from the base checkout:
cd studio && npx vitest run --root ../app -> 32 files, 220 tests passed
cd app && npx tsc --noEmit                   -> 1 error, the known one: ../studio/src/packaging/lettering.ts cannot find '@napi-rs/canvas'. Nothing else.
cd app && npx eslint .                       -> 0 errors, 2 warnings (existing, lib/gate2-packaging.ts)
cd app && npm run build (expo export web)    -> succeeded, "Exported: dist"
```

`npm run lint` (`expo lint`) fails in a folder whose path has a space, so ESLint was run directly; CI runs `npm run lint` in a path without one.

## Not done / not verified

- **No screenshots.** None of the board states was rendered: the flag is off and no server returns `storyTests`. Every state needs a stubbed-data pass before the flag is flipped.
- No component tests (the app's vitest has no React Native renderer); the logic is tested, the screens are not.
- Flag-on wording for the three status places is not unit-tested (the flag is a module constant); the flag-off case is.
- The skeleton cards do not pulse (the board pulses them).
- `runs.chooseAngle` was not called against any server.
- The design check below replaces the earlier "built from the task text only" note. It compares code to the canvas source; nothing was rendered.
- `Task doc updated to rN`: not applicable, see above.

## Sign-off

PR A is code-complete against the contract but not ready to turn the flag on.

## Design check against the canvas (2026-11-01)

Source read: canvas boards `S3AngleWaiting`, `S3AngleDone`, `S3ScriptCheck` and notes n5note/n6note, light theme only, read as source (not screenshots). Compared: layout, spacing, colours, type sizes, copy, icons, states.

| Card / state | Result |
|---|---|
| Angle, making (skeletons) | fixed: heading and line outside a card, four bordered skeleton cards with three bars each, run chip "Writing angles", bar "Angles are being made." with no button. Not matched: no pulse animation |
| Angle, waiting: heading | fixed: 18/800 heading and 13 sub-line outside any card |
| Angle, reader section | fixed: grey section "What a first-time reader did", mark text chip (green only for a clear winner), intro line, "First try"/"Second try" blocks with "Would click"/"Would skip" pills and quoted reasons |
| Angle, angle cards | fixed: ink border, 16/800 title, 14 promise, amber flag chip with flag icon, 11/800 tags, 48 px filled "Choose this angle" button; selected: green border, green "Selected" button with tick |
| Angle, skip | fixed: centred radio row with constant label "Write from the brief instead" and chevron, caption below |
| Angle, bottom bar | fixed: 13/700 hint (amber until a choice), red 54 px button, grey disabled button; skip hint "Chosen: write from the brief, no angle." |
| Angle, reader error / no clear winner | matches (mark chip white, no picks, every angle choosable) |
| Angle done: chosen, same / different | fixed: grey match box with tick or info icon; different line names the reader's top angle from `readerTopId` |
| Angle done: skipped / not run | matches (pill and line); footer moved outside the card |
| Angle done: show all angles | fixed: plain rows, tags with "You chose this" first (black pill); reader section and flags removed from the list as on the board |
| Script check: header and verdict | fixed: "Advice only" and verdict pills on one row, pass green, fail amber |
| Script check: fail reasons | fixed: intro line, "Why a stranger may swipe away", dot bullets in normal text colour |
| Script check: swipe point and strip | fixed: label "Where a stranger would first swipe away", quote box, strip with captions; strip hidden when a value is null |
| Script check: weakest, about, remembered, fold | fixed: quote box, "Why: " line, ruled block, fold labels as drawn |
| Script check: not checked | fixed: dashed grey box on white, "Not checked" pill, lead line, "Why:" line, server advisory note |
| Script check: script changed | fixed: banner with icon first inside the card, content below at 60% |
| Run chip while writing the script ("Writing the script") | decided by the architect, 2026-11-01: keep the app's "In progress"; no stage-specific chip text. Designer is updating the board |
| Fail intro line | decided by the architect, 2026-11-01: keep as fixed app copy; it must not claim more than the server's `advisoryNote`; no other app copy depends on the verdict |
| First-sentence answer | decided by the architect, 2026-11-01: "Yes" when `keeps` is true, "No" when false, then `why`. Built that way |
| Waiting subtitle | decided by the architect, 2026-11-01: no timing claim. Copy is "Getting the angles ready" |

Could not match: the skeleton pulse; the "Writing angles" chip (from the task text, kept: it is not the stage chip the ruling removed); font weights map to the app's Archivo 400/600/700/800.
