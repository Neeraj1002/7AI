# Closure Part 2: Founder Phone and Server Verification, 2026-10-10

**Purpose**: a record of what the founder tested on the preview server and the phone on 2026-10-10, after PR #56 and
PR #57 (`Sprint3_CLOSURE2`) were merged and deployed. It lists what is closed, what is still open, what the tests
taught us, and the decisions that wait on the founder. It is a companion to `Sprint3/closureTask2.md`. It does not
replace the closure agent's own report (`Sprint3/reports/closure2.md`), which must still carry the 24-report triage.

**Update, 2026-10-10 (later the same day)**: the founder decided F1, F2, F4 and F6 (see Decisions below); the code changes are written up as Bugs Task 12 (`Sprint3/tasks/task12.md`), and the process habits from F9 are now in `docs/server/usefulcmds.md`.

**Update, 2026-10-11 (what the next day's tests settled).** Sprint 3 is now closed by one task, **Bugs Task 12** (`Sprint3/tasks/task12.md`), which carries everything below that is still open.

- **Closed on 2026-10-11 (founder)**: the restart-duplicate check passed (a restart with a pending gate left no duplicate Inbox card); Retry on a budget-refused run refuses again, as designed; the "Can't reach the server" screen works; Delete channel works (soft archive); the New brief unconnected-channel hint and picker copy are right; the Queue "In progress" section works; PRs for Bugs Tasks 4 and 5 are merged; the keyboard overlap is accepted as done.
- **F4 confirmed** (SQL): 42 runs: 18 completed, 21 failed (16 "Cancelled by user", 4 "Rejected at Gate 2", 1 "Rejected at Gate 1"), 2 needs_attention, 1 paused_gate2. Cancelled runs and rejections were both counted as failed. **Decided**: cancelled out of the count; rejections kept and labelled "rejected" (Task 12 R3).
- **New bug: Revise then Retry at Gate 2 after the regeneration cap (run `072bce60`).** Revise said "Video retry limit reached"; Retry created a Gate 2 attempt 2 with no pending approval, so the Run screen showed only Cancel run. A `pm2 restart` then made resume re-run that gate stage, and the server went into a restart loop with a Gate 2 push on every boot (about 8 stacked in a minute) and "Can't reach the server" in the app. The error log showed only the `PUBLIC_API_BASE_URL` boot warning, no stack trace. It was stopped with `pm2 stop`, the stage and run were closed by hand in SQL, and `pm2 start` was stable. Task 12 R5 (first item).
- **New bug: push.** Gate 1 pushes never arrive; Gate 2 pushes do; Expo's receipts show `DeveloperError` for the tenant user (Task 12 R6).
- **New bug: watermark upload** fails on the phone with "Unsupported FormDataPart implementation" (Task 12 R12). **"YouTube connected" is shown for an expired token** (Task 12 R13; the cause, Testing-mode tokens expiring after 7 days, is not fixable by code).
- **Decisions (founder, 2026-10-11)**: rejections labelled "rejected"; new-tenant default budget $10 a week split equally across YouTube-connected channels (Task 12 R7); thumbnail 403 and Bugs Task 7's tester chips move to Sprint 4; the Gate 1 push and the Gate 2 repeat are bugs to fix (R6).
- **Still open for Task 12**: C1-C7 (the 24-report triage, reports 12-15, leftovers, P5 live proof, the report), the phone captures in F6 (cold start, cursor colour, watermark persistence, "Decision sent", "Cancelling...", Gate 1 script/review clamp, Sign in), and the small UI items below (now U1-U19).

**Evidence**: the founder's phone screenshots and the SQL and shell output pasted into the architect chat on
2026-10-10. The architect chat has no direct access to `sevenai_preview`. Times in SQL rows are UTC; the phone shows
local time (IST, UTC+5:30).

## Test environment

- Server: `/var/www/7AI` at `690d2b1` ("New apk creation clean up"), equal to `origin/main`. PM2 `sevenai` online
  (up 2 days, 13 restarts in total). `prisma migrate status` on `sevenai_preview`: 19 migrations, schema up to date.
- `.env`: `NODE_ENV=production`. `AI_VISUALS_STUB`, `MEDIA_STUB`, `STOCK_FOOTAGE_STUB` and `DATA_DIR` are not set, so
  defaults apply. Real spend was booked during the tests, so the stubs are off.
- R2 variable names present: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT`,
  `R2_REGION`, `R2_TOKEN_VALUE`. `R2_TOKEN_VALUE` is not part of the usual S3-style set; whether any code reads it
  was not checked (`grep -rn "R2_TOKEN_VALUE" src`).
- Audio beds: `calm`, `inspirational`, `mysterious`, `tense`, `upbeat` (.mp3) in `studio/data/audio-beds/`, all dated
  2026-10-07.
- Phone: the latest APK (founder-confirmed; built from the fresh lockfile commit). The phone showed the PR #56 and
  PR #57 app changes.
- Weekly budget back at $40 (Dashboard: $1.72 of $40.00).

## Closed (verified on preview, 2026-10-10)

| Item | Evidence |
|---|---|
| P1 deploy checks | The commit, PM2, migration, R2 names, stub flags and audio-bed checks above. |
| PR #56 Inbox labels | Pending cards say "Script approval" and "Video approval" with no suffix. Resolved cards say "Script approval · Approved", "Script approval · Script edited" and "Video approval · Approved". The reminder "Notice" card was seen. Inbox cards show the brief's topic line. |
| P9 Ended runs | Collapsed section in the Queue. Chips seen: Completed, Cancelled, Rejected at Gate 1, Rejected at Gate 2. "Show more" loads the next page (dates continue back to 28 Sept). A cancelled 29 Sept run was found, opened and its Details read; "Run again" and "Edit brief & run again" are offered. Topic lines show on Queue and Inbox cards. |
| P10 item 1 | Details prints "gate 1" and "gate 2" with a space. (Item 2, the disabled Retry on a budget refusal, was skipped on purpose, as the task allowed.) |
| Details list, failed state (P2 row 11) | The red `FAILED` label on all 11 `video generation` attempts of a cancelled 29 Sept Not In Your Textbook run, with a "Cancelled by user" line above the list. `done` and `skipped (not run)` were seen on 2026-10-08. |
| Needs attention state | Budget refusal: "Account spend limit reached: $1.76 used of $0.01 this week. Resets Monday 00:00 UTC. (at video generation)". Retry cap: "Video retry limit reached (at video review)". Both show "Retry this step" and "Cancel run", and a cancelled run lands in Ended runs as Cancelled. |
| P8 end tail | By ear: audio stops at 0:45 and the video ends at 0:46, so about 1 s (design value 0.7 s; the readings are whole seconds). No change to `END_TAIL_SECONDS`. The metrics are in the table below. |
| Dashboard label | "$0.25 per published video (all time, not this week)". |
| Bugs Task 11 on a curly-quote brief | The 1351 Statute of Labourers brief (curly quotes) reached Gate 1 on the first attempt with a 9/10 review. The exact first sentence, the hedge words and the exact last sentence all held. The earlier failure was the leftover $0.01 budget, not the quotes. The Lego brief (straight quotes) also passed script generation and Gate 1. |
| Gate 2 and publish | Queue shows "Gate 2 · Video" under Waiting on you. The Inbox card shows "Video review: pass" and YouTube visibility Private, Unlisted or Public (default Private, button "Approve & upload as private"). After approval the run showed "Published to YouTube" and every stage in Details, including analytics, as done. |

### Quality metrics read from `pipeline_stages.output` (video_review rows)

| Run | Path | Integrated LUFS | True peak | Longest shot | Shots | Soft warnings | Captions |
|---|---|---|---|---|---|---|---|
| Diocletian (Not In Your Textbook), 17:44 UTC | ai-stills | -14.1 | -1.4 | 3.47 s | 20 | none | expected and detected |
| Lego (Underdogs), 18:23 UTC, attempts 1/2/3 | stock footage | -14.1 / -14.0 / -14.1 | -1.5 / -1.4 / -1.4 | 7.33 / 7.63 / 7.0 s | 8 / 7 / 8 | none | not expected |
| Earlier run, 2026-10-08 21:38 UTC | not recorded | -14.0 | -1.4 | 6.63 s | 15 | "Longest single shot is 6.6s (spec: ≤ 4s)" | expected and detected |
| Earlier run, 2026-10-08 04:12 UTC | not recorded | -14.0 | -1.5 | 5.97 s | 13 | "Longest single shot is 6.0s (spec: ≤ 4s)" | expected and detected |

The metrics object has no duration field, so the tail length rests on the ear reading. Average fps was 29.96 to 29.98 on
the stock path and 30 on the stills path. A true peak of -1.4 dBTP is 0.1 dB above the -1.5 target figure and raised
no warning.

## Still open

| Item | Why it is open | Owner and timing |
|---|---|---|
| Retry tap on a budget-refused run | **Verified 2026-10-11 by the founder: Retry refuses again, as designed.** A screenshot, if one exists, goes in the report (Task 12 C6). | Done. |
| Restart-duplicate check | **Passed 2026-10-11** (no duplicate Inbox card after a restart with a pending gate). Re-check once after Task 12 R5 and R6 are deployed (F9). | Done; one re-check. |
| Dashboard "17 failed" | **Confirmed 2026-10-11** (see the update above). Fix decided and widened to rejections (Task 12 R3). | Task 12 R3. |
| Failed chip in Ended runs | Never seen. Cancelled runs show Cancelled, and runs that stop on a budget refusal or the retry cap stay under Needs attention until cancelled. It cannot be forced on demand. The "Channel deleted" chip was not seen either. | Cover through the triage evidence or the agent's tests. |
| P5 failed-render spend | Mock tests only. Live proof needs a real render failure after paid calls; then run the P5 SQL in `closureTask2.md`. | Founder, when a real failure occurs. |
| Quality line in the app | Nothing shows on the phone after publish. It was not checked while a run waited at Gate 2. The numbers were read from the database instead. | Check at the next Gate 2. |
| Stock-path long-shot warning | See F5. (The Underdogs captions question is resolved: intended.) | Closure agent, in the P8 section of `closure2.md`. |
| 24-report triage, reports 12-15 answers, P6 docs sync, `closure2.md` | Not part of the phone checks. | Closure agent. |
| Telegram | **Not applicable**: Telegram was retired in Sprint 3 Task 7. | None. |

## What we know after these tests

**F1. Stock footage cannot cover abstract topics, and the run just stops.** Lego brief on Underdogs (stock footage),
2026-10-10: three `video generation` and three `video review` attempts all finished as `done`. The reviewer rejected the
middle frame each time as generic business-analytics footage unrelated to Lego, the regeneration cap (2) was reached, and the
run stopped under Needs attention as "Video retry limit reached". Likely cause: free stock libraries hold no
Lego-specific footage, and an abstract beat such as "financial crisis" returns generic business clips. Directions, for the founder to
choose from: (a) when the reviewer still rejects a frame after the cap, replace that frame with an AI still instead of failing
the run; (b) feed the reviewer's "replace frame N with ..." text into the next stock search query; (c) a planner rule for stock
channels that every search query names something concrete and filmable; (d) show the reviewer's reason in plain language on the
Run screen instead of only under Technical details. Not known: whether the clips changed between the three attempts
(needs the attempt bundle; this is the same question as reports 14-16 and closure part 1's clip skip), and what a Retry at
this cap produces on a stock run (Bugs Task 9 R4 made Retry start a new attempt; the outcome of the Lego run was not
recorded). **Decision, 2026-10-10**: direction (a), built as Bugs Task 12 R1 (one extra attempt in which the whole video switches to AI stills). Directions (b) to (d) stay candidates.

**F2. Manual Retry has no cap.** A cancelled 29 Sept Not In Your Textbook run shows 11 `video generation` attempts, all
FAILED. Before P5, every failed render that had already paid for narration, transcription or stills booked provider
`unknown` at $0, so that period's spend on the Dashboard was understated, and those old rows stay `unknown`. P5 books the real
cost from now on. **Decision, 2026-10-10**: cap manual Retry at 3 per stage per run, built as Bugs Task 12 R2.

**F3. How the run states look.** A budget refusal and the regeneration cap both leave the run under Needs attention (amber)
with Retry and Cancel until the founder acts, and Cancel gives the Cancelled chip. The red FAILED label appears only on a stage
attempt that threw an error. A run stopped by the regeneration cap shows every stage row as `done`; its reason sits only in
the text above the list, which has no heading.

**F4. Cancelled runs probably count as failed on the Dashboard (unconfirmed).** The Dashboard reads "12 finished · 17
failed", "12 of 29 published" and a 41% success rate. Ended runs derives Cancelled from the run's `lastError`, which suggests
cancelled runs are stored as failed. To confirm:
`select status, left("lastError", 60), count(*) from pipeline_runs group by 1, 2 order by 3 desc;`. If confirmed, exclude
user-cancelled runs from both the failed count and the denominator (`dashboard.repository.ts`). **Decision, 2026-10-10**: yes, built as Bugs Task 12 R3 (which starts by confirming with this SQL).

**F5. The stock path raises no long-shot warning.** The Lego attempts have shots of 7.0 to 7.6 s and an empty
`softWarnings`, while the two earlier runs with 6.6 s and 6.0 s shots did warn. Either the stock path is exempt on purpose or
it is a bug. Also unanswered: whether the tail adds to the last shot (the three attempts are similar, which suggests not).

**F6. Underdogs rendered without captions (resolved 2026-10-10: intended).** `captionsExpected` was false on the Lego run, while Not In Your Textbook runs expect and detect captions. The founder confirmed that captions are off on purpose for Underdogs, so nothing is wrong, and the "last caption held" part of P8 does not apply to that channel.

**F7. The end tail is fine.** About 1 s by ear on the Diocletian run; the last shot stayed at or under the 3.47 s longest
shot, so the tail did not push it past 4 s.

**F8. Loudness is stable.** Every run measured sits at -14.0 to -14.1 LUFS and -1.4 to -1.5 dBTP.

**F9. Process lessons.** (a) The ceiling test left at $0.01 caused two false failures: a refused run mistaken for a script
failure on 2026-10-08, and a refused video stage on 2026-10-10. Restore 40 straight after any ceiling test; the failure text
shows "of $0.01" when it is the cause. (b) The earlier APK and OTA mismatch came from a modified, uncommitted `app/package-lock.json` in the
checkout EAS built from. Run `git status` in `app/` before `eas build`, commit the lockfile after any `npm install`, and check
`npx expo-updates fingerprint:generate --platform android` against the build's runtime before `eas update`. These habits are now in
`docs/server/usefulcmds.md` ("Phone build and OTA", and the ceiling reset under Prisma / Database), added 2026-10-10.

**F10. Script Review still has no factual check** (`KNOWN_ISSUES_AND_BLOCKERS.md` Section 4). A wage figure in the 1351
script ("three pence a day" for a master carpenter) was flagged for a source check before approval; the outcome was not recorded.

**F11. The image-model deadline is unchanged.** `gpt-image-1.5` shuts down on 2026-12-01; the task note is
`Sprint3/tasks/hardening-gpt-image-migration.md` and its start condition (PR #57 merged) is met. The model and key-access decisions are taken when that task starts (founder, 2026-10-10).

## Small UI items (now Bugs Task 12 U1-U19, see `Sprint3/tasks/task12.md` R14; this list is the original record)

- The reminder "Notice" card text keeps the "Topic:" prefix, so it reads `Reminder: "Topic: ...`.
- The floating "New brief" button covers the last visible card in Ended runs.
- Two runs of the same brief look identical apart from status and time.
- Gate 1 outcomes read "Edited" in the chart and "revised" in the Approval gates text.
- The stepper on a cancelled run still shows an active ring on its last step.
- The "Approve script" button label breaks mid-word on the Inbox card.
- The Content performance chart runs past the right edge of its card (check whether the sideways scroll is intended).
- The reviewer text at the top of Details has no heading.
- FAILED rows give no reason; tapping an attempt to read its error would help.
- "Views and likes show up on the Dashboard once the first poll runs" was still shown 19 hours after upload.
- Not In Your Textbook cards have no colour dot, unlike Underdogs (channel colour probably unset).
- The Needs attention card title truncates ("Account spend limit reached: $1.7...").
- The plain-language line for the retry cap says only "Video retry limit reached" (see F1 d).

## Decisions (founder, 2026-10-10)

1. Stock footage: fall back to an AI still after the cap. **Yes**, as Bugs Task 12 R1 (F1).
2. Manual Retry: cap it. **Yes**, 3 per stage per run, as Bugs Task 12 R2 (F2).
3. Dashboard: exclude cancelled runs from the failed count and the success rate. **Yes**, as Bugs Task 12 R3, after the SQL confirms the cause (F4).
4. Underdogs captions off: **intended**, no action (F6).
5. gpt-image migration: model (`sunburst` or `flare`), alias or dated snapshot, and key access. **Decided when that task starts**, not now.
6. Process habits in a doc: **yes, done**, in `docs/server/usefulcmds.md` (F9).

## Next

- Closure agent: continue the triage (P2-P4), the docs sync (P6) and the `closure2.md` report; answer F5 and F6 in its P8
  section; use the F4 SQL.
- Founder: restart-duplicate check on 2026-10-11; run the F4 SQL (Task 12 R3 asks for it); hand `Sprint3/tasks/task12.md` to a hot-fixer; start the gpt-image task when ready (target merged by 2026-11-15).
