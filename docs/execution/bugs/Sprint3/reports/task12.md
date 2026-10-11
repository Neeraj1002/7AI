# Bugs Task 12: Sprint 3 Closing Task

**Date**: 2026-10-11
**Branches**: BE `BUGS_TASK12` (draft PR #58), APP `BUGS_TASK12_APP` (pushed, no PR yet: see "Open")
**Status**: Code complete for the BE and APP lanes. Not deployed, not verified on the preview or on a phone. Closure lane, D1 and the Founder checklist are open.
**Tests**: server `npx tsc --noEmit`, `npx eslint src`, `npx vitest run`: 397 passed, 49 skipped (the skipped are the existing DB-backed files). App `npx tsc --noEmit` and `npx expo lint`: clean.

Nothing here was run against `sevenai_preview`, a sandbox database or a phone. Every behaviour below is proven by unit tests with mocked repositories, not by a live run. The "Live check" steps for R1, R5 and R6 are therefore **not done** and are in the Founder checklist and Open list.

## Per item

| Item | State | Notes |
|---|---|---|
| R1 stock -> AI-stills fallback | Done (tests) | `runVideoReviewStage`: at the cap, a stock-footage plan, no `creationOptions.videoFallbackUsed`, and `checkBudget` ok -> one more attempt with `creationOptions.visualSource='ai-stills'`, marker persisted in the same transaction. Budget refusal parks as before and does not consume the marker. Second rejection parks. Logs `[video-fallback]`; adds a `system` ReviewLog row and `runs.get.videoFallbackUsed`; the app shows "Switched to AI stills after stock footage failed review" in Details. `containsSyntheticMedia` is read from the latest attempt's plan (`deriveContainsSyntheticMedia`, tested). Cost uses the existing ai-stills path, no hard-coded price. Live Lego re-run: not done. |
| R2 manual cap | Done (tests) | `MAX_MANUAL_RETRIES_PER_STAGE = 3` in `run-pipeline/manual-retries.ts`. Counted per stage in `creationOptions.manualRetries` (no migration; `retryCount` is used for resume attempts instead, see R10.6). Budget-refused Retry/Revise throws before counting; regeneration and the R1 fallback never count. `runs.get.manualRetry` tells the app; Retry and Revise show disabled with the sentence under them. `runs.rerun` strips the counters. |
| R3 dashboard counts | Done (tests), app card done | One helper `run-pipeline/end-reason.ts` (`classifyEndError`, `tallyEndedRuns`). `successRate` now has `published/failed/rejected/cancelled`; rate = published/(published+failed+rejected). The app card reads "N published · N failed · N rejected" plus a muted "N cancelled (not counted)". Channel-deleted runs count with cancelled. Ended-runs chips (`endedChip`) already matched on the same texts; I did not move them onto a shared module because the app cannot import server code at runtime (comment points to the server file). SQL result below. |
| R4 | Recorded | Underdogs `captionsExpected: false` is intended; P8 "last caption held" does not apply to that channel. |
| R5 | Done (tests), live check not done | See answers below. |
| R6 | Done (tests), live check not done | See below. |
| R7 | Done (tests) | See table below. |
| R8 | Answered, no code | See below. |
| R9 | Pending founder | `schema.prisma` has `reportType`, `priority`, `area`, `triageNote` and `bugs.updateTriage` exists. Confirm with `\d bug_reports` on the VPS; then Task 7 can be marked superseded (STATUS row updated to say so provisionally). Nothing built. |
| R10 | Done except where noted | See below. |
| R12 watermark | Done (OTA), not seen on a phone | Branch on `Platform.OS === 'web' && asset.file`, otherwise always send `{uri,name,type}`. Likely cause: newer expo-image-picker exposes `asset.file` on native, so the old `if (asset.file)` sent a part with no `uri`. Not reproduced on a device. |
| R13 reconnect needed | Done (BE + app), not on a phone | `invalid_grant` is recorded in `Channel.brandAssets.youtubeAuthError` (existing JSON, no migration), set by the publish failure path and the analytics poll, cleared by the OAuth exchange. `channels.get/list` expose `youtubeNeedsReconnect`; the Channels list, Channel detail and picker show "Reconnect needed"; New brief shows a hint; a publish that fails this way says so in plain words. |
| R14 U1 | Done | Reminder text strips `Topic:` at the source (`formatGateReminder`) and in the Inbox for old rows. |
| U2 | Done | List bottom padding = button height + margin + 48. |
| U3 | Done | Start date/time on Queue and Ended cards. |
| U4 | Done | "Revised" in both places. |
| U5 | Done | `Stepper ended` shows a stop marker, no active ring. |
| U6 | Done | Gate 1 button reads "Approve". |
| U7 | Done (unverified visually) | Chart width measured from the card, `adjustToWidth`. |
| U8, U9 | Done | "Reviewer's reason" / "Last error" heading; a FAILED row opens its plain-words reason with the technical text under it. |
| U10 | Done | The post-publish hint shows only for 6 hours after upload; Dashboard says "No data yet." |
| U11 | Fixed the visible bug, setting deferred | The dot used the tile's foreground, which is white on the black tile (channel #2), so it vanished. Channel settings has no colour setting; colour is by channel position. A per-channel colour setting needs a field and a design decision: deferred. |
| U12 | Done | Needs-attention title on two lines. |
| U13 | Done | "Stock footage did not match your topic after N tries. Retry, edit the brief, or cancel." (AI-stills wording differs); technical text stays under Technical details. |
| U14 | Done | "N waiting · N need attention · N running". |
| U15 | Done for the brief; script/review clamp already existed | Brief clamped to 3 lines. Not seen on a phone. |
| U16 | Done | Warning lists only running runs and the YouTube connection if they apply. |
| U17 | = R13 | |
| U18, U19 | Not done | Need a phone (Founder F6). |
| C1-C7 | Not done | Closure agent and founder phone time. |
| D1 | Not done | I cannot read the Project copies from here, so no comparison was possible. |

## R5 answers (code reading plus unit tests, not reproduced on a sandbox)

1. **Revise refused.** `runGate2Stage`'s Revise branch applied the automatic regeneration cap (`videoGenStage.attemptNumber <= MAX_VIDEO_REGEN_ATTEMPTS`) to a human Revise. At attempt 3 it parked the run under Needs attention. Fixed: Revise always starts a new video attempt and is limited only by the manual cap (R2), refused up front in `runs.gate2` with the reason.
2. **Retry made a gate2 attempt.** `runs.retry` re-entered the runner at `run.currentStage`, which was `gate2`, so `runGate2Stage` ran as a stage. Fixed: `retryTargetStage` maps gate2 -> video_generation and gate1 -> script_generation; a gate is only opened by the pipeline moving forward.
3. **Running at a gate with no way to act.** `runGate2Stage` assumed the caller had already set `paused_gate2` and never set it itself. After Retry set `running`, the gate attempt opened under `running` and the app, which shows Approve/Reject/Revise only for `paused_gate2`, showed only "Cancel run". Fixed: both gate stages set `paused_gateN` when they open; boot repairs any run left `running` at a gate (`[resume-repair]`) without re-running it.
4. **Silent exit.** **Unproven hypothesis, from code reading:** `resumeOnStartup` *awaited* `runGate2Stage`, which blocks on a human reply, before `startApiServer` and the pollers ran; with only an in-memory promise pending (and the receipt timer unref'd) Node's event loop empties and the process exits quietly, PM2 restarts it, and each boot re-sent the push. That matches "no stack trace, about one boot per second, a push per boot", but I could not observe it. Changes: resumed stages now run in the background (boot never waits on a render or a gate); each run's resume is wrapped; `retryCount` counts resumes that started but did not finish and the third boot parks the run under Needs attention; `unhandledRejection`/`uncaughtException` log the stack; an `exit` handler logs the exit code and uptime; the boot line logs pid and the PM2 restart count if PM2 provides it. **If the loop returns, the new `[exit]` / `[fatal]` lines will name the cause.**

Deviation: a resume that *throws* is parked immediately rather than after a second try (retrying a deterministic error on the next boot helps nobody). A resume that never returns (process death) is parked on the third boot, as specified.

R5f: a run that becomes `failed` or `completed` resolves its open Inbox cards inside `updatePipelineRun` (covers cancel, reject and failure). R5g: see R6.

**One-time cleanup SQL for stale Gate 2 cards** (the founder runs it; I did not touch preview). Review the SELECT first:

```sql
SELECT n.id, n."threadKey", r.status, n."createdAt"
FROM notifications n JOIN pipeline_runs r ON r.id::text = n."threadKey"
WHERE n.kind = 'approval_request' AND n."resolvedAt" IS NULL AND r.status IN ('failed','completed');
-- then, if the rows are what you expect:
UPDATE notifications n SET "resolvedAt" = now()
FROM pipeline_runs r
WHERE r.id::text = n."threadKey" AND n.kind = 'approval_request' AND n."resolvedAt" IS NULL AND r.status IN ('failed','completed');
```

## R6

- **Gate 1 never arrives.** Not verified against a receipt. The one concrete difference I found between the two payloads: Gate 1's push `body` was the whole message (brief + full script + review notes, easily over a kilobyte), Gate 2's was a few lines. Pushes are now a short summary (`buildPushBody`, 180 characters; the full text stays in the Inbox row). If receipts still say `DeveloperError`, receipts now log `details`, and each push logs `user, token (last 6), kind, bodyChars, ticket id`. A `DeveloperError` never clears a token (only `DeviceNotRegistered` does, unchanged).
- **Repeats.** `decideApprovalPush` (pure, tested): an open card + a notification of any kind for that thread in the last 30 minutes -> no push; older -> one "Reminder:" push, which also writes a `notify` row so the next restart sees it; a gate open longer than 7 days -> reopened silently. Uses existing `notifications` rows (no column). Env: `GATE_RESEND_PUSH_WINDOW_MS`, `GATE_RESEND_STALE_DAYS`. The "per boot cap" is covered by the persisted window.
- Collapse-by-tag was not added: the Expo SDK version here has no collapse field; the dedupe makes stacking impossible instead.

## R3 evidence

The F4 SQL result as given in the task brief (42 runs): 18 completed, 21 failed (16 "Cancelled by user", 4 "Rejected at Gate 2", 1 "Rejected at Gate 1"), 2 needs_attention, 1 paused_gate2. I did not run the SQL. Under the new definitions: published 18, failed 0, rejected 5, cancelled 16, rate 18/23 = 78%. The new tests use this shape. Needs-attention runs are now outside the rate (they were inside it after Closure R3 D2; the task text asked for this definition, so I followed it).

## R7 outcome

How it works: the pool is `AgentQuota.budgetCeilingUsd` for a 7-day window starting Monday 00:00 UTC (so "per week" is what the code does). Each channel with no override gets `(pool - overrides) / number of default-share channels`. **Change:** only active channels that have a YouTube credential are counted; an unconnected channel takes no share, and connecting or disconnecting re-divides at once. New tenants: `invite-tenant.ts` now defaults to `DEFAULT_WEEKLY_BUDGET_USD = 10` (the old requirement to pass `--weekly-budget` from Closure R1 D4 is lifted; the flag still overrides). The brief said the script wrote "$2.00 per day"; it actually required an explicit weekly figure.

| Connected channels | Share each of $10 | Under the $5 minimum? |
|---|---|---|
| 1 | $10.00 | no |
| 2 | $5.00 | no (exactly) |
| 3 | $3.33 | yes |
| 7 | $1.43 | yes |

**The minimum is not enforced at run time.** `MIN_CHANNEL_SHARE_USD` is used only when someone sets a channel override (`validateBudgetOverride` refuses an override that would leave another channel under $5) and in warning text. `checkBudget` refuses a run only when spend reaches the channel's share. `budgetDilutionWarning` says runs "will be refused" below the minimum, which is not true. I did not change the constant. Options for the founder: (a) lower it to $3 or less, (b) make it a fraction of the pool, (c) leave it, and reword the warning. A run on a channel that has lost its connection is bounded by the pool only. Existing tenants (the founder's ceiling of 40) are untouched.

## R8

**Intended.** `collectSoftWarnings` raises the long-shot warning only for `ai-stills`; stock footage is judged by "a cut per beat" (`minBeats`), because stock clips are longer by design. So 7.0-7.6 s stock shots giving no warning is not a bug. The end tail is a `tpad` clone hold on the final frame of the whole video, and shot detection looks for scene cuts, so in principle the ~1 s tail extends the last shot; the three Lego attempts were similar, which does not contradict that, but I have not measured it.

## R10

1. `.env.example` reconciled with `env.ts` (stub flags, timers, new resend/CORS variables). `R2_TOKEN_VALUE` is read by no code (only a comment in `env.ts`); noted in the file.
2. ESLint `no-restricted-imports` for `llm|media` `client`/`registry` outside those folders; one violation fixed (`media/index.ts` now re-exports `resolveMediaPurpose`).
3. `script_review` budget check: **left as is.** It follows a `script_generation` that was just budget-checked; adding a gate here would park a run after a script was already paid for, to save about a cent.
4. Intake parsing is on `claude-haiku-4-5` in `llm/registry.ts` (confirmed).
5. Boot: in production a missing `JWT_SECRET` now stops the API boot with a clear message; the API still starts with either credential, so the ops fallback works.
6. `retryCount` is no longer dead: it counts resumes (R5d). R2 uses `creationOptions.manualRetries` because it needs a count per stage.
7. Analytics: a video older than 30 days gets one final snapshot and is then skipped; a channel with `invalid_grant` is marked and skipped (one log line when first detected).
8. `scripts/backfill-watermark-r2.ts` (dry run by default, `--apply`), for the founder to run.
9. Transient-path tests added: media 429/500/503 and 400, LLM 429.
10. A script too long for 60 s can **still** end at the cap: the duration check fails the review, the regen notes cannot shorten a script that TTS reads word for word. Not fixed; Sprint 4 candidate (show the estimated duration at Gate 1).
11. A fenced model reply is covered by `extract-json.test.ts` (closed and unclosed fence). Closed.
12. CORS: allow-list from `CORS_ALLOWED_ORIGINS` plus the origin of `PUBLIC_API_BASE_URL`; no `Origin` (the native app) is always allowed; localhost allowed outside production. **Deploy note:** a browser client on another origin will now be refused until it is listed.

## Files that PRs #46, #47, #56 or #57 also changed, and why I touched them

`state-machine.ts` (gate parking, Revise, R1 fallback, R13 message), `runs.ts` (retry/revise caps, `endReason` helper, `runs.get` fields, rerun), `index.ts` (fatal handlers, boot log), `notification.repository.ts` (resend state query), `gate-reminder.ts` (Topic prefix), `agents/video-generation/index.ts` (one import moved for the lint rule), and in the app `dashboard.tsx`, `index.tsx` (Queue), `notifications.tsx`, `run/[id].tsx`, `run-labels.ts` (all polish items), plus `bugs/STATUS.md`. All edits were additive or local to the lines named.

## Open / for the founder

- **Deploy and check** (F1, F8): repeat reject -> cap -> Revise -> Retry -> `pm2 restart` on a throwaway run and watch for `[resume-repair]`, `[exit]`, `[fatal]`; confirm a Gate 1 push arrives, once.
- **OTA**: `BUGS_TASK12_APP` is JS-only. `package.json`, the lockfile and `app.json` are unchanged against `origin/main`. I did **not** run `eas update`, and I did not get a trustworthy `fingerprint:generate` (the worktree shares `node_modules` by junction, so the paths in the output point at another checkout): run it from a normal checkout of the branch and compare with the installed build before publishing. Open the APP PR when you want one (I opened only the BE draft PR).
- **Decisions** (F9): `MIN_CHANNEL_SHARE_USD` (R7 options above), the 7-day gate staleness, the weekly assumption (confirmed from the code).
- **R9**: paste `\d bug_reports`.
- **Sprint 4 hand-off**: per-channel colour setting; estimated duration at Gate 1 (R10.10); the stock-path ideas listed under R1 "Not in this task"; reword `budgetDilutionWarning`.
- Closure lane C1-C7, D1 and Founder rows F2-F7, F10 are unchanged by this work.

## Founder checklist state

F1 pending deploy. F2 open. F3 open. F4 open (`PUBLIC_API_BASE_URL`). F5 open. F6 open (needs the OTA). F7 open. F8 pending deploy. F9 decisions listed above. F10 open.
