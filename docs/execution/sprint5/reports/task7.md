# Sprint 5 Task 7 report: app gaps from the first acceptance run (frontend)

**Branch**: `SPRINT5_TASK7_FE` (worktree `D:\Study Material\7AI-SPRINT5\task7`, off `origin/main` 6852fa5)
**PR**: [#106](https://github.com/Neeraj1002/7AI/pull/106) (draft). One PR carries all the work so far; further PRs only if review asks for a split.
**Written**: 2026-10-19

**Hard rules that applied (Git workflow, template)**
1. Never push or merge to `main`: all work is on `SPRINT5_TASK7_FE` and draft PR #106; merging is the founder's. Only this branch, created this session, was committed to; one worktree, no git command in another session's folder (rules 1, 2, 4).
2. Rule 5: the task doc r2 was copied from `D:Study MaterialAIdocsexecutionsprint5	asks	ask7.md` and committed on its own (`SPRINT5_TASK7_FE_DOC: update task doc r2`, f8ba038); it is identical to the source. I did not edit its content.
3. Rule 6: `origin/main` was merged into the branch (27ea8ec, no rebase; one conflict-like block: my own untracked copies of task6/7/8.md, removed first). App tests re-run after the merge. Docs in the PR diff: this report and the task doc only.
4. Rule 7: I wrote only this report. I did not edit `STATUS.md` (a row I had added before rule 7 existed was taken out of the branch in f8ba038). Branch, worktree and PR for the architect to record are at the top.

**Status in three separate statements**
- Code-complete: R1, R2, R3, R4, R5 (app side), R6 (picker; samples appear once the server generates them), R7, R9, R10, R11. R8 not coded (reason below). The app reads Task 8's real field names (PR #107 merged 2026-10-21) and calls `runs.updateSettings` through the router's own types.
- Merged: no. Deployed: no. App build number: none yet (no EAS build was made; the founder's phone has not seen any of this).
- Verified: app type-check clean, lint clean, 168 app tests pass (82 before this task), re-run after merging main, web bundle exports. **Nothing was run on a phone or emulator**, and no screen was looked at in a phone-size layout. Layout fixes below are reasoned from the code, not seen.

## R0. Read the code first

| # | Question | Result |
|---|---|---|
| 1 | How the Inbox loads runs; what lowered it (A1) | **Confirmed, cause found.** The Inbox builds its cards from `notifications.list`, which the server caps at 50 rows (`listNotificationsForUser(userId, limit = 50)`, Sprint 3 Task 3). Each run raises several notifications (Gate 1, Gate 2, reminders), so 50 rows is about 7 runs. It "showed more before" because until `9ac1407` (Sprint 4 FE N1L R3, 12 Oct, "one card per run") the screen listed rows, not runs. `runs.list` has no limit or cursor (it returns every run); the app already loaded it twice (active and ended) but only used it to decorate cards. No cache or filter was involved. |
| 2 | What `runs.get` returns for cost, attempts, script, approved script | **Partly wrong in the task.** Cost: `spentUsd` (total, 4 decimals) and `maxCostUsd` only; no estimate, no per-attempt or per-stage cost. Attempts: every stage row with `status` only (no outcome). Script: `chapters` and `scriptEditText` come from the *draft* (`script_generation`). **The approved text is already there**: the Gate 1 stage row's output holds `sanctionedScriptText` and `chapters` (state-machine.ts), so R3 did not need Task 8. Task 8 adds the explicit fields below. |
| 3 | Where the failure message is built; where the spend limit changes | Raw provider text is stored in the stage `error` and `run.lastError`; the app showed `humanizeRunError`, which cut at 60 characters (A6). Spend limit: `RaiseLimitSheet` on the Run screen calls `runs.retry({ maxCostUsd })`. It was reachable only from "Retry this step" when the run was at its limit, not from the failure text. |
| 4 | How the Edit sheet validates chapters | **Only on the server**: `runs.gate1` runs `parseChapterSheet` and rejects with "needs at least 3 chapters" (BAD_REQUEST). The app had no check, which is why the error came after Save. |

## A1 to A16 status

"Fixed" means fixed in code, unit-tested and merged with main's latest; none of it has been seen on a phone.

| # | Status | Waiting on Task 8 (field) or deferred (reason) |
|---|---|---|
| A1 Inbox stops at 7 or 8 | **Fixed** | none |
| A2 No cost on the Run screen | **Fixed** (cost card; per attempt and per stage) | reads `runs.get.cost`, `videoAttempts[]`, `stageSummaries[]` (Task 8 report). Needs #107 deployed to show anything beyond spent / limit |
| A3 Script tab shows the draft | **Fixed** | reads `runs.get.scripts { draft, approved, usedByVideo }`; says which one the video used |
| A4 Cannot change a setting on a failed run | **Built** (Edit settings sheet) | **Waiting on #107 being deployed (merged 2026-10-21)**: `runs.updateSettings`, `runs.get.settingsChanges`, stored per-run `privacyStatus` |
| A5 Attempt 1 shown as done; no notification | **Label fixed** | reads `stageSummaries[].outcome` / `videoAttempts[].outcome`; the two D2 pushes are emitted by the server |
| A6 Raw, cut-off failure text | **Fixed** | none |
| A7 Voice picker without samples | **Picker built** (sad and hopeful line per voice) | reads `options.list.voices[] { key, label, toneTags, defaultDirection, previews { sad, hopeful } }`; samples exist only once #107 is deployed and previews are generated |
| A8 Script editor on a phone | **Fixed**, true clipboard (`expo-clipboard`) | needs a new native build; on a phone still on an older build the button opens the share sheet instead |
| A9 Cannot share or download the video | **Deferred** | needs a signed share link for a Short (backend) or file and sharing modules (native build); sampled frames are not in `runs.get` |
| A10 Admin cost list and labels | **Fixed** (grouped by time window) | optional: stage and attempt on each usage event |
| A11 Carry-overs | **Checked**: Admin entry (no code cause; needs the phone's `admin.whoami`), "(default)" and bug chips already done; app tests now in CI | per-channel colour **deferred** (needs a new channel field and a design choice); R10.3 is backend (Task 8) |
| A12 Queue layout jumps | **Fixed** | none |
| A13 Failed list empty with a channel picked | **Not a bug under the rule; made visible** | backend confirmation: Task 8 R11.7 |
| A14 Brief cut off, long Script preview | **Fixed** | none |
| A15 Two history sections | **Fixed** | none |
| A16 Tag form and all-red bar | **Fixed** (tag form kept, shown only when useful) | none |

### Detail per item

| # | Status | Notes |
|---|---|---|
| A1 | **Fixed (code)** | Every run gets a card; 20 at a time, "Showing N of M runs", loads on scroll and by button. Unit-tested with 45 runs / 3 notifications. |
| A2 | **Fixed in code** | Cost card on the Run screen: spent so far or final cost, estimate, limit, retry allowance (`cost`). Step history: each video attempt shows its cost and expands to its stages (`videoAttempts[].stages[].costUsd`); stages outside the loop show their own cost (`stageSummaries[]`). A $0 stage that did not go through reads "failed, not charged". The Admin view still groups by time window. On the server, voice, pictures and render are one stage (`video_generation`), so they are one line, not three. |
| A3 | **Fixed (code)** | Script tab shows `scripts.approved` with its real word count and length, "This is the script the video was made from" when `usedByVideo` is `approved` (a warning when it is `draft`), and a collapsed "Original draft" when the text was edited (`approved.outcome` is `edit`). Without `scripts` (older server) it reads the Gate 1 stage output. |
| A4 | **Built against PR #107 (Task 8 R13); works end to end once #107 is deployed (merged 2026-10-21)** | "Edit settings" on the failure card, the needs-attention bar and the Gate 1 / Gate 2 screens. Lists voice, music, pictures, YouTube visibility and max spend. Voice, music and pictures are shown **unavailable with the server's own sentence** ("The video is already made, so the voice can't change here. Use Revise at Gate 2 to redo it.") once the video is made; topic, format and length are always unavailable with a reason. "Save and retry this step" sends one `runs.updateSettings({ ..., retry: true })` (validates first, saves nothing if refused, the server's message is shown as sent); a waiting run gets "Save settings". A run in legacy planner recovery is refused for `retry: true`, so the app saves without it and tells the user to tap "Retry this step". History: `runs.get.settingsChanges` (with who changed it) in Step history. The call is reached through a typed stub until #107 is merged; an old server gets "This server cannot change settings on a run yet." |
| A5 | **Fixed in the app (label); notification waits on the backend** | An attempt that failed Video Review reads "failed review" with the reviewer's reason, amber, never "done". Derived from the review row until `stage.outcome` arrives. D2 pushes must be emitted by the server; the app already opens the run from any push that carries a `runId` (`_layout.tsx`) and groups them into the run's Inbox card. |
| A6 | **Fixed (code)** | Failure card: plain sentence for a voice the model rejects, a provider usage limit (with the return date when given), our spend limit ("This video used $0.51 of its $0.50 limit" + "Raise the limit and retry" button), a failed review (with the reviewer's reason). Unknown errors: one short sentence, whole text under Technical details; never cut inside a bracket. |
| A7 | **Built; samples wait on Task 8 R10 Part B** | `VoiceSheet`: name, tone tags, play/pause beside each voice, one at a time, selected state, no provider ids; on run setup and channel settings. Today the catalog is the server's `options.list`, with no sample, so the buttons are disabled and the sheet says "Voice samples aren't available yet". |
| A8 | **Fixed (code)** | Full-screen editor, live chapter counter with the "needs at least 3" message before Save, `## Chapter title` hint, live word count and length against the target with a warning under 80%, server error shown as sent. **Copy** uses `expo-clipboard` (added to `app/package.json` and the lockfile). It is a native module, so it needs a new build; it is loaded on first use, and an older build falls back to the share sheet instead of crashing. **Cursor position** is not explicitly controlled; the full-screen layout removes the old remount, not seen on a device. |
| A9 | **Deferred** | Download/share of the preview needs either a signed share link for a Short (backend) or file-system and sharing modules (native build). The regenerations line already exists at Gate 2; the sampled frames the reviewer saw are not in `runs.get`. |
| A10 | **Fixed (code)** | Admin stage cards read "Gate 2 · attempt 1 of 2" (not "Gate2 Running, Attempt 1"). Usage events are grouped by the stage attempt whose time window holds them, with subtotals; the screen states whether the subtotals match the total. Events still carry no stage/attempt of their own; a field from the backend would replace the time-window rule. The "unknown / unknown" row reads "provider and model not recorded". |
| A11 | See R9 | |
| A12 | **Fixed (code)** | Cause: React Native's horizontal `ScrollView` defaults to `flexGrow: 1`; with a short list (Failed) the free height went to the two chip rows, which pushed the banner and "Recent runs" down. `ChipRow` does not grow. Banner is above the filters; list padding raised; chips fade at the right edge; the selected chip has a check. |
| A13 | **Not a bug under the rule; made visible** | A published run with failed attempts is Published, not Failed. The empty list now says "No failed runs in Not In Your Textbook. Show all channels." and a "Showing X only / Show all channels" line appears whenever a channel is picked. Backend confirmation is Task 8 R11.7. |
| A14 | **Fixed (code)** | Brief and Script: 5 lines, "Show more" directly under the text. The line count is measured on an invisible copy of the text; reading it from the clamped text gave "..." with no button. Script opens on the first lines of chapter 1. |
| A15 | **Fixed (code)** | "Details" removed. Step history holds everything: attempt rows carry outcome and reason, the video review and first-stats rows appear once they exist, and the run's last error and the stock-to-AI-stills switch are lines under the list. |
| A16 | **Fixed (code)** | Progress bar: green done, amber current, red only the step that failed, grey-dark when the user cancelled or rejected, grey pending. Step-history dots use amber for current. The tag form shows only on a failed run or a video at least 6 hours old, and is named "Tag why this video underperformed" / "Tag why this run failed". Kept, not removed (see question 2). |

## Per requirement

- **R1** `lib/inbox.ts` (`buildInboxCards` adds a card for every run, `pageEarlier`), `lib/use-run-lists.ts` (shared lists; a run that leaves the active list refetches the ended list so it moves across), `notifications.tsx`. Task 8 R12 should still add a cursor and total to `runs.list`; the app does not need it to be correct. Tests: 45 runs, pull to refresh (existing refetch), a run finishing (`someRunLeft`).
- **R2** `CostCard`, `lib/run-cost.ts`, attempt cost in `StepHistory` (expands to per-stage; a $0 failed call reads "failed, not charged"; 4 decimals only under one cent), `lib/admin-cost.ts`. Fixture test: three attempts add up to $0.5492.
- **R3** `lib/script-versions.ts`, `ScriptVersionsCard`. The long-video preview chapters also use the approved chapters.
- **R4** `lib/run-settings.ts` (rules mirroring `planSettingsChange`, call input without nulls, history lines, the two server refusals handled; tests), `EditSettingsSheet`, `NeedsAttentionCard` ("Change the voice" when the failure is a rejected voice). Visibility shown is the per-run value (`creationOptions.privacyStatus`), else the channel default. Not seen on a device; the voice sheet opens on top of the settings sheet (two stacked modals), unchecked on Android. The call is typed by the router (the stub is gone).
- **R5** `lib/attempt-outcome.ts`, `lib/failure-text.ts`, `NeedsAttentionCard`, `humanizeRunError`. Attempt pairing between a video attempt and its review uses the same attempt number; if a review is retried on its own, numbers can diverge and the `outcome` field from Task 8 R5 should be used.
- **R6** `lib/voice-catalog.ts`, `VoiceSheet`. Per-run override and channel default are kept as before (the "default" row in the sheet).
- **R7** `ScriptEditorModal`, `lib/script-editor.ts` (mirrors the server's `parseChapterSheet`; words per minute 155, as the server's `LONG_WORDS_PER_MINUTE`).
- **R8** deferred (A9).
- **R9** one line each:
  - Admin button missing (`ba8c7c8e`, END-02): no code cause found. The entry shows when `admin.whoami` says `platformAdmin` for the signed-in user (fixed for per-user scoping in #103, 18 Oct). Needs the phone's app version and an `admin.whoami` answer for that account; not checked here.
  - "(default)" suffix on tiles: already gone (B3 in Sprint 4; a resolved value shows the server's label as is). Nothing to do.
  - Per-channel colour setting: needs a new channel field (no colour in `schema.prisma`) and a design decision. Backend/schema, not this task. Deferred.
  - Tester-facing bug type and priority chips: already in the server-rendered report page (`studio/src/api/bug-report-page.ts`: type step, Blocks me / Annoying / Minor). Nothing to do in the app.
  - R10.3: "`script_review` has no budget check of its own" (KNOWN_ISSUES). Backend; not an app item. Left to Task 8.
  - R10.10: estimated duration at Gate 1: the Script tab and the new editor now show words and length against the target. Server-predicted length from the measured voice pace is Task 8 R7.
  - App tests in CI: new `app-check` job (type-check, lint, vitest). It passed on #106. It does not gate `deploy`; say if it should.
- **R10** see A12, A13. R10.6: rule applied = a run whose final state is failed and is not a cancel or a reject is under Failed; a published run with failed attempts is under Published. Unit-tested; not checked against seeded data.
- **R11** see A14 to A16.

## Questions for the architect

1. **R4**: resolved. The founder approved the table; Task 8 R13 (PR #107, merged 2026-10-21) implements the call. The local `UpdateClient` type is removed: the sheet calls `client.runs.updateSettings` with the router's own input type, and `lib/task8-contract.ts` fails the type-check if the server renames a field the app reads.
2. R11.3: I kept the "Why didn't it work?" form (renamed, shown only when useful). Remove it?
3. **Task 8 fields now mapped** (names from the Task 8 report, "App contract for Task 7"): `cost`, `videoAttempts[]`, `stageSummaries[]` (cost, attempt outcomes, stage outcomes), `scripts { draft, approved, usedByVideo }`, `options.list.voices[]`, `runs.updateSettings`, `settingsChanges`. All are read defensively, so an older server shows the old behaviour. **Contract fields not used yet**: `runs.listPage` / `notifications.listPage` with `nextCursor` and `total` (the Inbox pages on the phone from `runs.list`); `endReason` on `runs.list` rows (the Queue filter still reads `lastError`); `expectedLength` and `runs.expectedLength` (the editor uses its own 155 words-per-minute estimate, not the server's measured pace); `runs.estimateCost` `rangeUsd` and `retryAllowanceUsd` (New brief shows one estimate); `flaggedStills[]`, `preflightBlock`, `chapterWarning` (typed), publishing `coverFrameMessage`, video review `reasonCode`, `dashboard.comparison.longFormWatch`. **Differences from the stub I built first**: `cost` replaces `costBreakdown`; `scripts` replaces `approvedScript` / `originalDraft`; the outcome is a string on `stageSummaries` / `videoAttempts`, not an object on the stage row, with extra words `pending`, `skipped`, `rejected`, `revised`; a voice has `previews { sad, hopeful }` (two samples), not one `previewUrl`.

## What waits on Task 8

Nothing in the code. #107 is merged; everything above shows its full effect only once it is deployed: an older server sends none of `cost`, `videoAttempts`, `stageSummaries`, `scripts`, voice `previews` or `settingsChanges`, and the app then shows what it showed before. The D2 pushes are emitted by the server.

## Deviations

- The real clipboard needs a new native build (`expo-clipboard`); older builds get the share sheet.
- R8 not coded; R6 has no samples yet; R4 needs the backend call before it does anything.
- The CI job does not gate the server deploy.
- I changed three existing lint errors (two blob hooks, one eslint-disable with a reason in `channel-context.tsx`) and the eslint config (test files may import `vitest`), so lint could be a CI gate. No behaviour change intended in the hooks; they now keep the fetched blob keyed by its url instead of clearing state in an effect.

## Getting the app on a phone for the six screenshots

1. Install the build tool once and sign in: `npm install -g eas-cli`, then `eas login` (the Expo account that owns project `sevenai-studio`).
2. In `D:Study MaterialAI-SPRINT5	ask7app` run `eas build --profile preview --platform android` (an installable APK; `eas.json` already has this profile).
3. When it finishes, open the build link or QR code on the phone, download the APK and install it (allow installs from this source).
4. Open the app, sign in against the deployed server; for cost per attempt, real voice samples and a working Edit settings, PR #107 and the other Task 8 pieces must be deployed first, otherwise those three screens show only what the old server sends.
5. Take the six screenshots from the list below and drop them in `docs/execution/sprint5/reports/task7-screenshots/` (or send them to the architect); no Android emulator is needed.

## Screenshots

All **missing**: no phone or emulator was available, so none was taken. Wanted for review:

| Screenshot | Status |
|---|---|
| Inbox with more than 8 runs and "Showing N of M runs" | missing |
| Run screen cost card and a cost-per-attempt expansion | missing (needs #107 deployed) |
| Edit settings sheet | missing |
| Voice picker with play buttons | missing (no samples until Task 8 R10 Part B) |
| Queue under the Failed filter (banner stays put) | missing |
| Script tab with the approved script and "Original draft" | missing |

## Tests

`cd studio && npx vitest run --root ../app`: 25 files, 168 passed. `cd app && npx tsc --noEmit`: clean. `npx eslint .`: clean. `npx expo export --platform web`: bundles. Nothing skipped. Not run: any device or emulator, any live backend.

## One line for the founder

The Inbox now lists every run and the Queue no longer jumps; cost, the approved script, plain failure messages and the full-screen script editor are in the app code but not on your phone yet (needs a build), and "Edit settings" is built but needs one backend call (`runs.updateSettings`) that does not exist yet.
