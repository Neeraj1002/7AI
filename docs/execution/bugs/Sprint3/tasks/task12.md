# Bugs Task 12: Sprint 3 Closing Task (stock fallback, Retry/Revise safety, crash-loop guard, dashboard counts, push, default budget, polish)

**Read `docs/execution/bugs/HOTFIXER_AGENT_PROTOCOL.md` and `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** They define the branch, worktree, commit, report and `STATUS.md` rules this task follows. This file states only this task's specifics.

**Objective**: close Sprint 3. Everything the founder found while testing on the preview server and the phone up to 2026-10-11, and every Sprint 3 item still open from Weeks 1-5 and Sprints 1-3, is in this one task, so that when it is merged, deployed and verified nothing is left open except the items that code cannot fix (listed in `KNOWN_ISSUES_AND_BLOCKERS.md`, Section 7) and the items the founder has moved to Sprint 4 (Section "Out of scope", below).
**Duration**: roughly 5-6 working days of agent time in total. BE lane about 3 days, APP lane about 1.5 days (in parallel), closure and docs about 1 day. Per item estimates are given below; the hot-fixer should report real hours.
**Depends On**: PR #56 and PR #57 merged and deployed (met 2026-10-10). Builds on Sprint 4 Task 8 (stock path, regeneration cap), Bugs Task 9 R4 (Retry starts a new attempt), Bugs Task 10 (`cancelRequested`), Bugs Task 11 (failure accounting), closure part 2 (P5, P8, P9, P10) and Sprint 3 Task 13 (attempt bundles).
**Owning Component**: orchestrator state machine, resume-on-startup, Video Generation, `runs.retry` and `runs.gate2`, push notifications, budget allocator, Dashboard repository, channels (YouTube status), and the app's Run, Queue, Inbox, Channels and Dashboard screens.
**Branches**: BE `BUGS_TASK12`, APP `BUGS_TASK12_APP`, each in its own worktree (Hard rule 4) cut from a fresh `origin/main`. Commits `BUGS_TASK12_R<X>: ...` (APP commits `BUGS_TASK12_APP_R<X>: ...`), closing commit `BUGS_TASK12_REPORT: ...`. Record both branches in `docs/execution/bugs/STATUS.md` before the first commit (the row for Task 12 already exists).
**Dispatch note**: the founder dispatched this task on 2026-10-11 with an item index in `Sprint3/tasks/task12.md` and the brief in chat. This document is the full written version of that index. **The IDs are unchanged (R1-R10, R12-R14, C1-C7, D1, F1-F10, U1-U19, tech-debt items 1-12). If the chat brief and this document differ on what an ID means, this document governs; say so in the report.** R11 is not used.

**Order of work**: R5 first (the server must not be able to crash-loop again), then R6 and R2, then R3, R1, R7, R8, R9, R10. The APP lane (R12, R13's app half, R14) runs in parallel. C1-C7 run once R5 is deployed. D1 is last. **Ship in waves**: after R5, R6 and R2 pass their tests, say so in the report's progress section and mark the PR ready so the founder can merge and deploy that wave, then continue. Deploy order for every wave is server first, then the OTA (`docs/server/usefulcmds.md`, "Phone build and OTA").

**Success Criteria** (this is also the Sprint 3 exit list, Section "Sprint 3 exit checklist"):
1. A run can no longer be left in `running` with no driver, a restart cannot loop on a run, and one run's failure cannot stop the server (R5).
2. Gate 2 sends one push per gate (plus the 4-hour reminder), Gate 1 pushes arrive, and the receipts are clean (R6).
3. Retry and Revise are capped, say why when refused, and never re-run a gate (R2, R5).
4. A stock-footage run that keeps failing video review gets one AI-stills attempt, disclosed on upload (R1).
5. The Dashboard separates failed, rejected and cancelled; the success rate reads sensibly (R3).
6. A new tenant gets a $10 weekly default, split equally across its YouTube-connected channels (R7).
7. The app shows "Reconnect needed" when YouTube access has expired, the watermark uploads, and the polish list is done (R12, R13, R14).
8. Every ID in Section "C" and "F" is either done with evidence or has a dated reason in the report, and the docs match the repo (C1-C7, D1, F1-F10).

---

## What happened, in plain words

- **Lego run, Underdogs, 2026-10-10** (stock footage). Three video attempts, each reviewed, each rejected for the same reason: the middle frame showed generic business-analytics footage, not Lego. After the second regeneration the cap was reached and the run stopped under Needs attention as "Video retry limit reached". Free stock libraries have no Lego-specific footage, and an abstract beat like "financial crisis" returns generic business clips.
- **A 29 Sept run** shows 11 `video generation` attempts, all FAILED, before the founder cancelled it. Nothing stops repeated manual Retry, and before P5 each failed render that had already paid for narration or stills booked `unknown` at $0.
- **The Dashboard** read "12 finished · 17 failed", "12 of 29 published", 41% success. On 2026-10-11 the founder ran the SQL: 42 runs in total, 18 completed, 21 failed (16 "Cancelled by user", 4 "Rejected at Gate 2", 1 "Rejected at Gate 1"), 2 needs_attention, 1 paused_gate2. Today's card read 18 of 39 (about 46%). Without cancellations it is 18 of 23 (about 78%). So cancelled runs were in the failed count, and so were rejections.
- **Underdogs run 072bce60-6593-454e-8858-f6f788206d46, "The 50/30/20 budgeting rule", 2026-10-10/11.** Revise at Gate 2 said "Video retry limit reached". The founder pressed Retry; the Run screen then showed "in progress" with only Cancel run, and no Gate 2 buttons. A `pm2 restart sevenai` was then run to try to recover it. The server went into a restart loop: the phone received a "Gate 2 - Underdogs (Re-sending after a restart...)" push every few seconds, about 8 stacked in a minute, and the app showed "Can't reach the server". The error log held only the line `[boot] PUBLIC_API_BASE_URL not set` repeated about 60 times and **no stack trace**. It was stopped with `pm2 stop sevenai`, the stuck rows were closed by hand in SQL (below), and `pm2 start` was then stable. The stage rows (UTC; the phone is UTC+5:30): `video_generation` attempts 1-3 from 20:25:31 to 20:31:05 with reviews; `gate2` attempt 1 from 20:31:29 to 20:36:40 (the Revise); `gate2` attempt 2 started 20:36:49 (the Retry) and never completed. The repeating log lines were: `[resume] run 072bce60-...: stage 'gate2' (attempt 2) was mid-flight when the process stopped - re-running it from its persisted input` and `[gate2] run 072bce60-...: re-opening an already-pending gate2 attempt 2 after a restart - re-sending the prompt`. Manual fix used: `update pipeline_stages set status='failed', error='Closed manually: gate2 retry loop' where "pipelineRunId"='072bce60-...' and "stageName"='gate2' and "attemptNumber"=2;` and `update pipeline_runs set status='failed', "lastError"='Cancelled by user' where id='072bce60-...';`.
- **Push**: Gate 2 pushes reach the phone, Gate 1 pushes do not. The Expo receipts for the tenant user show `DeveloperError` ("malformed or contained invalid parameters"). The cause is not known and message size is not an obvious one.
- **Phone tests on 2026-10-10 and 2026-10-11** also showed: the watermark upload fails with "Unsupported FormDataPart implementation" (a React Native multipart error: a form part without a `uri`); "YouTube connected" appears for a channel whose token has expired (`invalid_grant` is in the PM2 error log; the analytics poll snapshots only 11-12 of 16-17 published runs); the Run screen prints the whole brief in large bold type and pushes the stepper and the Published card off screen; the Queue subtitle truncates with three counts; the delete-channel warning shows even when nothing applies; the stepper of an ended run keeps an active ring; and the Published card still says "once the first poll runs" long after the first poll.

Dates in this document are the founder's local dates (IST); times in SQL rows and logs are UTC.

**Decisions (founder)**: fall back to an AI still for stock footage after the cap: **yes** (2026-10-10). Cap manual Retry: **yes** (2026-10-10). Exclude cancelled runs from the failed count: **yes**. Keep rejections in the count but call them **rejected**, not failed (2026-10-11). Underdogs captions off: **intended, no action** (R4). New-tenant default budget: **$10 per week, split equally across the channels with YouTube connected** (2026-10-11; this replaces the earlier "$5 per week" note and the old `$2.00` per day in `invite-tenant.ts`). Gate 1 pushes must work and Gate 2 must not repeat (2026-10-11). The `gpt-image-1.5` migration is **not** part of this task (it has its own note and a 2026-12-01 deadline).

## R1 (BE) - One AI-stills attempt after the stock-footage cap

**First, read** `run-pipeline/state-machine.ts` (the video-review regeneration cap and where it parks the run), `agents/video-generation/*` (the stock path, `stock-shotlist.ts`, the ai-stills path), `agents/publishing` (how `containsSyntheticMedia` is derived), and the planner's `visualSource` handling (Sprint 2 Task 2 E2: an explicit per-run `creationOptions.visualSource` beats the planner's choice). Run `git log origin/main -- <file>` on each shared file first and call the helpers that exist.

**Behaviour**
1. Applies only when the attempt that hit the regeneration cap used `visualSource: 'stock-footage'` and video review still rejected it. Runs already on `ai-stills` are untouched.
2. Instead of parking at `needs_attention`, the state machine makes **one** extra attempt: the same script and voice, re-planned with `visualSource` forced to `'ai-stills'` for this run. It does not count against the regeneration cap.
3. **At most once per run.** Persist a marker (prefer an existing JSON field such as `creationOptions`; a schema change means stop and ask the founder) so a restart, a resume or a manual Retry can never trigger a second fallback.
4. **Budget first.** Check `isBudgetAvailable` before the attempt. If refused, behave exactly as today (`needs_attention` with the budget message). That is a skipped fallback, not a failure.
5. If the fallback attempt is also rejected by video review, the run parks under `needs_attention` as today. No second fallback, no further automatic regeneration.
6. **Disclosure.** The upload of a fallback run must carry `containsSyntheticMedia: true`. It should follow from the final plan's `visualSource` (Sprint 2 Task 2 E4); prove it with a test, and fix it if the value is taken from somewhere that the switch does not update.
7. **Cost.** The attempt books like any ai-stills render: one `video-generation` usage event including the stills. Read the per-still price through `resolveImagePricing`; never hard-code $0.013 (the image model changes in `hardening-gpt-image-migration.md`).
8. **Visible to the founder.** The run's Details list gets one extra line, for example "Switched to AI stills after stock footage failed review", and the server logs `[video-fallback]` with the run id. Additive only; no change to the Gate 2 card, Queue or Inbox.
9. Do not change the reviewer, the cap of 2, or Task 9 R4's Retry behaviour.

**Not in this task** (candidates for later, for the founder to pull in): replacing single frames inside a stock video; feeding the reviewer's "replace frame N with ..." text into the next stock search; a planner rule that stock channels must use concrete, filmable search terms; a plain-language reason on the Run screen instead of only under Technical details. Say in the report if you saw a reason one of these is needed for R1 to work.

**Tests**: with the review mocked to reject, a stock run at the cap creates exactly one ai-stills attempt and then proceeds to review; a second rejection parks at `needs_attention` with no third attempt; a budget refusal parks with the budget message and no attempt; a restart in the middle of the fallback does not create a second one; the upload request for a fallback run says `containsSyntheticMedia: true`; a run that was already ai-stills never falls back.

**Live check**: re-run the Lego brief on Underdogs. If the stock path passes this time, record that and rely on a sandbox run with the reviewer forced to reject. Never use `sevenai_preview` directly (see the protocol); the founder pastes any SQL.

## R2 (BE + APP) - Cap manual Retry and Revise, and make Revise work at the cap (~3h)

Constant: `MAX_MANUAL_RETRIES_PER_STAGE = 3`, named and in one place so the number can change in one line.

**What the founder saw.** At Gate 2, "Revise" after the automatic regeneration cap (2 of 2) answered "Video retry limit reached" and led nowhere (see R5). So today Revise can dead-end, and Retry has no limit.

1. **What counts**: a manual Retry **or** a manual Revise that actually starts a new attempt of that stage. They share one counter per stage per run. **Does not count**: automatic backoff retries, automatic regeneration attempts after a video-review rejection, the R1 fallback attempt, a Retry the budget gate refuses (no attempt is created), and a Revise that is refused.
2. **Revise works until the cap.** A Revise at Gate 2 starts a new `video_generation` attempt carrying the founder's notes, even when the automatic regeneration cap has been reached; the automatic cap limits what the pipeline does by itself, not what the founder asks for. It is a manual action and counts toward the manual cap. A Revise at Gate 1 (script) follows the same counter.
3. **At the manual cap** `runs.retry` and the Revise path refuse with a clear message ("Retry limit reached for this step (3). Edit the brief and run again, or cancel."). Keep the existing explanation behaviour for budget refusals.
4. **App**: at the cap, "Retry this step" and "Revise" are shown disabled with that sentence under them; Cancel run and "Edit brief & run again" stay. This is the pattern closure part 2 P10 item 2 described for budget refusals (the Retry tap on a budget-refused run is also checked in C6).
5. **Counting**: first see whether the data already distinguishes a manual retry or revise (stage attempt rows, an event, a JSON field). Derive the count from what exists. A migration means stop and ask.
6. **Scope**: per stage, per run. A new run (Run again) starts at zero.

**Tests**: three manual actions succeed and the fourth is refused; Retry and Revise share the count; a budget-refused Retry does not count; automatic regeneration attempts and the R1 fallback do not count; Revise at the automatic cap starts a `video_generation` attempt and does **not** create a gate attempt (this is the R5 regression); the refusal text reaches the app. App: typecheck and lint; device check of the disabled buttons after the OTA (F9).

## R3 (BE) - Failed, rejected and cancelled on the Dashboard (~2h)

1. **Confirmed.** The founder ran the SQL on 2026-10-11 (`select status, left("lastError", 60), count(*) from pipeline_runs group by 1, 2 order by 3 desc;`): 42 runs, 18 completed, 21 failed (16 "Cancelled by user", 4 "Rejected at Gate 2", 1 "Rejected at Gate 1"), 2 needs_attention, 1 paused_gate2. Cancelled runs and rejections are both stored as `failed`.
2. **Definitions** (founder, 2026-10-11):
   - **Failed** = ended `failed`, not cancelled by the founder, not rejected at a gate.
   - **Rejected** = the founder rejected it at Gate 1 or Gate 2. **Kept in the count** (a rejection is a real outcome the pipeline produced) but **labelled "rejected", not "failed"**, with its own number on the card.
   - **Cancelled** = cancelled by the founder. Out of the failed count and out of the success-rate denominator. Shown in muted text next to the failed count ("n cancelled, not counted").
   - **Success rate** = published / (published + failed + rejected). Cancelled excluded.
   - With the figures above: 18 published, 0 failed, 5 rejected, so 18 of 23 (about 78%). The 2 needs_attention runs and the paused run are still in progress, not ended, so they are not counted. Check against the live numbers.
3. **One helper for each state**, shared with the Queue's Ended runs chips (closure part 2 P9: Cancelled, Rejected at Gate 1, Rejected at Gate 2, Completed, Failed). Prefer Bugs Task 10's `cancelRequested` and the stored end reason; older cancelled and rejected runs carry only the text in `lastError` ("Cancelled by user", "Rejected at Gate 1/2"), so accept both and say so in a comment. If P9's chips currently match text only, move them onto the helpers so the Dashboard and the Queue can never disagree.
4. **Per channel and All channels must reconcile** (the numbers matched across Underdogs, Not In Your Textbook and All channels in closure part 1; keep that true). Other cards (regen rate, spend, gates) are unchanged.
5. Files to check first: `dashboard.repository.ts`, the Queue's chip code, and the app's Dashboard card (label text and layout; keep the layout change minimal).

**Tests**: a fixture with published, failed, rejected (both gates) and cancelled runs (including legacy text-only rows) gives the expected counts and rate per channel and in total; the Queue chips and the Dashboard agree on the same fixture.

## R4 - No code: Underdogs captions are off on purpose

`captionsExpected: false` on the Underdogs run is intended. Record it in the report. Closure part 2's P8 "last caption held" does not apply to that channel. Nothing to build.

## R5 (BE, critical, do first) - Gate 2 Revise/Retry stall, resume loop and crash loop (~4h)

**Why this is first.** A normal founder action (Revise, then Retry, then a server restart to recover) took the preview server down in a restart loop and flooded the phone with pushes. The Sprint 3 STATUS file already recorded an unexplained version of the same failure class from Task 3's testing ("a run whose regeneration loop was mid-flight when the process was killed ... sat at `running` indefinitely"). It has now recurred, so it is a real defect.

**The evidence** is in "What happened" above (run `072bce60-6593-454e-8858-f6f788206d46`, the stage timeline, the two repeating log lines, the manual SQL). Reproduce it on a **sandbox database**, never on `sevenai_preview`.

**Observed chain**
1. The run reached the video-review automatic cap. Revise at Gate 2 ended `gate2` attempt 1 and the run parked at `needs_attention` / "Video retry limit reached (at video review)".
2. Retry created `gate2` attempt 2 (a gate stage) and set the run to `running`. No video render was started, no pending approval was registered, so the app showed only "Cancel run". Task 9 R4 (Retry starts a new attempt) was written for the video-review cap case; it appears to re-run whatever stage the run is parked on, and here that was a gate.
3. After `pm2 restart`, resume-on-startup found a `running` run whose latest stage was `gate2` attempt 2 and "re-ran it from its persisted input" (the first log line), which re-opened a gate with nothing behind it and re-sent the prompt (the second line).
4. The process then exited and PM2 restarted it, over and over, each boot re-sending the push. **The error log shows no stack trace**, only the boot warning, so the exit is not an ordinary logged exception. Find out how the process dies: `process.exit` calls, `unhandledRejection` / `uncaughtException` handling, an out-of-memory kill (`pm2 describe sevenai` shows the exit code and `free -m` on the VPS), a hang that PM2 kills, or a `max_memory_restart` setting. Check the PM2 **out** log as well as the error log.

**Required behaviour**
1. **Retry never re-runs a gate.** A Retry on a run parked by the video-review cap starts a new `video_generation` attempt (what Task 9 R4 intended). For any other parked stage it re-runs that stage only if the stage is retryable; a `gate1`/`gate2` stage is never "retried" (a gate is re-opened only by the B6 path for `paused_gate1`/`paused_gate2`). Find the exact reason Retry chose the gate (probably the run's `currentStage` after Revise) and fix that, not only the symptom.
2. **No zombie runs.** A run must not be left `running` with no live driver and no pending approval. Where Revise or Retry would leave one, set `needs_attention` with a plain reason instead. On boot, resume must treat a `running` run whose latest stage is a gate as `needs_attention` (reason recorded), never re-run it.
3. **Resume loop guard.** If a stage was started by resume and the process died again before the stage finished, the next boot must not resume it a second time without limit: allow at most 2 resumes of the same stage attempt within the stale window, then park the run at `needs_attention` with a `[resume-loop-guard]` prefix in `lastError` and skip it. Reuse existing columns or JSON; a migration means stop and ask.
4. **Isolation.** Each run resumes inside its own try/catch. An error or a rejected promise from one run's resume or driving loop is logged with its full stack and parks that run; it must not end the process. Add (or verify) `process.on('unhandledRejection')` and `process.on('uncaughtException')` handlers that log the full stack to stderr; decide per case whether the process can safely continue (run-scoped: yes) or must exit (the log must then say why).
5. **Cancel and fail resolve their Inbox cards.** When a run is cancelled, fails or is closed by hand, its pending `approval_request` notifications are marked resolved, so the Inbox cannot show a live Gate 2 card for a dead run. Verify what happens today (the loop left stale Gate 2 cards on the founder's Inbox) and fix it.
6. **Revise must work or say why** (R2).
7. The Run screen for a run that is `running` with nothing to do must not show only "Cancel run" with no explanation (U17).

**Tests** (sandbox DB, `vitest`): Revise at the automatic cap then Retry creates a `video_generation` attempt and no gate attempt; a fixture with a `running` run whose latest stage is `gate2` attempt 2 boots without re-running it and parks it; a run that "crashes" its resume twice is parked by the loop guard on the third boot; a resume that throws for run A does not stop run B or the process; cancelling a run resolves its pending notifications; a restart with a legitimately `paused_gate2` run still re-opens the gate (B6 must keep working) and sends no duplicate card.

**Live check** (founder, after deploy, F9): on preview, drive a run to the cap, press Revise, then Retry, then `pm2 restart sevenai`. Expected: no loop, `pm2 status` restart count steady, at most one push (R6), no stale Inbox card. Do **not** repeat the original failure on purpose against a run the founder cares about.

## R6 (BE) - Push: Gate 1 never arrives, Gate 2 repeats, receipts show DeveloperError (~4h)

1. **Gate 1 pushes do not arrive; Gate 2 pushes do.** Compare the two payloads field by field (title, body, `data`, `channelId`, `sound`, `priority`, `ttl`). Log the exact request and the Expo ticket and receipt for both. Expo's receipts for the tenant user show `DeveloperError`: "malformed or contained invalid parameters". Check the token format (`ExponentPushToken[...]`), duplicate or stale tokens for the tenant user (Bugs Task 10 R3 clears dead tokens; confirm it did not clear a good one), the Android channel id, and whether Gate 1's payload carries a field Expo rejects (an undefined value, a very long body that quotes the brief or script, a non-serialisable `data`). Fix the cause; if it is the payload, trim and sanitise it for both gates. Message size is not an obvious cause, so measure before assuming.
2. **Gate 2 repeats.** Every boot re-sent the Gate 2 push ("Re-sending after a restart"). Rule: a restart re-send reuses the open Inbox card (already built in PR #56) **and must not push again** if a push for the same run, stage and attempt was sent within `GATE_REMINDER_THRESHOLD_MS` (4 hours). Persist the "last pushed at" on the existing Notification row (existing JSON; no migration) or compute it from the row's own timestamps. The 4-hour reminder stays as it is.
3. **Circuit breaker.** Whatever the cause, never send more than 3 pushes to one user in any 60 seconds; log a single warning when the limit drops one. If Expo's push API supports a replace or collapse key, key pushes by run and stage so a phone shows one notification per gate.
4. **Old abandoned gates.** B6 re-opens every `paused_gate1/2` run on boot and has no staleness filter (Known Issues, Section 3). With R6.2 in place a boot no longer pushes for them; also list them in the boot log (count and ids) so abandoned dev rows are visible, and note in the report whether an "abandon this run" action or a days-long cut-off is worth a later task. Do not build it here.

**Tests**: a gate 1 and a gate 2 payload both pass Expo's validation (mock the SDK's chunking and assert shape; add a live call to Expo's API with a throwaway valid token if the founder agrees); three restarts with one pending gate send at most one push and create one Inbox card; the circuit breaker drops the fourth push in a minute and logs once; a legitimately new gate (new attempt) still pushes.

**Live check** (founder, F8): create a run on the tenant account, wait for Gate 1, confirm the push arrives; approve, wait for Gate 2, confirm one push; restart the server and confirm no second push. Then run the receipts SQL the report gives and paste it: no `DeveloperError`.

## R7 (BE) - Default tenant budget $10 a week, split equally across YouTube-connected channels (~2.5h)

**Decision (founder, 2026-10-11).** A new tenant gets a weekly budget of **$10** by default, and that budget is divided equally across the tenant's channels **that have YouTube connected**. This replaces the earlier "$5 per week" note. (Sprint 3 Task 4 seeded `$2.00` a day, but closure part 1 already removed that default: today `invite-tenant.ts` requires `--weekly-budget` and there is no default. R7 adds a real $10 default.)

**What exists today** (closure part 1, D4, `Sprint3/closureTask.md`): the tenant's weekly budget is one stored number (`AgentQuota.budgetCeilingUsd`); each **active** channel's ceiling is that number divided equally by the count of active channels; `budgetOverrideUsd` is validated on save against `MIN_CHANNEL_SHARE_USD = 5`; both a channel check and a tenant check run on every gate decision; the weekly window resets Monday 00:00 UTC; `scripts/invite-tenant.ts` now **requires** `--weekly-budget`.

**Changes**
1. `invite-tenant.ts`: `--weekly-budget` becomes optional and defaults to **10**. An explicit value still wins. Remove any remaining `$2.00` daily wording in code, help text and docs.
2. **The divisor**: count only active channels with a YouTube credential (the same `hasYoutubeCredential` check the app uses). A channel without YouTube cannot run (`assertChannelCanRun` already refuses it), so it should not reserve part of the budget. Use one helper for "channels that share the budget" and call it from the gate check, `dashboard.cost` and the channels screens, so they can never disagree. A channel that connects later joins the split from that moment (its siblings' effective ceilings fall; the existing "visible dilution" rule applies).
3. **Zero connected channels**: no per-channel share is shown or enforced; the tenant total still caps spend; nothing can run anyway. No division by zero.
4. **Overrides** keep their current validation. Check that the validation uses the same divisor (a tenant with 3 channels, 1 connected, must not be refused for an override that would only matter if all 3 shared).
5. **Existing tenants are not changed.** The founder's own tenant stays at its stored $40. Do not run an update over existing rows.
6. **A thing to flag, not to decide.** At $10 a week, one or two connected channels get $10 or $5 each, which is at the `MIN_CHANNEL_SHARE_USD` floor. With three or more connected channels the equal share falls below $5 (about $3.33 for three). The floor currently guards overrides, not the equal split, so nothing breaks, but the app already flags dilution below the $20-per-channel guide. Report what the Dashboard and the channel screens show in that case and whether any run is refused because of it. The founder decides later whether the floor should also gate the equal split.

**Tests**: a tenant with the default gets 10; 1, 2 and 3 connected channels split it 10, 5 and 3.33 each; an unconnected channel gets no share and its connection changes the siblings' shares; zero connected channels does not throw; an override is validated against the connected count; an explicit `--weekly-budget` still wins; the Dashboard and the gate check give the same ceiling for the same channel.

## R8 (BE, answer or fix) - Stock path raises no longest-shot warning (~1h)

Stock renders with 7.0 to 7.6 s shots had an empty `softWarnings`, while earlier runs with 6.0 to 6.6 s shots warned ("Longest single shot is 6.6s (spec: <= 4s)"). Decide and record which it is: (a) the stock path is exempt on purpose (then write the reason in a code comment and in the report, and make sure the reviewer is not told the spec is 4 s for stock), or (b) it is a bug, in which case add the same soft warning for stock. Also answer: does the end tail add to the last shot, or is it inside it (the three Lego attempts are similar, which suggests inside)? No behaviour change beyond the warning. See `Sprint3/reports/closure2-phone-verification.md` (F5).

## R9 (docs + a check) - Bugs Task 7 (bug-report triage fields) is superseded (~0.5h)

Bugs Task 7 was never dispatched. `bugs.updateTriage` already covers the admin half. Founder decision, to be recorded: **close R1 and R3 if the columns exist** (the founder pastes `\d bug_reports`, F3) and **defer R2, the tester-facing type and priority chips, to Sprint 4**. Update `Sprint3/tasks/task7.md` and its STATUS row to "Closed - superseded by `bugs.updateTriage`; R2 deferred to Sprint 4" with the evidence. If the columns are missing, say so and stop; do not build the chips here.

## R10 (BE) - Tech-debt batch, items 1-12 (~5h in total; each item stops at 1 hour)

All small, none blocking. Do them after R1-R9. If an item grows past about an hour, stop, write what you found, and list it in the report as open. Items 9-12 come from Known Issues and Sprint 3 STATUS and were not in the first list.

1. **`.env.example` is stale** (missing `AI_VISUALS_STUB`, `YOUTUBE_ANALYTICS_STUB`, `FOUNDER_DIGEST_*`, the `R2_*` set, `PUBLIC_API_BASE_URL`, `MIN_CHANNEL_SHARE_USD` if it is an env value, the stub flags added since Week 5). Reconcile it with the code and `docs/server/deployment/preview/detail.md`.
2. **No lint rule** enforces "only `client.ts` and `registry.ts` are imported directly" in `studio/src/llm/` and `studio/src/media/`. Add an ESLint `no-restricted-imports` (or equivalent) rule; fix or list any current violation.
3. **`script_review` has no budget check** of its own (overshoot is about a cent). Add the check, or write down in the code why it is skipped. Prefer adding it if it is one call.
4. **Intake parsing model tier.** An older note says it runs on the premium tier (`claude-sonnet-5`) although `AGENT_FLEET_DESIGN.md` 8.1 classes it as cheap and fast; the repo's Known Issues (Section 2, C1) says it was moved to the cheap tier on 2026-09-13. Read `llm/registry.ts`. If it is already cheap, close the item with that evidence; if not, move it once a quality check on three real briefs passes.
5. **API boot gates on `API_AUTH_TOKEN` alone**, not `JWT_SECRET`. Make boot validate the variables the server really needs (both), with a clear message.
6. **`pipeline_runs.retryCount` is a dead column.** Do not drop it (a migration means stop and ask). Confirm nothing reads or writes it and add a comment on the schema field plus a Known Issues line.
7. **Performance Analytics polls every historical video forever.** Cap the work: skip videos older than a window (propose 30 days) after one final snapshot, and skip channels whose YouTube access needs reconnecting (R13) without logging an error per tick. Keep existing snapshots readable. Report the quota effect.
8. **Watermarks uploaded before Task 12 (Sprint 3) have no R2 mirror.** Write a one-off, idempotent backfill script (`scripts/`) that uploads each existing local watermark to R2 and sets `watermarkR2Key`; the founder runs it on preview.
9. **Abandoned paused gates**: covered by R6.4 (list at boot, decide later). Close this item with that evidence.
10. **`R2_TOKEN_VALUE`** is in the preview `.env` but is not part of the S3-style variable set. `grep -rn "R2_TOKEN_VALUE" studio/src`; if no code reads it, say so in the report and remove it from the docs and `.env.example`. (Do not touch the real `.env` on the server.)
11. **`PUBLIC_API_BASE_URL` boot warning**: production prints `[boot] PUBLIC_API_BASE_URL not set` on every start and the magic-link text then shows localhost. Keep the warning (once per boot), make the message say which file to set it in, and add the variable to the deployment doc and `.env.example` (the founder sets the value on the VPS, F1).
12. **Automated test for the 7-channel cap** ("create 7, assert the 8th is refused") exists only as a live exercise (Sprint 3 Task 6). Add the unit/integration test. (A `vitest` suite of 260+ tests exists, so the old "no test runner" line is already closed in the repo's Known Issues.)

## R12 (APP, with a BE check) - Watermark upload fails with "Unsupported FormDataPart implementation" (~1.5h)

On the phone, "Upload logo" on a channel's settings fails with **Unsupported FormDataPart implementation**. That is the React Native (Android) multipart error raised when a form part is not `{ uri, name, type }` (for example a `Blob` or `File` from the web, or a part with no `uri`). It is almost certainly an app-side bug, JS-only, so an OTA fixes it.

1. In the app's upload code, build the part as `form.append('file', { uri, name, type } as any)` from the `expo-image-picker` result (`uri`, `fileName` or a generated name, `mimeType`). Do not set the `Content-Type` header by hand on the request; let React Native add the multipart boundary.
2. Confirm the field name and the size and type limits against the server route (`@fastify/multipart`, Sprint 3 Task 9 R3). Fix whichever side is wrong; say which.
3. Show a clear error for a too-large or wrong-type file (the server's message), not the raw React Native error.
4. **Device checks** (the founder, F6): upload a logo; leave the screen and come back (it persists); cold-start the app and check again; render a short video and see the mark; remove it and see it gone. Capture screenshots into the report. This is also the open "watermark persistence" check.

## R13 (BE + APP) - "Reconnect needed" when YouTube access has expired (~3h)

**Why.** The OAuth consent screen is still in Testing, so every authorisation expires 7 days after consent (Known Issues, Section 1). When it does, the PM2 error log shows `invalid_grant`, the analytics poll snapshots only some of the published runs (11-12 of 16-17), a publish would fail, and yet the app says "YouTube connected" because that label only means a credential exists. The expiry itself cannot be fixed by code (it moves to the "not fixable" list); what code can fix is saying so.

1. **BE**: when a token refresh fails with `invalid_grant` (in the analytics poll, in a publish, or when the connect status is read), record that this channel's YouTube access needs reconnecting. Use the existing `AgentCredential` fields or its JSON; if neither can hold it, stop and ask (a migration). Clear the flag when the founder reconnects successfully.
2. `channels.list` and `channels.get` add `youtubeStatus: 'connected' | 'needs_reconnect' | 'not_connected'`. Keep `hasYoutubeCredential` unchanged so the current app keeps working. A channel that `needs_reconnect` still counts as connected for R7's budget split (the credential exists); say so in the report.
3. A publish that fails on `invalid_grant` ends in `needs_attention` with the plain sentence "YouTube access expired. Reconnect this channel, then press Retry." It must not retry in a loop (Bugs Task 8/B4 already stops ambiguous upload retries; keep it that way).
4. **APP**: the Channels list and the channel screen show "Reconnect needed" in amber with the existing Connect button; the New brief channel picker and the Queue tell the founder before a run is started on such a channel (a hint, not a block; publishing is where it fails). The Dashboard "Views and likes show up on the Dashboard once the first poll runs" line (U10) must read "YouTube needs reconnecting" for that channel.
5. The analytics poll skips channels that need reconnecting, and logs one line per channel per tick (R10.7).

**Tests**: a mocked `invalid_grant` flips the status to `needs_reconnect`; a successful reconnect clears it; the poll skips it quietly; the publish message; `youtubeStatus` for the three states.

## R14 (APP) - Polish list U1-U19 (~5h)

JS-only, shipped by OTA. Most are one line each. Every item needs a before and after screenshot in the report (the Definition of Done for UI work). If an item turns out to need a server change, say so and move on.

| ID | Item | Where it came from |
|---|---|---|
| U1 | The reminder "Notice" card text keeps the "Topic:" prefix, so it reads `Reminder: "Topic: ...`. Drop the prefix. | closure part 2 phone test |
| U2 | The floating "New brief" button covers the last card in Ended runs (and Queue). Add bottom padding to the lists. | same |
| U3 | Two runs of the same brief look identical apart from status and time. Show the attempt number or a short run id. | same |
| U4 | Gate 1 outcomes read "Edited" in the chart and "revised" in the Approval gates text. Use one word. | same |
| U5 | The stepper of a cancelled or rejected run keeps an active ring on its last or Gate 2 step. Show an ended state instead. | same, and Test channel screens 2026-10-10 |
| U6 | The "Approve script" button label breaks mid-word on the Inbox card. | same |
| U7 | The Content performance chart runs past the right edge of its card. Fit it, or confirm the sideways scroll is intended and show it is scrollable. | same |
| U8 | The reviewer text at the top of Details has no heading. | same |
| U9 | FAILED rows give no reason. Tapping an attempt shows its error. | same |
| U10 | "Views and likes show up on the Dashboard once the first poll runs" was still shown 19 hours after upload (closure part 2) and 38 minutes after upload (the Mudlarks run). Show the real state (waiting for the first poll / last updated / needs reconnecting, see R13). | same, and Mudlarks run |
| U11 | Not In Your Textbook cards have no colour dot (channel colour probably unset). Give it a default colour or set one. | same |
| U12 | The Needs attention card title truncates ("Account spend limit reached: $1.7..."). Allow two lines. | same |
| U13 | The plain-language line for the retry cap says only "Video retry limit reached". Say what happened and what the founder can do (Retry, Revise, Edit brief), using the reviewer's reason from Details. | same, and Gate 2 Revise |
| U14 | The Queue subtitle truncates when it shows three counts ("1 in pr..."). | 2026-10-11 screenshots |
| U15 | The Run screen prints the whole brief in large bold type, pushing the stepper and the Published card off screen. Clamp the brief to 3 lines with "Show more", normal weight. | same |
| U16 | The delete-channel warning shows all its lines even when none applies. Show only the lines that apply to this channel (in-progress runs, YouTube connected, history kept). | Delete "Test channel" screen |
| U17 | A run that is `running` with nothing to do shows only "Cancel run". Say "Nothing to approve right now" and, if it has been more than a few minutes with no stage change, offer the reason and the actions that are safe (depends on R5). | Gate 2 Revise/Retry stall |
| U18 | At the manual cap, Retry and Revise are disabled with a sentence (R2); make sure the sentence fits and is not clipped. | R2 |
| U19 | Stale Inbox cards: an `approval_request` card for a run that has ended (cancelled, failed, rejected) must not show Approve/Reject; show it as resolved or hide it (depends on R5.5; this covers cards already created). | restart loop |

Also fix, if found on the way: the Queue and Inbox must not crash or hang when the server is unreachable (the "Can't reach the server" screen works and was verified; keep its "Try again" and Switch server links).

## C1-C7 (Closure carry-over; closure agent or hot-fixer with the founder's phone) (~6h, mostly waiting on the phone)

These are the items from `Sprint3/closureTask2.md` and its report that are not finished. They start once R5 is deployed, because several need a stable server. Test first: no code for a report until it reproduces on the deployed build.

| ID | Item | Source |
|---|---|---|
| C1 | **The 24-report triage** (P2-P4): re-test each open bug report on the real build with the founder's phone, close or fix it, record the verdict with `bugs.updateTriage`. | `closureTask2.md` P2 |
| C2 | **Reports 12 to 15 in detail** (P3), including whether the stock clips changed between attempts (use the Task 13 attempt bundle; see F4). | `closureTask2.md` P3 |
| C3 | **Leftovers of closure part 1** (P4: R7, R8, R9, Appendix A) and the image-cost rows (R1 step 7, which overlaps Sprint 4 Task 8). | `closureTask2.md` P4 |
| C4 | **P5 live proof**: a real render failure after paid calls books a real `video-generation` row (provider, model, cost) and not `unknown`. Only provable when one happens; until then it stays "mock tests only" in the report. | `closureTask2.md` P5 |
| C5 | **`Sprint3/reports/closure2.md`** completed: status per P-item, the 24-report table, the stock long-shot answer (R8), the Underdogs captions answer (R4), and what is left. | closure agent |
| C6 | **The Retry tap on a budget-refused run.** **Verified by the founder on 2026-10-11**: pressing Retry on a budget-refused run refuses again, as designed. Nothing to build; if a screenshot of the refusal exists, attach it to the report. | `closure2-phone-verification.md` |
| C7 | **Checks that need real conditions**: the "Failed" chip in Ended runs (cannot be forced; cover with a fixture test and say so), the "Channel deleted" chip, and the quality line in the app at the next Gate 2. P7 (resolved gate cards) is verify-only and was seen working. | same |

## D1 (Docs) - Bring the docs up to date and match the repo (~2h)

Last. The repo's docs and the Project's docs must say the same thing, and nothing may still claim an item is open that this task closed.

1. `docs/execution/bugs/STATUS.md`: Task 12 row final; Task 7 closed as superseded; closure rows final; the "Current state" paragraph rewritten.
2. `docs/execution/sprint3/STATUS.md`: Task 10, 11, 12 and 13 reports and PR merge states; remove the "reports not synced" notes; mark Sprint 3 **closed** with the date and the exit checklist below.
3. `docs/execution/KNOWN_ISSUES_AND_BLOCKERS.md`: Section 7 "Not fixable by code" and the 2026-10-11 status block are added; mark the Gate 2 too-large-video item (Section 5) obsolete; point the findings F1, F2, F4 at this report; close the items this task closes (R7, R10.7, R13) with the report as evidence.
4. `docs/execution/ui-ux/STATUS.md` and the UI/UX task docs 3-6: Done only with the OnePlus screenshots (F5).
5. `docs/server/usefulcmds.md` and the deployment doc: `PUBLIC_API_BASE_URL`, the restart recovery recipe (stop first, read the error log, close the run, start), the receipts SQL, the push breaker.
6. The playbook's interim "no straight quotes" rule can be dropped: the Lego brief with straight quotes passed script generation and Gate 1 on 2026-10-10 (Bugs Task 11 follow-up).
7. Record the founder's decisions: the search-grounded Script Review fact-check (Sprint 4 or not), the usage-event provider/model naming (Known Issues Section 4, still marked a judgment call), and Bugs Task 7's chips (Sprint 4 or closed).
8. Add the new rows to `Sprint3/reports/task12.md`'s "files touched" list and make sure the Project copy equals the repo copy (the founder syncs `D:\Study Material\7AI\docs`).

## F1-F10 (Founder checklist)

Not code. The agent lists each in the report with the founder's answer or the reason it is still open.

| ID | Action | When |
|---|---|---|
| F1 | On the VPS set `PUBLIC_API_BASE_URL=https://7aistudio.tech` in `/var/www/7AI/studio/.env`, then `pm2 restart sevenai --update-env`. Look at the Queue first: do not restart while a run is mid-flight before R5 is deployed. | **Done 2026-10-11** (pm2 log: `injected env` count 22 to 23, and no `PUBLIC_API_BASE_URL not set` line after the restart). The magic-link text itself was not re-checked. |
| F2 | Housekeeping: confirm the founder tenant's weekly ceiling is 40 (`select "budgetCeilingUsd" from agent_quotas where "tenantId"='d0617c67-b7bd-47b1-9501-d316d2d66a15';`), and run the Bugs Task 11 usage SQL from `Sprint3/reports/task11.md` and record the result. | **Done 2026-10-11.** Ceiling is 40.00. Usage SQL: 36 `unknown/unknown` $0 rows (31 on 2026-09-28, 1 on 09-29, 1 on 09-30, 3 on 10-07) and 6 `gpt-image-1.5` $0 rows on 09-28; nothing dated after 2026-10-07, so none after the Task 11 report (10-08) or the closure part 2 failed-render fix. No recurrence, but the failed-render booking is still unproven live (C4). |
| F3 | Paste `\d bug_reports` (decides R9). | **Done 2026-10-11**: the table on `sevenai_preview` has `area`, `priority`, `reportType` (not null, default `bug`) and `triageNote`; no extra index. R9 can close Task 7 R1 and R3. |
| F4 | Task 13 bundles: `select "attemptNumber", output->>'r2BundlePrefix' from pipeline_stages where "stageName"='video_generation' order by "startedAt" desc limit 5;` and look in the bucket for objects under `videos/production/`. Tells us whether Task 13 is live on preview and answers C2's clip question. | **Done 2026-10-11: Task 13 is live on preview.** Run `072bce60` has bundle prefixes for attempts 1, 2, 3 and run `3511ce98` for attempt 1; the R2 bucket `7ai-preview` shows the run folders under `videos/production/drafts/<tenant>/` (10 runs) and 5 final MP4s under `final/`. The attempt subfolders `1/ 2/ 3/` were not opened. The newest `video_generation` row (attempt 1) has no prefix (cause not checked). C2 can now compare attempts 1 to 3 of `072bce60`. |
| F5 | UI/UX tasks 3, 4, 5, 6: OnePlus screenshots for the reports (Definition of Done). Task 4's watermark sign-off (E8) waits for R12. | After R12 OTA |
| F6 | Remaining phone checks: cold start; cursor colour; watermark persistence (R12); "Decision sent"; "Cancelling..."; the Gate 1 script and review text clamp (U15); Sign in. | After the OTA |
| F7 | YouTube: reconnect each channel whose token expired; confirm the redirect URI is registered on the Web client; Google OAuth production verification; Cloud Console quota figures (Sprint 3 Task 4, L2). | **Done 2026-10-11 (founder).** YouTube connect works with `YOUTUBE_REDIRECT_URI=https://7aistudio.tech/oauth2callback`, registered in the Google Console. The founder accepts reconnecting the channels every week. **Google production verification is out of scope** (not applying). The Console quota figures were not recorded and are not pursued. |
| F8 | Push check after R6: Gate 1 push arrives, Gate 2 pushes once, a restart sends nothing new; paste the receipts SQL. | After the wave 1 deploy |
| F9 | Verify on preview after deploy: Revise then Retry at the cap does not stall; manual cap message; rejected/cancelled/failed on the Dashboard; the $10 default and the split; "Reconnect needed". | After each deploy |
| F10 | Merge the BE and APP PRs, deploy server first and then the OTA (`git status` clean in `app/`, lockfile committed, `npx expo-updates fingerprint:generate --platform android` before `eas update --branch preview`; fully close and reopen the app to apply). | Per wave |

## Sprint 3 exit checklist

Sprint 3 is closed when every row is either **Verified** (with the evidence named) or **Moved** (to Sprint 4 or to the not-fixable list, with the reason). Status as of 2026-10-11.

| Item (source) | Closes in | Status now |
|---|---|---|
| Task 7/O1 on-device push (Sprint 3 STATUS) | R6, F8 | Partly verified: Gate 2 pushes arrive on the phone; Gate 1 pushes do not |
| Task 5 core claim: publish and poll through the per-channel credential | R13 | Verified by real publishes on 2026-10-10; expired tokens handled by R13 |
| Task 4/L2 Cloud Console quota check | F7 | Partly: the founder confirmed "100 accounts for testing" on 2026-10-11, which is the Testing-mode test-user cap; the YouTube API quota numbers in the Console are still unchecked |
| Task 10 R2 on-device server switcher | - | Verified (presets, "Can't reach the server" screen) |
| Task 3 resume-loop edge case | R5 | Open; recurred 2026-10-10 |
| B6 re-sends for old paused gates | R6.4 | Open |
| Bugs Task 10 device checks (push, cancel) | F6, F8 | Cancel works; "Cancelling..." capture and push open |
| Bugs Task 11 follow-ups | D1.6, F2 | Verified on preview; playbook rule to drop |
| Closure part 1 phone checks | C7 | Verified except the Failed chip |
| Closure part 2 | C1-C7 | Code items verified 2026-10-10; triage and report open |
| UI/UX tasks 3-6 | F5, R12, R14 | Built; need screenshots |
| Sprint 3 Task 13 | F4 | Built and merged (PR #47); whether bundles appear on preview is unknown until F4 |
| Bugs Task 7 | R9, F3 | Columns confirmed on preview (F3, 2026-10-11). R1 and R3 closed; R2 (tester chips) moved to Sprint 4. The hot-fixer still updates `task7.md` and its STATUS row in the repo |
| Known Issues Section 4: new-tenant default budget of $2.00 "never confirmed" | R7 | Superseded: the founder set $10 a week on 2026-10-11 (closure part 1 had already removed the $2.00 default; the script required `--weekly-budget`) |
| Known Issues Section 2 C2: pooled budget fair access | R7 | Closed in the repo copy (equal split, Week 5 C2) and refined by D4 and R7 |
| Known Issues Section 4: Performance Analytics polls every video forever | R10.7 | Open |
| Known Issues Section 1: OAuth redirect URI registration | - | Verified in use: channels connect and publish through `https://7aistudio.tech/oauth2callback` |
| Known Issues Section 1: H1 custom-thumbnail 403 (needs YouTube phone verification) | - | Moved to Sprint 4 (`hardening-thumbnail-phone-verification.md`); not fixable by code |
| Known Issues Section 1: G1 YouTube Analytics API (`watchTimeMinutes`, `retentionPct`) | - | Not built; needs a new OAuth scope and consent; Sprint 4 |
| Known Issues Section 4: stock footage and abstract topics | R1 | Open |
| Script Review fact-checking (Known Issues Section 6) | D1.7 | A plausibility flag exists (Week 5 C3); a search-grounded fact-check is listed under "Not yet built". Proposed for Sprint 4; founder confirms |
| Known Issues Section 5: watermark overlay never exercised | - | Closed (Task 9 R3 live check) |
| Known Issues Section 5: P5 live proof | C4 | Mock tests only |
| Known Issues Section 5: transient LLM/media retry path | - | Accepted as untested (low risk) |
| Gate 2 too-large-video fallback (Known Issues Section 5) | D1.3 | Obsolete since Telegram was retired in Task 7; mark it so. (The dry-run Telegram line and the "no test runner" line are already closed in the repo copy.) |
| Doc drift | D1 | Open |

## Task 12 hot-fixer report: status as of 2026-10-11 (architect review)

The hot-fixer pushed `BUGS_TASK12` (draft PR #58) and `BUGS_TASK12_APP` (no PR yet) and wrote `Sprint3/reports/task12.md`. Everything is backed by unit tests with mocked repositories (server 397 passed, 49 skipped; app `tsc` and `expo lint` clean). Nothing has run against preview, a sandbox database or a phone.

**Done in code (to verify live):** R1, R2, R3, R5, R6, R7, R10 (except below), R12, R13, R14 U1-U16 (U11 partly).

**Not done, and where each goes**

| Item | State | Goes to |
|---|---|---|
| D1 (docs) | Hot-fixer could not read the Project copies | Architect (this sync) |
| R9 | `\d bug_reports` received 2026-10-11 (columns present) | Hot-fixer closes Task 7 R1/R3 in the repo docs; R2 to Sprint 4 |
| R10.3 | Left as is, reason in the report | Moved: Sprint 4 candidate (confirm after reading the reason) |
| R10.10 | Not fixed | Moved: Sprint 4 candidate |
| U11 per-channel colour | Invisible dot fixed (white on white); a per-channel colour setting needs a design decision | Moved: Sprint 4 |
| U18, U19 | Need a phone | Founder F-lane |
| C1-C7, F1-F10 | Open | Founder / closure agent |

**Architect conditions before merging to `main`**

1. **R5 needs a real-database run first.** Mocked tests do not prove the crash-loop fix. Run reject, cap, Revise, Retry, `pm2 restart` on a sandbox database or on a preview deploy of `BUGS_TASK12`, and check for `[resume-repair]`, `[exit]` and `[fatal]` in the log and exactly one Gate 1 push. The silent-exit cause is a hypothesis; the new exit and fatal log lines name the real cause if the loop returns.
2. **CORS.** `CORS_ALLOWED_ORIGINS` now gates browser clients. The native app is unaffected. Any admin web screen or web build must have its origin listed before deploy, or it breaks.
3. **Resume wording.** The report says a failing run is parked "after two tries" and also "immediately on a throw, on the third boot for a hang". The hot-fixer should state one rule; F1 is tested against it.
4. **OTA.** Do not run `eas update` until `fingerprint:generate` is run from a normal checkout (not the junctioned worktree) and compared with the installed build. The branch changes no native or dependency files.
5. **App branch PR.** `BUGS_TASK12_APP` needs a PR.

**Decisions**

- **Abandoned-gate staleness: 7 days, confirmed by the founder 2026-10-11 (the hot-fixer used 14; change it to 7).** Testing-mode YouTube tokens expire after 7 days, so a gate older than that will likely fail at publish with `invalid_grant`.
- **`MIN_CHANNEL_SHARE_USD`: keep the constant as a guard on overrides only, do not enforce it at run time, and fix the dilution warning that wrongly says runs will be refused. Confirmed by the founder 2026-10-11.** The tenant budget is the real cap. With $10 and three or more connected channels each share is below $5 (about $3.33 for three), so the founder raises the tenant budget by hand.
- **Gate 1 push cause is unconfirmed.** The only concrete difference found is that its body carried the whole brief and script. F8 receipts decide.
- **`invite-tenant.ts`** required an explicit weekly figure and did not write $2 a day; it now defaults to $10.

## Out of scope (moved, with the reason)

- **`gpt-image-1.5` migration** (shuts down 2026-12-01): own note, `Sprint3/tasks/hardening-gpt-image-migration.md`; target merged and deployed by 2026-11-15.
- **YouTube thumbnail 403**: Sprint 4 (`Sprint4/tasks/hardening-thumbnail-phone-verification.md`).
- **Bugs Task 7 R2** (tester-facing type and priority chips): Sprint 4.
- **Script Review factual check**: proposed for Sprint 4, a product decision.
- **R1 directions (b) to (d)** from the Lego finding (feed the reviewer's replacement text into the next search, concrete search terms for stock channels, a plain-language reason on the Run screen beyond U13).
- **No self-serve signup**: unchanged by design until a real product decision. (CORS was permissive; R10.12 now makes it an allow-list, `CORS_ALLOWED_ORIGINS`. Check the admin screens and any web build before deploying; see the report status below.)
- **Abandoned-gate action** (an "abandon this run" button or a days-long cut-off): noted by R6.4, not built.
- **Not fixable by code** (Known Issues, new Section 7): the OAuth Testing-mode 7-day expiry and the 100 test-user cap (accepted 2026-10-11: weekly reconnect, no production verification); free stock libraries holding no concrete footage for abstract topics (R1 limits the damage); the broader `youtube` scope needed for `videos.delete`; the narrow upload-in-flight idempotency window (YouTube's `videos.insert` takes no idempotency key); YouTube's thumbnail permission rules for unverified channels; OpenAI's unpublished price and the founder's approval of the new image look; Expo push delivery depending on Google's and Expo's services (receipts arrive late and cannot be guaranteed); the Windows process-tree note for kill tests (methodology, not code).

## Schema Impact

None expected. R1's marker, R2's counter, R5's loop guard, R6's last-pushed time and R13's reconnect flag must live in existing columns or JSON. If any cannot, **stop and ask**; do not write a migration.

## Business Logic / State Transition

R1 adds one automatic transition after the stock-footage regeneration cap (a single forced ai-stills attempt, guarded by a persisted marker and the budget gate). R2 adds a refusal after the manual cap and makes Revise a manual action that bypasses the automatic cap. R5 removes two transitions (Retry into a gate; resume of a `running` gate stage) and adds one (a resume-loop guard to `needs_attention`). R6 adds a rate rule to push sending. R7 changes how a channel's ceiling is computed (connected channels, $10 default). R3 is read-side only. R13 adds a derived channel status.

## Testing

```bash
npm run build && npm run lint && npm run typecheck
npx vitest run
cd app && npm run typecheck && npm run lint    # APP lane
```

Plus the live checks named in each item, run on a sandbox database. **Never connect a checkout to `sevenai_preview`** (see the protocol); the founder runs any SQL on the VPS. Shipping: BE items are backend deploys. APP items are JS-only: `eas update --branch preview` after `git status` is clean in `app/` and `npx expo-updates fingerprint:generate --platform android` matches the installed build (see `docs/server/usefulcmds.md`, "Phone build and OTA").

## Report Template

`docs/execution/bugs/Sprint3/reports/task12.md`. Include: per ID, done, skipped or open and why; hours spent per item against the estimates; the R5 reproduction and the way the process died; the Expo payload comparison and receipts for R6; the R7 behaviour at 3 connected channels; every file touched that PR #46, #47, #56 or #57 had changed, and why; screenshots for R12 and U1-U19; F1-F10 with the founder's answers; the exit checklist filled in; what is left open.

## Git Workflow

Two branches, `BUGS_TASK12` (BE) and `BUGS_TASK12_APP` (APP), each off a fresh `origin/main` in its own worktree (Hard rule 4). One commit per item (`BUGS_TASK12_R1`, `_R2`, ...), then `BUGS_TASK12_REPORT`. Draft PR after the first push; `gh pr ready` for a wave when its tests pass and the report's progress section says so. Never push or merge to `main`.

## Links & References
- `docs/execution/bugs/Sprint3/reports/closure2-phone-verification.md` (findings F1-F11 and the evidence)
- `docs/execution/bugs/Sprint3/closureTask.md` (D4 budget model) and `closureTask2.md` (P2-P10)
- `docs/execution/bugs/Sprint3/tasks/task9.md` (R4: Retry starts a new attempt), `task10.md` (`cancelRequested`), `task7.md` (triage fields)
- `docs/execution/sprint3/reports/task13.md` (attempt bundles) and `docs/execution/sprint3/STATUS.md` (open items carried forward)
- `docs/execution/sprint4/reports/task8.md` (stock shot list, regeneration cap)
- `docs/execution/bugs/Sprint3/tasks/hardening-gpt-image-migration.md` (out of scope here; the still price will change, read it through `resolveImagePricing`)
- `docs/execution/KNOWN_ISSUES_AND_BLOCKERS.md`
