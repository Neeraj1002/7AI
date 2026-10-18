# Sprint 5 Task 7 report: app gaps from the first acceptance run (frontend)

**Branch**: `SPRINT5_TASK7_FE` (worktree `D:\Study Material\7AI-SPRINT5\task7`, off `origin/main` 6852fa5)
**PRs**: [#106](https://github.com/Neeraj1002/7AI/pull/106) (draft). One PR carries all the work so far; further PRs only if review asks for a split.
**Written**: 2026-10-19

**Status in three separate statements**
- Code-complete: R1, R2 (app side), R3, R5 (app side), R7, R9, R10, R11. R6 built on a stub catalog. R4 and R8 not coded (reasons below).
- Merged: no. Deployed: no. App build number: none yet (no EAS build was made; the founder's phone has not seen any of this).
- Verified: app type-check clean, lint clean, 141 app tests pass (82 before this task), web bundle exports. **Nothing was run on a phone or emulator**, and no screen was looked at in a phone-size layout. Layout fixes below are reasoned from the code, not seen.

## R0. Read the code first

| # | Question | Result |
|---|---|---|
| 1 | How the Inbox loads runs; what lowered it (A1) | **Confirmed, cause found.** The Inbox builds its cards from `notifications.list`, which the server caps at 50 rows (`listNotificationsForUser(userId, limit = 50)`, Sprint 3 Task 3). Each run raises several notifications (Gate 1, Gate 2, reminders), so 50 rows is about 7 runs. It "showed more before" because until `9ac1407` (Sprint 4 FE N1L R3, 12 Oct, "one card per run") the screen listed rows, not runs. `runs.list` has no limit or cursor (it returns every run); the app already loaded it twice (active and ended) but only used it to decorate cards. No cache or filter was involved. |
| 2 | What `runs.get` returns for cost, attempts, script, approved script | **Partly wrong in the task.** Cost: `spentUsd` (total, 4 decimals) and `maxCostUsd` only; no estimate, no per-attempt or per-stage cost. Attempts: every stage row with `status` only (no outcome). Script: `chapters` and `scriptEditText` come from the *draft* (`script_generation`). **The approved text is already there**: the Gate 1 stage row's output holds `sanctionedScriptText` and `chapters` (state-machine.ts), so R3 did not need Task 8. Task 8 adds the explicit fields below. |
| 3 | Where the failure message is built; where the spend limit changes | Raw provider text is stored in the stage `error` and `run.lastError`; the app showed `humanizeRunError`, which cut at 60 characters (A6). Spend limit: `RaiseLimitSheet` on the Run screen calls `runs.retry({ maxCostUsd })`. It was reachable only from "Retry this step" when the run was at its limit, not from the failure text. |
| 4 | How the Edit sheet validates chapters | **Only on the server**: `runs.gate1` runs `parseChapterSheet` and rejects with "needs at least 3 chapters" (BAD_REQUEST). The app had no check, which is why the error came after Save. |

## A1 to A16 status

| # | Status | Notes |
|---|---|---|
| A1 | **Fixed (code)** | Every run gets a card; 20 at a time, "Showing N of M runs", loads on scroll and by button. Unit-tested with 45 runs / 3 notifications. |
| A2 | **Partly fixed; rest waits on Task 8 R8.7** | Cost card on the Run screen (spent so far or final cost, estimate, limit) works now from `spentUsd` / `maxCostUsd`. Estimate, per-attempt and per-stage cost wait on `runs.get.costBreakdown` (see contract). The Admin view groups its events now (A10). |
| A3 | **Fixed (code)** | Script tab shows the approved text with its real word count and length, "This is the script the video was made from", and a collapsed "Original draft · not used". Read from the Gate 1 output today; `approvedScript` / `originalDraft` win when Task 8 R11.1 sends them. |
| A4 | **Waiting on the architect** | R4 not coded: the stage-by-setting table and the call I need are below. Max spend can already be changed on a stopped run (Retry + raise limit). |
| A5 | **Fixed in the app (label); notification waits on the backend** | An attempt that failed Video Review reads "failed review" with the reviewer's reason, amber, never "done". Derived from the review row until `stage.outcome` arrives. D2 pushes must be emitted by the server; the app already opens the run from any push that carries a `runId` (`_layout.tsx`) and groups them into the run's Inbox card. |
| A6 | **Fixed (code)** | Failure card: plain sentence for a voice the model rejects, a provider usage limit (with the return date when given), our spend limit ("This video used $0.51 of its $0.50 limit" + "Raise the limit and retry" button), a failed review (with the reviewer's reason). Unknown errors: one short sentence, whole text under Technical details; never cut inside a bracket. |
| A7 | **Built; samples wait on Task 8 R10 Part B** | `VoiceSheet`: name, tone tags, play/pause beside each voice, one at a time, selected state, no provider ids; on run setup and channel settings. Today the catalog is the server's `options.list`, with no sample, so the buttons are disabled and the sheet says "Voice samples aren't available yet". |
| A8 | **Fixed (code), one deviation** | Full-screen editor, live chapter counter with the "needs at least 3" message before Save, `## Chapter title` hint, live word count and length against the target with a warning under 80%, server error shown as sent. **Copy**: no clipboard module in the app, so on a phone the button opens the system share sheet (which has Copy) and is labelled "Copy / share"; on web it copies. A true clipboard needs `expo-clipboard` (native, new build): one-line change in `lib/copy-text.ts`. **Cursor position** is not explicitly controlled; the full-screen layout removes the old remount, but I have not seen it on a device. |
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
- **R4** not coded, see below.
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

1. **R4, please confirm before I code.** Proposed call: `runs.updateSettings({ runId, voice?, audioLayer?, visualSource?, privacyStatus?, maxCostUsd? })`, allowed when the run is `needs_attention`, `paused_gate1` or `paused_gate2`, which patches `creationOptions`, re-runs the Task 8 preflight (voice valid for its model, music track long enough, estimate vs limit, provider quota) and returns the same BAD_REQUEST messages as run creation; then the existing `runs.retry` reruns the failed step. It must write a step-history entry ("Voice changed from X to Y"). Table (D1):

   | Setting | Read by | Failed or waiting at... | Allowed? | What it invalidates |
   |---|---|---|---|---|
   | Voice | video_generation (narration, captions, timing) | script stages, Gate 1, video_generation | Yes | Nothing yet made |
   | Voice | | Gate 2 / after the video | Yes, as a revision | Narration, captions, render; images can be reused |
   | Music mood | video_generation render | before the render | Yes | Nothing |
   | Music mood | | Gate 2 / after render | Yes, as a revision | Render only (images, narration reused) |
   | Picture style / source | video_generation (scene prompts, images) | before images | Yes | Nothing |
   | Picture style / source | | after images | Yes, as a revision | All images and the render |
   | YouTube visibility | Gate 2 and publishing | any time before publish | Yes | Nothing |
   | Max spend | run budget checks | any stop | Yes (exists: `runs.retry`) | Nothing |
   | Topic, format, length | script_generation onward | after Gate 1 | **No** | Would invalidate the approved script and every finished step; shown as unavailable with one line of reason |

   The sheet would list only the rows allowed at the current stage and mark the rest unavailable with the reason.
2. R11.3: I kept the "Why didn't it work?" form (renamed, shown only when useful). Remove it?
3. Field names I read defensively until Task 8 reports (all optional; absent means the old behaviour): `runs.get.costBreakdown { totalUsd, estimateUsd?, limitUsd?, attempts[{ stageName, attemptNumber, totalUsd, failed?, stages[{ name, usd, failed? }] }] }`; per stage row `outcome { kind: completed | failed_review | failed_error | blocked | cancelled | running, reason? }`; `runs.get.approvedScript { text, chapters?, edited }` and `originalDraft { text, chapters? }`; a voice catalog `{ id, displayName, toneTags[], description?, previewUrl }`. If Task 8 names them differently, each is one function (`costBreakdownOf`, `serverOutcome`, `scriptVersionsOf`, `parseVoiceEntry`).

## What waits on Task 8

R2 per-attempt and per-stage cost and estimate (`costBreakdown`); R5 stored outcome (derived until then) and the two D2 pushes; R6 samples (voice catalog); R4 backend call; optional `approvedScript`; `runs.list` cursor and total (R12).

## Deviations

- Copy button is a share sheet on a phone (no clipboard module); see A8.
- R4 and R8 not coded; R6 has no samples yet.
- The CI job does not gate the server deploy.
- I changed three existing lint errors (two blob hooks, one eslint-disable with a reason in `channel-context.tsx`) and the eslint config (test files may import `vitest`), so lint could be a CI gate. No behaviour change intended in the hooks; they now keep the fetched blob keyed by its url instead of clearing state in an effect.

## Screenshots

None. Missing: Inbox with more than 8 runs, cost view, Edit settings sheet (not built), voice picker. No phone or emulator was available in this session.

## Tests

`cd studio && npx vitest run --root ../app`: 23 files, 141 passed. `cd app && npx tsc --noEmit`: clean. `npx eslint .`: clean. `npx expo export --platform web`: bundles. Nothing skipped. Not run: any device or emulator, any live backend.

## One line for the founder

The Inbox now lists every run and the Queue no longer jumps; cost, the approved script, plain failure messages and the full-screen script editor are in the app code but not on your phone yet (needs a build), and "Edit settings" waits on one backend call the architect has to confirm.
