# Sprint 5 Task 7 follow-up report: row 11 designs and chapter bounds from the server (frontend)

**Branch**: `SPRINT5_TASK7_FE_FOLLOWUP`
**Worktree**: `D:\Study Material\7AI-SPRINT5\task7b`
**PR**: [#113](https://github.com/Neeraj1002/7AI/pull/113) (draft)
**Task doc**: `docs/execution/sprint5/tasks/task7-followup.md`, r1, copied from the founder's folder and committed on its own (`SPRINT5_TASK7_FE_FOLLOWUP_DOC: add task doc r1`).
**Written**: 2026-10-24

**Blocker for the architect (R3):** `runs.get.chapterBounds` is **not on `main`**. PR #112 only added `creationOptions.intakeWarnings` (and the shared `long-form/chapter-bounds.ts`); no router returns the bounds. As the task says, I added no constant. R3 is built so that it works the moment the field is sent and degrades quietly until then (live chapter count with no limit; the server's own message after Save). It cannot be proved against a real server, and `lib/task8-contract.ts` cannot name the field yet without breaking `tsc`. The founder decided to mark the PR ready without it: the editor picks the field up with no app change once the server sends it. I need: the field added to `runs.get` (`{ min, max, minWordsPerChapter, exactCount }`, null for a Short), or a different name.

**Hard rules that applied**
1. Rules 1, 2, 4: nothing pushed to `main`; one branch created for this task; one worktree (`task7b`); no git command in another session's folder.
2. Rule 5: the task doc was copied from the source and committed alone, first. It is identical to the source.
3. Rule 6: `origin/main` was merged into the branch before `gh pr ready` (no conflicts); 184 tests, `tsc` and `eslint` re-run clean; docs in the PR diff are this report only (the task doc is already identical on main).
4. Rule 7: I wrote only this report. I did not touch `STATUS.md` or any other doc.
5. Rule 8 (names): branch and commits carry `_FE`; the report is `task7-followup.md` in `reports/`.

**Status in three separate statements**
- Code-complete: R1, R2, R4, R5 and the reading side of R3 (no limits are applied until the server sends `chapterBounds`). Not complete: R3 against a real server.
- Merged: no. Deployed: no. No app build exists with this.
- Verified: 184 app tests, `tsc`, `eslint` and `expo export --platform web` pass locally. **Nothing was run on a phone or emulator**, so no screenshots exist.

## R0. Read first

| # | Question | Result |
|---|---|---|
| 1 | The row 11 designs | I worked from the written spec of row 11 the founder gave in chat (six items); I did not open the canvas link. **Voice picker** (item 2) and **cost card** (item 3) are built as written. Item 1 (Edit settings buttons and banner) I built too because I was in the same file: "Save only" (secondary) and "Save and retry this step" (primary) on a stopped run, a red banner "Nothing was saved. {server message}". Items 4 (failure card with inline new-limit field), 5 (Script tab chips and folded draft) and 6 (Inbox footer, Queue "See all runs" footer) are **not in this task's R-list and not built**; they need their own task if wanted. |
| 2 | Where the chapter rule was mirrored | `lib/script-editor.ts`: **a limit** (`MIN_CHAPTERS = 3`, "at least 3 chapters" message), removed. `components/ScriptEditorModal.tsx`: **a limit** (hard-coded "needs at least 3"), now shows the server's range. `GateActionBar.tsx`: **a comment** only ("fewer than 3 chapters"), reworded. `run/[id].tsx` `chapters.length > 2`: no longer there since Task 7; `ScriptPreview.tsx` uses `chapters.length > 1`, **layout only**. |
| 3 | Backend fields on `main` | `creationOptions.intakeWarnings`: **present** (typed, set by `runs.create`/`runs.rerun`). `runs.get.chapterBounds`: **missing**, see the blocker above. |

## R1. Voice picker as a page inside Edit settings
`VoicePicker` is the voice list as a page (no modal): back link "‹ Edit settings", radio, name, tone tags, "▶ Sad" / "▶ Hopeful" buttons, bottom button "Use {voice}". The playing button turns black and reads "■ Sad 0:04"; only one plays at a time; a sample that fails reads "Sample unavailable" and the voice can still be chosen; a catalog that cannot load shows "Voices couldn't load. Try again". `EditSettingsSheet` now holds its draft in one reducer (`lib/edit-settings-state.ts`) and shows either the settings page or the voice page, so the unsaved choices (music, pictures, visibility, spend) survive going back and forth. `VoiceSheet` (used by New brief and channel settings) is now a thin bottom sheet around the same `VoicePicker`. **Left alone:** New brief and channel settings still open `VoiceSheet` as a sheet; nothing is stacked under it there, so the "no second modal" goal does not apply. The old static voice list fallback is gone: with no catalog the page shows the error and Try again, as the design says (the channel-default row stays available).
Not seen on a device.

## R2. Cost per attempt on the cost card
`CostCard` holds the breakdown: "Cost so far" (amber bar) or "Final cost" (green, red at the limit), "Estimate · Retries up to · Limit · n attempts", then "Show cost per attempt ▼". Expanded: each attempt with its outcome word and cost, its stages indented under it, an "Other steps" group (script, review, gates), "Not tied to a step" when the server reports an unattributed amount, and a warning line if the parts do not add up to the total. A call that failed and cost $0 is a grey italic "failed, not charged". Amounts under one cent keep four decimals. An older run with no cost data reads "Not recorded for this run". Step history no longer shows any cost (the `cost` field and the per-attempt expansion were removed); it keeps each attempt's outcome and reason. Data still comes from `costBreakdownOf` (`cost`, `videoAttempts[]`, `stageSummaries[]`). The "Try again on load failure" state in the design is not built: the card is part of the run screen, whose own load error already has Retry.
Not seen on a device.

## R3. Chapter bounds from the server
`lib/chapter-bounds.ts` reads `runs.get.chapterBounds { min, max, minWordsPerChapter, exactCount }` (null for a Short). `lib/script-editor.ts` now only parses the `## Chapter title` format and compares with the bounds it is given; there is no chapter-count or minimum-words number left in it (a test reads the source to keep it so). The Gate 1 editor shows the live count with the server's range ("3 to 20 chapters" or "exactly 4 chapters"), blocks Save below the minimum or above the maximum, warns about a chapter under `minWordsPerChapter` words, and still shows the server's message after Save as sent. Without bounds: the count is shown with no limit, nothing is blocked, and the server's message after Save is the only check. The word-count and length display from Task 7 is unchanged. See the sweep for the pace constant that remains.

## R4. Intake warnings
`IntakeWarnings` shows `run.creationOptions.intakeWarnings` as plain amber lines under the settings tiles on the run screen (blank and repeated lines dropped, never red, never blocking). Absent means nothing. The run screen is where a new run lands, so a warning is also seen right after creation; there is no separate screen for it in New brief.

## R5. Same-cause sweep
Searched `app/` for chapter counts, minimum words, words per minute, 3-chapter messages and other limits that look like the server's.

| Hit | State |
|---|---|
| `script-editor.ts` `MIN_CHAPTERS`, "at least 3 chapters" message | **Fixed here** (read from `chapterBounds`) |
| `ScriptEditorModal.tsx` "needs at least 3" | **Fixed here** |
| `GateActionBar.tsx` comment "fewer than 3 chapters" | **Fixed here** (comment) |
| `script-editor.ts` `WORDS_PER_MINUTE = 155` and `script-versions.ts` (length of the approved script) | **Needs a new task.** The server owns the pace (`LONG_WORDS_PER_MINUTE` and, per voice, the measured pace in `runs.get.expectedLength` and `runs.expectedLength({ runId, scriptText })`). The editor's live estimate and the Script tab length should read those. Left because it needs a debounced call while typing and changes two screens. |
| `script-editor.ts` `LENGTH_FLOOR = 0.8` | **Needs the same task**: the server's `expectedLength.floorSeconds` is the authority. |
| `run-view.ts` `scriptStats` (words / 2.5, a Short's pace) | **Left alone**: Shorts, display only; fold into the same task if wanted. |
| `long-brief.ts` `MIN_MINUTES = 2`, `MAX_MINUTES = 15` | **Needs a new task**: video length bounds are the server's (`formats/video-kind.ts`, 120 to 900 s); New brief should read them. |
| `brief-extras.ts` `MAX_SOURCES = 20`, `MAX_SOURCE_LENGTH = 500` | **Left alone**: input limits mirrored from `runs.create` (the file says so); the server refuses too. Candidate for the same task. |
| `channels.tsx` `MAX_CHANNELS = 7` | **Left alone, unverified**: I did not check whether the server enforces a channel cap; if it does, the app should read it. |
| `run-labels.ts` `TOPIC_MAX_CHARS`, dashboard `BAR_MAX_HEIGHT` | **Not server rules** (display). |

## Tests
`cd studio && npx vitest run --root ../app`: 28 files, 184 passed (voice page state across back and forth; sample button text including "Sample unavailable"; cost breakdown with a failed-not-charged row and a sub-cent amount; chapter bounds absent, exact count and a range; a chapter under the minimum words; intake warnings absent, one and several; a check that `script-editor.ts` holds no chapter constant). `npx tsc --noEmit`, `npx eslint .` and `npx expo export --platform web`: clean. Not run: any phone or emulator. There is no render test of the cost card or the voice page (the app has no React test renderer); their logic is in the tested helpers.

## Screenshots
All **missing** (no phone or emulator): Voice page, cost card expansion, Gate 1 edit sheet with a chapter-limit warning (needs `chapterBounds`), a run with an intake warning.

## One line for the founder
The voice page, cost card breakdown and intake warnings are in the code; the Gate 1 chapter limits will work as soon as the server sends `runs.get.chapterBounds`, which is not on `main` yet.
