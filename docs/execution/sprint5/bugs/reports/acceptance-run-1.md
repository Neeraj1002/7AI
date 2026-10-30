# Sprint 5 Bug Task: Acceptance run 1

**Date**: 2026-10-30
**Branch / worktree / PR**: `BUGS_ACCEPTANCE_RUN_1` / `D:\Study Material\7AI-BUGS_ACCEPTANCE_RUN_1` / [#138](https://github.com/Neeraj1002/7AI/pull/138)
**Task doc**: committed in `ae1ceb0` (`BUGS_ACCEPTANCE_RUN_1_DOC`), revision r2. The doc was not in the founder's docs folder, so the founder pasted it in chat and I saved it verbatim to `docs/execution/sprint5/bugs/tasks/acceptance-run-1.md` in both the source folder and the worktree.
**Status**: code-complete for R1, R4, R5, R7. R2 is a candidate fix, unconfirmed. R3 and R6 have findings only, no code.

Three separate statements: **code-complete**: yes, as listed above. **Merged**: no (the founder merges after the architect reviews). **Deployed**: no (`main` auto-deploys the backend after the merge; the app update is a separate founder step).

## Founder decisions that changed the task doc (all 29 to 30 Oct)

- Sprint 6 Task 2 was dropped (no in-video disclaimer). I ignored the Task 2 lines and touched no NIYT config or PLAN.
- Spend: $0.40 shared Short and $1.00 cancel runs were approved, but **no money was spent**. Nothing needed a paid run: R6 ended as a finding, and the preview checks run after the deploy.
- R7 = option A, refined: see R7.
- Normal flow: no separate preview. The retests run after the merge and deploy.

## R5 (BE): tenant check on `/runs/:id/video`, `/preview`, `/subtitles`

- **Cause (confirmed in code)**: `studio/src/api/video-route.ts` served the three routes behind only the global "any valid identity" hook. Nothing compared the run's tenant with the caller's.
- **Fix**: one helper `ownsRun` in `video-route.ts` copies the thumbnail route's rule. A session's tenant must equal the run's tenant; the ops token acts as the MVP tenant; anything else is refused. Another tenant, an unknown id and an unauthenticated caller all get the same 404, and the thumbnail route does the same. (The thumbnail route has no separate admin branch, so neither do these.)
- **Playback**: the phone player and the `.srt`/preview links already send `Authorization: Bearer` (`useAuthedVideoSource`, `mediaLink` with `sendAuth`), so own-tenant playback needs no change.
- **Tests**: `video-route-tenant.test.ts`, for each route: owner served; another tenant refused; unauthenticated refused; unknown id gives the same body as another tenant's run; ops token served as MVP tenant.
- **Sweep** (cause: "a route that takes a run, channel or asset id and never compares its tenant"):
  - `GET /runs/:id/video`, `/preview`, `/subtitles`: fixed here.
  - `GET /runs/:id/thumbnail/...`: checked (the pattern copied).
  - `POST/GET/DELETE /channels/:id/watermark`: checked (tenant compare; POST and DELETE also `canResolveGate`).
  - `/auth/*`, `/oauth2callback` (signed state), `/bugs` (deliberately unauthenticated), `/health`: not run-scoped, left alone.
  - tRPC `runs.*` (get, progress, getVideoUrl, getAttemptBundle, packaging, packagingRecord, checkPackageTitle, expectedLength, create, estimateCost, list, listPage, gate1, gate2, choosePackage, retry, updateSettings, rerun, cancel, tagPostHoc): all checked (tenant compare or `assertGateOwnership`).
  - tRPC `channels.*` (get, listFormats, getActiveProfile, listProfileVersions, createProfileVersion, getYoutubeConnectUrl, disconnectYoutube, update, archive): all checked.
  - `bugs.updateTriage`, `admin.*`: platform admin by design (cross-tenant on purpose).
  - `dashboard.*`: tenant id is passed to every query; I did not read the queries themselves, so this one is not verified further.
- **Not verified**: the two-tenant check on the real deployed server. See "Founder steps after the deploy".

## R1 (BE): account email in the public description

- **Cause (confirmed)**: `state-machine.ts` used `approver.name?.trim() || approver.email`, so the email was passed as `editorName` and `FALLBACK_EDITOR` was never reached. The email went into the model prompt and the description.
- **Fix**: `publicEditorName()` in `packaging.ts` is the one owner of the rule: a real name, trimmed; blank, null or any name containing `@` gives `FALLBACK_EDITOR` ("the team", no second constant). `buildMetadataUserMessage` and `scrubDescription` both use it, so even a caller that passes an email cannot publish it. `findGate1ApproverForRun` no longer returns the email (its only caller was the publishing stage).
- **Tests** (`packaging.test.ts`): name set; null; undefined; blank; whitespace; an email; "Name <email>"; and the built prompt and scrubbed description for an email-only identity contain no `@`. "No approver" is the null case.
- **Sweep** (cause: "a user email reaching a public field"): title, tags, comments, credits, captions and thumbnail text never read the user table (grep of `studio/src/agents/publishing` and the upload path found no email use). `{editor}` and the credit line: fixed here. `{sources}`: user-supplied source list, not an account email, left alone. `runs.updateSettings` records `user.name || user.email` in `settingsChanges`: shown only inside the app to the same tenant, never sent to YouTube; left alone, but if the architect wants it gone it is a one-line change (needs a new task).
- **Display name (T05)**: there is **no display-name field in the app**. `User.name` is set only once, at account creation, by `studio/scripts/invite-tenant.ts` (`ownerName`). There is no update call and no screen. Until one exists, any account created without a name publishes "the team", and the founder's T16 expectation of a name will only be met for accounts that were created with one. A display-name field needs a design decision and is not built.
- **Not verified**: a real published description. Already-published videos from the acceptance run still carry the email; the founder edits those in YouTube Studio.

## R7 (BE): altered or synthetic content flag

- **Founder decision (30 Oct)**: Yes whenever any picture in the video is AI-generated (today's `ai-stills`), including mixed videos. A stock-footage-only video with AI narration sends No. No new setting, no Gate 2 or channel-settings labels, no in-video disclaimer. This replaces the task doc's "true when pictures OR narration are AI".
- **Setting finding (step one of R7)**: no AI-disclosure setting exists anywhere in `studio/src` or `app`. `containsSyntheticMedia` is derived from the render, never read from Gate 2, channel settings or a profile. Nothing to change in precedence.
- **Fix**: `deriveContainsSyntheticMedia` (the one owner; the upload, the recovery fingerprint and the receipt all take its value) keeps the visual rule and now also returns true when the output carries a `visualRepairReceipt` (a repair splices a generated still) or the render's own record shows `visualSource: 'ai-stills'` or `aiVisualsStillCount > 0`. Narration is not read.
- **Where AI images enter a video** (checked): `generateStills` is called only from the `ai-stills` Short path (`index.ts`) and the long-form path (`long-form.ts`); the Short's AI first frame replaces scene one of an `ai-stills` plan only; visual repair works on long `ai-stills` videos. The stock-to-`ai-stills` fallback attempt is covered because the latest attempt's plan is read. Thumbnails made by `packaging/build.ts` use AI images but are not part of the video, so they do not count.
- **Tests** (`state-machine.video-fallback.test.ts`): all AI visuals true; mixed (stock plan with an AI-still count, a repair receipt, or `ai-stills` metadata) true; stock-only false, with and without the AI-still record. The `videos.insert` body carrying the value is already pinned in `youtube-client.test.ts`.
- **Sweep** (cause: "AI-ness derived from `visualSource` alone"): the upload flag is the only consumer; no description disclosure text, pinned comment, in-video tag or label exists in code. Test fixtures that hard-code `containsSyntheticMedia: false` (`resumable-upload*.test.ts`, `youtube-client.test.ts`, `publishing-recovery.restart-worker.ts`) pass the value through and do not derive it; left alone. A stale comment in `agents/publishing/types.ts` still says the flag derives "directly from `plan.visualSource === 'ai-stills'`"; left for the architect.
- **Doc hits for the architect**: the NIYT config "Studio defaults" line; the Part 3 design doc line that says the flag derives from `ai-stills`; Sprint 6 Task 2 R0 and R1 (dropped, so only archive them).
- **YouTube wording (task step one)**: I did not re-read YouTube's pages this session. The task writer's 29 Oct summary is unverified by me, and the Studio upload dialog wording is still unchecked. The founder's rule is intended to be the safer side where it applies to pictures only; **AI narration alone now uploads as No**, which is the narrower reading and is the founder's call.
- **Later item (logged, not built)**: a per-video disclosure toggle (a Gate 2 control to override the derived value either way).
- **Not verified**: a real upload. After the deploy, the `publishing` stage output of the next AI-picture video should show the flag true.

## R4 (BE + FE): cost card shows only the final cost

- **Cause (confirmed)**: `runs.get` already returns `cost.estimateUsd` and `limitUsd` when stored, but `runs.create` stored them **only for long runs** (`if (isLong)`). A Short, which has no spend limit by design, stored neither, so the card had nothing to draw. The app side was a second cause: `CostCard` hid the whole line when a number was missing.
- **Fix**: a Short now stores `estimateUsd` at create (display only; I checked that nothing reads `creationOptions.estimateUsd` to decide a retry or block, and `retryAllowanceUsd` is still long-only). `costMetaParts()` in `app/lib/run-cost.ts` owns the line: estimate always shows, "Estimate not recorded" when absent; limit shows, "No limit" for a Short, "Limit not recorded" otherwise. The row is never hidden.
- **Tests**: `run-cost.test.ts` (both stored; older run with neither; Short; retries and attempts); `runs.run-screen-data.test.ts` pins that a Short stores `estimateUsd` and no limit or allowance. I updated the existing "Shorts unchanged" expectations in `runs.long-form.test.ts` to ignore the new field.
- **Which old runs lack them**: every Short created before this deploy has no estimate and no limit (limit is correct: none). Every long run created before Sprint 5 Task 8 R8.1 has neither. `rerun` strips `estimateUsd` from the copied options, so a rerun also lacks it. All now read "not recorded".
- **Sweep** (other screens showing run cost): the Run screen is the only caller of `CostCard`. Other files that read spend or limit: `EditSettingsSheet`, `RaiseLimitSheet`, `RunStateCards` (all on the Run screen), and Admin run, tenant and usage. I did not read those admin screens line by line; they are left alone, and none of the Queue or Inbox files mention spend or limit fields.
- **Not verified**: the card on a phone; the shared Short (not run).

## R3 (FE or APP): watermark upload "Unsupported FormDataPart"

- **What I can confirm in code**: the app already has the Bugs Task 12 R12 fix (commit `3ca2373`, 11 Oct): on native it appends the `{ uri, name, type }` shape and uses the real `File` only on web (`channel/[id].tsx`). React Native 0.86's `FormData.getParts` accepts exactly that shape (read in `node_modules`), and the error text is not in React Native's JavaScript at all, so it comes from the native networking layer when a part has no string `uri`. The server side (`watermark-route.ts`) expects one multipart file field, PNG or JPEG, which matches.
- **What I cannot confirm**: why it still failed on the phone. The likeliest reasons are that the phone ran JavaScript older than 11 Oct, or `asset.uri` was empty for that picked image. `01a16f4a` is not a git commit, so I cannot say which code it contained. I wrote **no code**: a rewrite without the cause would be a guess.
- **Sweep**: that is the only `FormData` in the app. The watermark feature flag: `app/lib/feature-flags.ts` has `watermarkUpload: true`, so the control is on in this code; I did not check what the phone build shipped with.
- **Needed from the phone** (no adb yet): (1) the app version screen text and the date of the last update on the phone, (2) after the update, does the upload still fail, with the exact message, (3) whether the image comes from Photos, Files or a screenshot.

## R2 (APP or FE): Voice page

- **Candidate cause (code only, not confirmed on the device)**: `VoicePicker` creates its player with `useVideoPlayer`, which releases the native player on unmount, and then called `player.pause()` in a cleanup effect (and in the save handler right before the page closes). A call into a released shared object throws, and with no error boundary above the page a throw at unmount is a white screen. That matches "white screen when you save or do anything" and T42. Fix: `pauseQuietly()` (`app/lib/voice-catalog.ts`) never throws; the three `player.pause()` calls use it. Test: a player whose `pause` throws "already released".
- **Not confirmed**: whether this is the actual crash. The slow play button (B2) is **not fixed and not measured**; I have not touched it. Role if the candidate is right: FE (JavaScript only, OTA); no native change, so no new APK.
- **Sweep**: only `VoicePicker` creates a player for voices; `VoiceSheet` and `EditSettingsSheet` both render it, so they get the fix. `LongPreview` and the Run screen use `useVideoPlayer` with a `VideoView` and do not pause in a cleanup; left alone.
- **Needed from the phone**: (1) after the update, does the white screen still happen, and on which action (play, choose, save, back), (2) for the slow button, how many seconds from tap to sound, on Wi-Fi or data, and for which voice, (3) the exact text on any error toast just before the white screen.

## R6 (BE + APP): Cancel stays on "Cancelling..."

- **Cause (confirmed by reading the code; not reproduced)**: this is **not a regression of Bugs Task 10; it is a case it did not cover**. `runs.cancel` on a `running` run calls `requestCancellation`, and if a loop is actively driving the run it returns `immediate: false` and the run stays `running` with `cancelRequested` true. The only place that then ends it is the top of `driveLoop` (`pipeline-runner.ts`), which is read **between stages**. Inside a stage, the only cancel check is the long-form `runLimitGuard` (`state-machine.ts`, long videos only); a Short has none, so a Short's long stage (script generation, video generation, the Gate 2 packaging calls) holds "Cancelling..." until it ends. The "sometimes resolves" part fits: if no loop has made progress recently (`isActivelyDriven` stale), the mutation ends the run at once. A restart loses the in-memory registry, which can leave the flag unset after a restart.
- **Why I stopped**: the task says this is a design change (a cancel check inside stages, or aborting the paid call) and must go to the founder, not be built. No code, no cancel runs, no money spent. The result table the task asked for is **not produced**.
- **If the founder wants the measurement anyway** (up to 5 Shorts, $1.00): needs a session for the test tenant so I can poll `runs.get`; I do not have one. Otherwise the architect decides the design.
- **Report `9e007cd7`**: I changed nothing on it; result recorded here for the founder to close or keep open.

## Key Principle 11 proof

```
git diff origin/main...HEAD -- studio app | grep '^+' | grep -iE 'underdogs|not in your textbook|cold open|niyt|lego|mary celeste'
```
Result: empty. The channel names on the test tenant were not listed (I have no tenant access); the fixtures I added use neutral values only.

## Checks run

Studio: `tsc --noEmit`, `eslint .`, `npm run build`, full suite `vitest run --maxWorkers=4`: 181 files passed, 12 skipped (database-backed), 1726 tests passed. App: `tsc --noEmit`, `expo lint`, and its suite through the studio vitest (`--root ../app --maxWorkers=4`): 30 files, 205 tests passed. The 12 skipped files need a database and did not run here.

## Founder steps after the deploy (in order)

R5 two-tenant check, needs one other tenant on preview:
1. Open any finished run of tenant A in the app and note its run id (the Run screen link, or `runs.list`).
2. Sign in as tenant B and call `GET https://7aistudio.tech/runs/<A's run id>/video` with B's token, then `/preview` and `/subtitles`. Expect 404 each time.
3. Call the same three with A's token. Expect the file (200) where the run has one, 404 "not available yet" where it has not.
4. On the phone, as A, play the video on a run at Gate 2 and download the captions. Expect them to work.
If preview has only one tenant, say so; I will not create one.

Retests (from Part 6; note the table has six rows, R-B1 to R-B6, the task doc said five): R-B1 needs a new published Private video; R-B2/B3 and R-B4 need the app update; R-B5 needs a Short created **after** the deploy for an estimate (older runs read "not recorded"); R-B6 stays open until the architect decides the cancel design. R5 and R7 have no Part 6 row.

## Hard rules 5 to 9

- Rule 5: the task doc was missing from both the repo and the source folder; the founder pasted it, I saved it to the source folder and committed it alone first (`ae1ceb0`). It is identical to the source.
- Rule 6: see the PR; `main` pulled and docs scope checked before `gh pr ready` (recorded below).
- Rule 7: I did not edit `STATUS.md` or `PLAN.md`. Branch, worktree and PR are at the top for the architect to record.
- Rule 8: not yet; after the founder merges.
- Rule 9: sweep sections are in each item.

## Rule 6 record

`git fetch origin` and `git pull origin main` in this worktree on 2026-10-30: already up to date, no conflicts to resolve. Build, lint, type-check and tests were re-run on the branch (see Checks run). `git diff --name-only origin/main...HEAD -- docs/` lists only this report and the task doc, and the task doc is identical to the source in `D:\Study MaterialAI\docs`.
