# Bugs Task 10: Cancel Run That Never Stops, and Push Notifications That Never Arrive

Read `docs/execution/bugs/HOTFIXER_AGENT_PROTOCOL.md` and `docs/execution/templates/TASK_TEMPLATE.md` in full before starting. This is a normal bugs-track task: one release branch, one commit per `R#` item, one PR (protocol, "Release & Branch Model").

> Branch note: the name `BUGS_TASK10` was already used and merged (PR #39, an unrelated pass). This task's branch is `BUGS_TASK10_CANCEL_PUSH`; commit prefixes stay `BUGS_TASK10_R<X>`.

**Objective**: (1) a founder who cancels a run gets a clear result and the run actually ends, including a run that stalled; (2) push notifications reach the phone, so a Gate 1 or Gate 2 request is not silent.

**Why this is its own task, not part of `closureTask2.md`** (architect decision, 2026-10-06): both defects are already confirmed and are built directly, while closure part 2 is test-first triage that waits for PR #48 to be deployed and for hours of founder testing. P7's push work also waits for the founder's Firebase files and a new APK. Keeping them separate lets the cancel fix ship now (Sprint 4 Frontend 1 waits for it) and stops one founder prerequisite from holding the triage PR open. Closure part 2 only cross-references this task.

**Duration**: R1 ~2.5h, R2 ~2.5h, R3 ~2h, R4 ~2h, R5 ~1h plus the founder's build. ~10h.

**Depends On**: closure PR #48 merged to `main`. Founder prerequisite for R5 and for the on-device checks of R3/R4: F1 below. R1-R4 do not wait for it.

**Owning Component**: `studio/src/run-pipeline/pipeline-runner.ts`, `studio/src/api/routers/runs.ts`, `studio/src/notifications/push-channel.ts`; `app/` (run detail, queue, `lib/push.ts`, `lib/auth.tsx`, the Account/Version row); `app/app.json` plus a new `app/google-services.json`.

## Success Criteria

1. Cancelling a run that no loop is driving (stalled, loop died, server restarted) ends it at once, with a visible "Run cancelled" result, and the run leaves the Queue.
2. Cancelling a run that is being driven ends it at the next loop step; the app shows "Cancelling…" until then, and that state survives leaving and re-opening the screen.
3. Cancelling twice is not an error. Nothing is published after a cancel.
4. On a fresh install of the new APK, signing in stores `users.expoPushToken`; a Gate 1 request produces a push with the app closed and with it open; tapping it opens that run.
5. A push that Expo reports as undeliverable is logged, and `DeviceNotRegistered` clears that user's stored token.

## Verified findings (2026-10-06)

Read by the UI/UX chat from the code on `main`, and from Sprint 3 Task 11's own doc. The architect chat could not read the code. Re-verify each point before editing, and record any difference in the report.

**Cancel**

* Sprint 3 Task 11 R3/B11 (PR #42) made `runs.cancel` accept `running`. On a `running` run it records the request in an in-memory registry (a `Set` of run ids) and returns `{ cancelled: true }`. `driveFromCurrentStage` (`pipeline-runner.ts`) checks that registry once per loop iteration, next to `failRunIfChannelArchived`, and then writes `status: 'failed'`, `lastError: 'Cancelled by user'`.
* The gap: if no loop is driving the run (it stalled, the loop died, or the server restarted and nothing resumed it), the flag is never read and the run stays `running` forever. That is the founder's report: a run shown "Stalled — no progress 30+ min" was cancelled, no confirmation appeared, it stayed in the Queue, and it stayed cancellable after re-opening it.
* The app (UI/UX task 6, PR #43) shows no result, does not refresh the run or the Queue list, and keeps "Cancelling…" only in screen state, so it is lost on navigation.
* `endReason` is derived by string-matching `lastError` (Task 11 R2/B13). The text `Cancelled by user` must stay exactly as it is, or `endReason` silently breaks.

**Push**

1. No `google-services.json` exists and `app/app.json` has no `android.googleServicesFile`. `getExpoPushTokenAsync` therefore fails on the installed APK; the error is caught and only logged on the phone (`app/lib/push.ts`), so no token ever reaches the server.
2. Registration happens only in `completeSignIn` (`app/lib/auth.tsx`, from Sprint 3 FE11'). A user who is already signed in never registers.
3. No Android notification channel is created before the permission request (needed on Android 13+).
4. No `Notifications.setNotificationHandler`, so notifications that arrive while the app is open are dropped.
5. The backend (`studio/src/notifications/push-channel.ts`, Sprint 3 Task 7/O1) sends only when `user.expoPushToken` is set and never reads Expo's delivery receipts. Task 7's own report proved the send path against Expo's real API with a fake token (a real `DeviceNotRegistered` came back), but real on-device delivery was never verified.

Do not rebuild `ExpoPushChannel`, `notifications.registerPushToken` or the tap-to-deep-link handler: they exist. This task fixes what stops them working and adds receipt handling.

## Founder decisions already made — don't reopen

* A cancel is final, and nothing is published after it.
* The green "Report a bug" button stays as it is.
* No new designs. Cancel uses the locked "Ended … Run again" board (canvas row 4); push has no screen beyond one line on the existing Version row.
* Both defects are built directly. The test-first rule from `closureTask2.md` does not apply here.

## Roles and permissions

No new roles. `runs.cancel` keeps its existing tenant ownership check (`assertGateOwnership`). Push registration stays `ctx.userId`-scoped.

## F1 (Founder, prerequisite for R5 and the device checks)

1. Create a Firebase project and add an Android app whose package name equals `android.package` in `app/app.json` (expected `com.sevenai.studio`; check it, do not guess).
2. Download `google-services.json` and place it in the folder the agent works in (or attach it in chat).
3. In EAS credentials for the Android `preview` profile, upload the FCM V1 service-account key (`eas credentials`). That key is the secret: it never goes into the repo or into chat.
4. After R5 merges, run `eas build -p android --profile preview` and reinstall (see R5).

## R1 (Role: `BE`) — `runs.cancel` ends a run that no loop is driving

Where: `runs.ts` (`cancel`), `pipeline-runner.ts`, and the `getRunDetail`/`runs.list` read paths.

Fix:

1. Track which run ids are actively driven: add the id when `driveFromCurrentStage` starts and remove it in a `finally`, so a thrown error cannot leave a ghost entry. A run counts as actively driven only if it is in that set and it made progress recently: use the newest stage-row or run `updatedAt` timestamp, with `CANCEL_STALE_AFTER_MS = 10 * 60 * 1000`. A hung loop (an await that never returns) therefore counts as not driven. Check the longest real stage duration in the stage rows; if a healthy stage can exceed ten minutes, raise the constant and say so in the report.
2. `runs.cancel` on `running` or `pending`:
   * Not actively driven: write `status: 'failed'`, `lastError: 'Cancelled by user'` immediately (the same write the gate path uses). Also put the id in the cancel registry, so a stalled loop that wakes up later stops at its next check. Return `{ cancelled: true, immediate: true, alreadyEnded: false }`.
   * Actively driven: keep the registry path and return `{ cancelled: true, immediate: false, alreadyEnded: false }`.
3. `paused_gate1`, `paused_gate2` and `needs_attention` keep their current behaviour and now return `{ cancelled: true, immediate: true, alreadyEnded: false }`.
4. Idempotent: a run that has already ended (`completed`, or `failed`) returns without an error: `{ cancelled: <true only if its endReason is 'cancelled'>, immediate: false, alreadyEnded: true }`. A completed or otherwise failed run is not reported as cancelled, so the app does not show a false "Run cancelled".
5. Server-side "Cancelling…" state: `runs.get` and each `runs.list` item gain `cancelRequested: boolean`, true when the id is in the cancel registry and the run is not yet ended. Derived from memory, no schema change. After a server restart it is false, which is correct, because the request was lost and the user can cancel again.
6. Nothing is published after a cancel. At the top of each loop iteration, and at the start of `runPublishingStage` (next to the `isActive` check Sprint 3 Task 8 added), re-read the run and stop if `status` is no longer `running` or the id is in the cancel registry. A cancelled run must never reach the upload call, even if a stage that was mid-flight finishes later.
7. Do not let a late stage resurrect a cancelled run. Look at how stage functions write the run's `status`/`currentStage` when they finish. If a conditional write (`updateMany` where the id matches and `status = 'running'`) is a small change in the shared helper, make it. If it is not small, do not refactor: state the remaining race in the report (an at-most-one in-flight stage can still write its stage row).
8. Confirm `endReason` is `'cancelled'` in both the immediate and the loop path, and that a cancelled run is not in the statuses the Queue's `runs.list` returns.

Verify (live on preview, after merge and deploy; the founder supplies run ids):

* A run that is `running` with no active loop (for example after `pm2 restart sevenai`): cancel it. The response has `immediate: true`; `runs.get` shows `failed`, `Cancelled by user`, `endReason: 'cancelled'`; it is gone from the Queue's `runs.list`.
* A run mid-`video_generation`: cancel it. The response has `immediate: false`, `cancelRequested` is true until the next loop step, then it ends, with no further LLM/TTS/video spend.
* Cancel the same run a second time: no error, `alreadyEnded: true`.
* Cancel a `completed` run: `alreadyEnded: true`, `cancelled: false`, status unchanged.
* A cancelled run never produces a `youtubeVideoId`.
* Unit tests: active, stale-active and not-driven cases, the ended/idempotent cases, the publish guard, and the `finally` cleanup after a thrown stage.

## R2 (Role: `FE`) — Cancel gives a result, refreshes, and survives navigation

Where: `app/app/(app)/run/[id].tsx`, the Queue card component, the cancel mutation wiring.

Fix:

1. After `runs.cancel` returns, invalidate `runs.get` for that run and `runs.list` at once.
2. `immediate: true`, or a refreshed status of `failed` with `endReason: 'cancelled'`: show a short "Run cancelled" confirmation and switch Run detail to the existing ended screen (canvas row 4, "Ended … Run again"). `alreadyEnded: true`: refresh and show the real ended screen without the confirmation.
3. `immediate: false`: show a disabled "Cancelling…" button and poll `runs.get` every 3 s. If the run has not ended after 60 s, show "Couldn't cancel yet — try again" and re-enable the button.
4. The source of truth for "Cancelling…" is the server's `cancelRequested` (R1 step 5), so the state survives leaving and re-opening the screen, switching tabs, and an app restart. Use a React Query mutation key (or the small store the app already uses) only to cover the moment between the tap and the first refetch. Do not keep this state in screen state.
5. A Queue card for a run with `cancelRequested` shows a "Cancelling…" chip and no Retry button.
6. A cancel error shows inline text on the button area and re-enables it. No new dependency, JS only.

Verify (phone, preview): cancel a stalled run, so the ended screen appears at once and the Queue card goes away; cancel a mid-video run, leave and re-enter during "Cancelling…" (still shown), and see it end; tap cancel twice quickly (no error); force a failed request by stopping the server (the button re-enables with an inline error).

## R3 (Role: `BE`) — Read Expo push receipts and clear dead tokens

Where: `studio/src/notifications/push-channel.ts` and a small receipt checker next to it.

Fix:

1. When Expo returns a ticket with `status: 'error'` at send time, log it (user id, ticket error, never the token) and, if `details.error` is `DeviceNotRegistered`, clear that user's `expoPushToken`.
2. Keep the ticket ids of accepted pushes in memory (`{ ticketId, userId, sentAt }`). A timer (every 5 minutes, started at boot, cleared on shutdown) asks Expo for the receipts of tickets older than 2 minutes (`getPushNotificationReceiptsAsync`, in chunks), then drops them. A receipt with `status: 'error'` is logged. `DeviceNotRegistered` clears the user's token. Tickets older than 24 hours are dropped unchecked. The list is lost on restart; that is acceptable and stated in the report.
3. Receipt handling must never throw into the notification path: a failure here logs one line and moves on. Notifications keep working exactly as today when Expo is unreachable.
4. No schema change.

Verify: unit tests with a mocked Expo client (error ticket, error receipt, `DeviceNotRegistered` clears the token, an unrelated receipt error does not, a thrown receipt call does not break a later send). Live, with the dev tenant and a fake-but-well-formed token: the real Expo response is logged and the token cleared.

## R4 (Role: `FE`) — Register on every launch, create the channel, handle foreground pushes

Where: `app/lib/push.ts`, `app/lib/auth.tsx`, the Account section with the Version row.

Fix:

1. Register whenever the app starts and the user is signed in, not only in `completeSignIn`. Keep the `Platform.OS === 'web'` skip. Send the token to `notifications.registerPushToken` only when it differs from the last one sent (kept in SecureStore).
2. Create a default Android notification channel (`Notifications.setNotificationChannelAsync`) before the permission request.
3. Add `Notifications.setNotificationHandler` so a push that arrives while the app is open is shown as a banner (and still deep-links on tap using the handler Sprint 3 FE11' already has).
4. Add a "Push" line to the existing Version row under Account showing on (token registered), off (permission denied), or error (token request failed; show the short reason). It is a status line, not a settings control, and it adds no text input.
5. Never throw out of registration. The failure reason is kept for step 4 and logged.

Verify: type check and lint; on a device with the R5 build (below), see the three states (grant, deny, and an error by running offline).

## R5 (Role: `APP`) — FCM configuration and a new APK

Where: `app/app.json`, new `app/google-services.json` (from F1).

Fix:

1. Add `android.googleServicesFile: "./google-services.json"` to `app/app.json` and commit `google-services.json`. It is client configuration, not a secret (the FCM service-account key from F1 is the secret and is never committed). If the founder prefers it kept out of git, use an EAS file environment variable instead and say so in the report.
2. This changes the native fingerprint, so it needs a fresh `eas build -p android --profile preview` and a reinstall. State the new Android version code (`eas build:version:get --platform android`, plus 1) and the new `runtimeVersion` in the report. Before building, check `docs/execution/bugs/STATUS.md` and the Sprint 4 / UI/UX docs for any other pending native change and bundle it into the same build.
3. Sequencing note for the founder: once the new APK is installed, OTA updates published for the old runtime no longer reach it. Publish R2 and R4's OTA (`eas update --branch preview`) after the build, from the same commit, so they target the new runtime. Every tester must reinstall once.

Verify: the build installs and launches; `users.expoPushToken` is set after sign-in (the founder runs the SQL below); the two checks in "Testing" pass.

## Schema Impact

None. The cancel registry, `cancelRequested` and the receipt list are all in memory. If an item turns out to need a column or table, stop and ask the founder.

## Business Logic / State Transition

No new state. `running` → `failed` (`Cancelled by user`) already exists; R1 adds a second way to reach it for a run that no loop is driving. After that write, no stage may advance the run and the publishing stage must refuse it.

## Failure Modes & Handling

* Server restart between a cancel request and the loop's next check: the request is lost; the run keeps going or, if no loop resumes it, the next cancel ends it at once.
* A stale-but-alive loop is force-ended: the run is `failed`; the late stage's own stage row may still be written; the run is not resurrected (R1 step 7) and nothing is published (R1 step 6).
* Expo or the receipt endpoint is down: log one line, notifications and runs are unaffected.

## Implementation

Files to Create: `studio/src/notifications/push-receipts.ts` (and its test), `app/google-services.json` (from F1).

Files to Modify: `studio/src/run-pipeline/pipeline-runner.ts`, `studio/src/run-pipeline/state-machine.ts` (the publishing guard only), `studio/src/api/routers/runs.ts`, `studio/src/models/repositories/*` (read paths for `cancelRequested` if needed), `studio/src/notifications/push-channel.ts`; `app/app/(app)/run/[id].tsx`, the Queue card, `app/lib/push.ts`, `app/lib/auth.tsx`, the Account/Version row, `app/app.json`.

Integration Points: Sprint 3 Task 11 R3 (the registry), Sprint 3 Task 8 (`isActive` check in `runPublishingStage`), Sprint 3 Task 7/O1 and Frontend 3 FE11' (push channel and registration). Reuse them; do not add a second registry or a second push path. Sprint 4 backend tasks and Sprint 4 Frontend 1 touch `runs.ts`, run detail and the Queue: keep every change additive, and `git fetch origin && git merge origin/main` before marking the PR ready. The admin FE task also edits `channels.tsx`; if the Version-row edit conflicts, keep both changes.

## Testing

```bash
cd studio && npm run build && npm run lint && npm run typecheck && npx vitest run
cd ../app && npx tsc --noEmit && npm run lint
```

Plus the per-item live checks above, and these for the founder:

```sql
SELECT email, "expoPushToken" IS NOT NULL AS has_push_token FROM users;
```

(the founder pastes the result; the token itself is never printed or pasted).

1. Trigger a Gate 1 request with the app closed: a push arrives; tapping it opens that run.
2. Trigger another with the app open: a banner appears.

## Report Template

`docs/execution/bugs/Sprint3/reports/task10.md`. Include: the exact `runs.cancel` outputs observed for each case; the stall threshold used and why; what the stage-write guard does (R1 step 7) and what race remains; the deployed commit; the new Android version code and `runtimeVersion`; the SQL result; and what the device checks showed.

## Additional Notes

* Run order: R1, R2, R3, R4, then R5 once F1 is done. R1 and R2 can ship by OTA without waiting for F1.
* After the closing commit is pushed, run `gh pr ready`. Do not merge, and do not push to `main`.

## Known Issues / Future Improvements

* The cancel registry and the receipt list are in memory and are lost on restart. A persisted `cancelRequestedAt` would remove that; it needs a migration and is not part of this task.
* A stage that is mid-flight when a cancel lands is allowed to finish (no `AbortController` into LLM/TTS/video calls), as in Task 11.
* iOS push is out of scope (the app ships as an Android APK today).

## Links & References

* `docs/execution/sprint3/tasks/task11.md` (R2/B13 `endReason`, R3/B11 cancel registry)
* `docs/execution/sprint3/tasks/task7.md` (O1 push channel) and `docs/execution/sprint3/tasks/frontend-task3.md` (FE11')
* `docs/execution/sprint3/tasks/task8.md` (the `isActive` check in `runPublishingStage`)
* `docs/execution/ui-ux/STATUS.md` and `docs/execution/ui-ux/tasks/task6.md` (the cancel UI this task fixes)
* `docs/execution/sprint4/tasks/frontend-task1.md` (waits for this task's R2)
* `docs/execution/bugs/Sprint3/closureTask2.md` (cross-reference only)

## Git Workflow

From `D:\Study Material\7AI-bugs`: branch `BUGS_TASK10_CANCEL_PUSH` from `origin/main`; record it in `docs/execution/bugs/STATUS.md` (a new Task 10 row) before the first code commit. One commit per item: `BUGS_TASK10_R<X>: ...`, push after each, draft PR after R1. Closing commit `BUGS_TASK10_REPORT: ...` with the report and the STATUS row, then `gh pr ready`. Never push or merge to `main`. Verification is on the live preview app, never a direct connection to `sevenai_preview`; the founder runs any SQL and pastes the result.
