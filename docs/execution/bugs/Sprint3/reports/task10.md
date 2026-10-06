# Bugs Task 10 Report: Cancel Run That Never Stops, and Push Notifications That Never Arrive

Branch `BUGS_TASK10_CANCEL_PUSH` (the name `BUGS_TASK10` was already used and merged as PR #39 for an unrelated pass), PR #52. Commits: `_DOCS`, `_R1`, `_R2`, `_R3`, `_R4`, `_R5`, `_REPORT`.

## Status

| Item | State |
|---|---|
| R1 BE cancel | Done. Unit-tested and exercised against a throwaway local sandbox database. Not yet run on preview. |
| R2 FE cancel UI | Code done, typecheck + lint clean. **Never rendered on a device** (founder check below). |
| R3 BE receipts | Done. Unit-tested; real Expo API call with a fake token verified in the sandbox. |
| R4 FE push registration | Code done, typecheck + lint clean. **Never run on a device.** |
| R5 APP FCM config | Done in the repo. **Needs a new APK from the founder.** |
| Deployed commit | Not deployed yet (founder merges and deploys). |

## Verified findings: what I found vs. the task doc

Everything in "Verified findings" matched the code, with these differences:

1. **`updatedAt` is not maintained.** In the schema both `pipeline_runs.updatedAt` and `pipeline_stages.updatedAt` are `@default(now())`, never `@updatedAt`, and no repository writes them. They stay at the creation time. So "newest stage-row or run `updatedAt`" would have been useless on its own. Progress is read from what is really written: every stage row's `createdAt` / `startedAt` / `completedAt`, plus the run's `createdAt` / `startedAt`. I did not start maintaining `updatedAt` (scope; it would also change `runs.list` ordering and the Queue's relative times).
2. **Queue cards have no Retry button.** The Queue card is a tappable row ("tap to retry or cancel" opens Run detail). A run with `cancelRequested` is always `running`, so it is an in-progress row; it now shows a "Cancelling…" chip in place of the time. There was no Retry to hide.
3. **Push registration was in `completeSignIn` only, as stated, but I also moved it.** `completeSignIn` no longer calls it; a `useEffect` in `auth.tsx` registers whenever there is a session (launch or fresh sign-in), so there is one path, not two.
4. **A branch named `BUGS_TASK10` already existed** (merged PR #39, SERVERCONFIG work). New branch name used; commit prefixes unchanged.
5. `docs/execution/bugs/Sprint3/tasks/task10.md` did not exist in the repo; it was added as the first commit from the text the founder pasted in chat.
6. `expo-image-picker` (UIEnhancement-3 FIX_5, watermark upload, a native change) is already on `main`, so the new APK also carries it (see R5).
7. The `app` checkout's `node_modules` lacked `expo-image-picker`; `npm install` fixed `tsc`. `npm run lint` in `app/` still reports one `import/no-unresolved` for `expo-image-picker` in `app/(app)/channel/[id].tsx`, a file this task does not touch (the closure report mentions the same error). My changed files lint clean (`eslint` on them exits 0).
8. `studio` `build` and `typecheck` initially failed because the generated Prisma client was behind the schema (admin fields). `npx prisma generate` fixed it; nothing in the repo changed.

## R1: `runs.cancel`

Outputs observed (sandbox database, real router, real Prisma; one run per case):

| Case | Output |
|---|---|
| `running`, no loop driving it | `{ cancelled: true, immediate: true, alreadyEnded: false }`; `runs.get`: `failed`, `Cancelled by user`, `endReason: 'cancelled'`, `cancelRequested: false`; absent from a `runs.list` with the Queue's statuses |
| `running`, loop driving it, recent progress | `{ cancelled: true, immediate: false, alreadyEnded: false }`; `runs.get` and the `runs.list` item show `cancelRequested: true`, status still `running` |
| `running`, loop registered but no progress for 15 min | `{ cancelled: true, immediate: true, alreadyEnded: false }` |
| second cancel of an already cancelled run | `{ cancelled: true, immediate: false, alreadyEnded: true }` |
| `completed` run | `{ cancelled: false, immediate: false, alreadyEnded: true }`; status stays `completed` |
| otherwise-failed run (e.g. "Channel deleted") | `{ cancelled: false, immediate: false, alreadyEnded: true }` (unit test) |
| `needs_attention` | `{ cancelled: true, immediate: true, alreadyEnded: false }` |
| `paused_gate1/2` (pending approval resolved) | `{ cancelled: true, immediate: true, alreadyEnded: false }` (unit test; real gate path unchanged) |

The text `Cancelled by user` is unchanged; it now lives in one constant (`CANCELLED_BY_USER`, `pipeline-run.repository.ts`) used by `runs.cancel`, the loop and `deriveEndReason`.

**Stale threshold: `CANCEL_STALE_AFTER_MS = 10 min`** (`cancellation-registry.ts`), equal to `PUBLISHING_STALL_TIMEOUT_MS`, the longest stall the code already tolerates. I could not read real stage durations (no access to preview). A single long stage looks quiet from its start until it finishes, so a healthy `video_generation` longer than ten minutes would be treated as "not driven": a cancel then ends the run immediately instead of at the next loop step. That is harmless for the founder (the run ends sooner) but the in-flight stage still finishes its own spend. Founder, please run this and tell me if a healthy stage exceeds 10 minutes; if so raise the constant:

```sql
SELECT "stageName", max("completedAt" - "startedAt") AS longest FROM pipeline_stages WHERE status = 'completed' GROUP BY 1 ORDER BY 2 DESC;
```

**Driven tracking:** `driveFromCurrentStage` adds the run id on entry and removes it in a `finally` (a stage that throws leaves no entry; unit-tested). Not marked: the first `runIntakeStage` call and the single stage `resume-on-startup` re-runs before it hands over to the loop. A cancel in those short windows is treated as "not driven" and ends the run at once, which is safe.

**Stage-write guard (step 7):** `updatePipelineRun` now refuses every write to a run that is already `failed` with `Cancelled by user` (a conditional `update ... where NOT (status = 'failed' AND lastError = 'Cancelled by user')`; on no match it returns the stored row instead of throwing). The cancel's own write passes, so re-cancelling is idempotent. A late stage therefore cannot move a cancelled run back to `running`, change `currentStage`, or push it to `needs_attention`. Verified in the sandbox: a late `{status:'running', currentStage:'video_review'}` write returned `failed` / `video_generation` and the row was unchanged. It is one shared helper, so every stage benefits with no refactor.

**Remaining race:** an in-flight stage still finishes, and writes its own stage row (and spends its own LLM/TTS/video cost). Only the run row is protected. The stage's later steps inside the same call are not aborted (no `AbortController`, as in Task 11). The guard only matches the exact `Cancelled by user` text; a run ended some other way is not covered.

**Publish guard (step 6):** `runPublishingStage` returns the run untouched, before reading any stage rows or calling the upload, when `status !== 'running'` or the id is in the cancel registry (unit-tested). The loop's top-of-iteration registry check is unchanged.

`cancelRequested` is derived from memory (registry has the id and the run is not `completed`/`failed`); no schema change. After a restart it is false.

## R2: app

- `runs.cancel` result: `immediate && cancelled` shows a 5 s "Run cancelled" card and the screen switches to the existing ended screen (canvas row 4) after the refetch; `alreadyEnded` just refreshes with no confirmation. Both `runs.get` and `runs.list` are invalidated.
- "Cancelling…" comes from the server's `cancelRequested` (disabled button, polling every 3 s), so it survives leaving, tab switches and an app restart. After 60 s without the run ending the button reads "Couldn't cancel yet — try again" and re-enables (the timer restarts on each new request).
- Queue: an in-progress run with `cancelRequested` shows a "Cancelling…" chip.
- Cancel errors show as inline text under the button and the button re-enables. No new dependency.
- Not verified on a device.

## R3: receipts (`push-receipts.ts`)

- Send-time `error` tickets are logged (user id and message, never the token) and `DeviceNotRegistered` clears the user's token. **Expo's own error text echoes the token** (`"ExponentPushToken[...]" is not a registered push notification recipient ...`), found in the live check, so messages are redacted before logging (unit-tested). `ticket.details` is no longer logged.
- Accepted tickets are kept in memory `{ ticketId, userId, token, sentAt }`; a timer every 5 min (started at boot in `index.ts`, `unref`'d, cleared on process exit) reads receipts of tickets older than 2 min in chunks, logs error receipts, clears dead tokens, and drops anything older than 24 h unchecked. The list is lost on restart (accepted).
- A token is cleared only if it still equals the one that failed, so a user who has re-registered is not wiped by a late receipt (small addition to the spec).
- Every entry point catches and logs one line; a throwing receipt call neither crashes nor blocks a later send (unit-tested).
- **Live check** (sandbox database, real Expo API, fake well-formed token): Expo returned a `DeviceNotRegistered` ticket; the user's `expoPushToken` was cleared.
- Does any code read an FCM variable? **No.** Expo's push service uses the FCM V1 key stored in EAS; no server env var was added.

## R4: push registration (app)

- Registers on every launch with a session (effect in `auth.tsx`; waits out a `down` server and re-runs when it recovers; concurrent calls are de-duplicated). Web is skipped.
- The Android `default` channel (`setNotificationChannelAsync`, importance MAX) is created before the permission request.
- `setNotificationHandler` (banner + list + sound) is set once at module load, so a push while the app is open shows a banner; tapping still uses the existing deep-link handler in `_layout.tsx`.
- The token is sent to `notifications.registerPushToken` only when `userId:token` differs from the last one sent (SecureStore `sevenai.pushTokenSent`); sign-out clears it so the next sign-in re-registers.
- Account section: one new "Push" row under Version: `on`, `off (permission denied)`, `error: <short reason>`, or `checking…`. Additive edit next to the Admin row.
- Registration never throws; the failure reason is logged and kept for the status line.

## R5: FCM config

- `app/google-services.json` was moved (not copied) from `studio/google.services.json`. Verified without printing it: top-level keys `project_info`, `client`, `configuration_version`; `project_id` equals `ai-studio-9ef0c`; the package name equals `android.package` (`com.sevenai.studio`); no `private_key` field. It is committed (client configuration, not a secret, and not gitignored). `studio/google.services.json` no longer exists.
- `android.googleServicesFile: "./google-services.json"` added to `app/app.json`.
- Native fingerprint: the `runtimeVersion` policy is `fingerprint`. Computed locally with `expo-updates fingerprint:generate --platform android` on this tree: `21792d97e20611dcce5c433a9e1e2cdb1dbccb99`. EAS computes the real one at build time; confirm it from the build output.
- Android version code: `eas build:version:get -p android -e preview` reports **1**, and the `preview` profile has no `autoIncrement`, so the new build is also version code 1 (not plus 1). Uninstall the old app before installing, since a same-code sideload can be refused. If you would rather bump it, add `autoIncrement: true` to the preview profile before building; I did not touch `eas.json`.
- Other pending native changes bundled in this build: `expo-image-picker` plus its `app.json` plugin (UIEnhancement-3 FIX_5, watermark upload) is already on `main` and goes in with it. No other pending native change found in STATUS or the Sprint 4 / UI-UX docs.
- `studio/.env.local`: the founder's cleanup is done: `grep -c private_key` returns 0, no unusually long lines, and the file is gitignored (`.gitignore:8`).

## `.env.example` sync

Compared names only. After trimming whitespace, every one of the 16 names in `studio/.env.local` is already in `studio/.env.example` (a naive compare flagged `PEXELS_API_KEY`, which has a trailing space in `.env.local`; it is already in the example). Nothing was added, so there is no `BUGS_TASK10_ENV` commit. My code introduced no new variable. Names in `.env.example` and not in `.env.local` (informational, nothing deleted): `EXPO_ACCESS_TOKEN`, `PUBLIC_API_BASE_URL`, `R2_*`, `STOCK_FOOTAGE_STUB`, `YOUTUBE_STUB`.

## Verification

- studio: `npm run build`, `npm run typecheck`, `npm run lint` clean; `npx vitest run`: 261 passed, 49 skipped (41 files passed, 9 skipped, no failures). One unrelated stock-footage test timed out once under load (30 s ffmpeg stub) and passed on its own and on the next full run.
- app: `npx tsc --noEmit` clean; `npm run lint` shows only the pre-existing `expo-image-picker` `import/no-unresolved` described above.
- Sandbox: a throwaway database on the local Postgres (never `sevenai_dev` or `sevenai_preview`), created by `prisma migrate deploy`, used for the R1 and R3 live checks, then dropped. No server was started and no run was driven.
- New tests: `cancellation-registry.test.ts`, `pipeline-runner.cancel.test.ts` (driven tracking, `finally` cleanup after a thrown stage, loop cancel), `pipeline-run.repository.cancel.test.ts` (stage-write guard), `state-machine.publish-guard.test.ts`, `runs.cancel.test.ts` (all cancel outputs, stale threshold, `cancelRequested`), `push-receipts.test.ts`.

## Founder Actions (in order)

1. **Done 2026-10-06 by the founder:** FCM V1 service-account key uploaded to EAS for project `ai-studio-9ef0c`. (Not re-asked; I never handled it.)
2. Merge PR #52 and deploy the server. Confirm `git log -1 --oneline`, `pm2 status`, `npx prisma migrate status` (no migration in this task).
3. `eas build -p android --profile preview`. Note the Android version code (expected 1, see R5) and the `runtimeVersion` EAS prints. Uninstall the old app, install the new APK on the phone and sign in. **Every tester reinstalls once.**
4. Only after the new APK is installed, from the same commit: `eas update --branch preview`, so the OTA targets the new runtime.
5. Run `SELECT email, "expoPushToken" IS NOT NULL AS has_push_token FROM users;` and paste the result (never the token).
6. Trigger a Gate 1 request with the app **closed**: a push arrives, tapping it opens that run. Then with the app **open**: a banner appears. Check Account → Push reads `on`; also check `off (permission denied)` (deny the permission) and `error: ...` (airplane mode before launch).
7. Cancel checks (R1/R2):
   a. A stalled `running` run (after `pm2 restart sevenai` if needed): cancel it. "Run cancelled" shows, the ended screen appears at once, the Queue card goes away. `runs.get` shows `failed`, `Cancelled by user`.
   b. A run in `video_generation`: cancel it. "Cancelling…" shows; leave the run and come back, still "Cancelling…"; it ends at the next step with no further spend. Confirm no `youtubeVideoId` is ever set.
   c. Cancel a second time (tap twice quickly, or cancel an ended run from another screen): no error.
   d. Stop the server and tap Cancel: an inline error appears and the button re-enables.
   e. Run the stage-duration SQL above and tell me the longest healthy stage (R1 threshold).
