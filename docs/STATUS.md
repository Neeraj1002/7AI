# 7AI: where things stand

**Last updated: 2026-10-21.** This is the one page to read. Only the architect edits it, through a pull request. Details live in the linked task and report docs; those are written once and then left alone.

Every item has a plain name first and its code in brackets, for example "Check Task 13 bundles (F4)".

## Where things stand

**Sprint 4 (long-form video, formats, new app screens): built, merged and deployed.** The backend is on the server and the new app build is on your phone. Your full Sprint 4 test could not be finished, because long-form video generation kept failing in production (the planner run `dbf432ff…` finally generated a video but stopped at video review: longest still 19.4 s against a 7.5 s limit; run `9ab4fbe5…` has a stale "running" attempt; run `2d5f3def…` failed on quote errors and then on spend limits). Sprint 5 was created to fix exactly this.

**Sprint 5 (reliability, evidence, measured improvements): built.** Details and the live status: `execution/sprint5/STATUS.md`. The planner fixes (#87 to #90) are live. Task 1, run diagnostics (#91), Task 2, durable publishing recovery (#92), Task 3, still-scene alignment (#93) and Task 4, shared factual evidence (#94) are merged. Task 5, one-scene visual repair (#95), and the Task 1 follow-up (publishing summary for Admin) are merged too: **all Sprint 5 PRs are merged, the last is #103** (you told me on 18 Oct). Task 5's only creative test was a synthetic 4-second video, so its creative result is **inconclusive** and the repair is not adopted as a quality claim. Merging to `main` auto-deploys to the server, so each merge restarts it. The Sprint 5 status page mixes dates and still shows some of these as open; confirm deploy state against Admin "system info".

**Script Review rules SR-1 to SR-9 were not built in Sprint 5** (Task 4 added only the evidence input). They are now **Sprint 5 Task 6** (`execution/sprint5/tasks/task6.md`, written 18 Oct; PR #105 merged 20 Oct, not deployed; a small follow-up PR holds one live detection check).

**Testing plan: written.** One combined Sprint 4 and Sprint 5 acceptance plan, a 57-case tracker (all NOT_RUN) and a 37-report bug ledger (13 open: 8 bugs, 5 feedback; 24 fixed, as read on 16 Oct). It replaces any separate Sprint 4 rerun. These files were in the planning checkout on 17 Oct but are **not on `main` yet** (the `testing` folder in your main checkout is empty); see to-do #3.

**First acceptance run (18 Oct): one real 2-minute Video, Lego brief, channel Underdogs, run `7a90cd6e`, reached Gate 2 on the third attempt.** Passed: Video Review, volume (-14), loudest moment (-1.3), picture (1920x1080, 30 fps), longest shot after regeneration (6.2 s), length 1:38 (above the 96 s floor, 22 s under the 2:00 target), the voice is acceptable. Not passed or not clean: the voice you chose (Ballad) was refused by the speech model after Gate 1; attempt 1 failed Video Review (longest still 8.3 s against 7.5 s) and the whole video was regenerated; the Anthropic workspace limit stopped the review once; a brand logo reached the video and review passed it; cost was $0.5492 against a $0.24 estimate; the Script tab showed the draft, not your edit (the video used your edit); Inbox shows only 7 or 8 runs; the Queue layout jumps when the Failed filter is chosen and a channel filter stays on without saying so; the Brief has no Show more; Details duplicates Step history and calls a failed review "done"; no cost, attempt or setting-change screens. The published video is Unlisted (it has the logo). The Script Review gave two different Lego drafts 8/10 although each had about a dozen invented details (examples for Task 6, Appendix B). Not yet run: the private upload, the Short (S1), the 10-minute run, the Task 5 comparison (R1). Everything found is written into **Task 8** (backend fixes) and **Task 7** (app gaps).

## Your to-do (only you can do these)

| # | What | How | When |
|---|---|---|---|
| 1 | Check what is deployed | Admin, System info: the commit shown should equal GitHub `main`. Merges auto-deploy, so each Sprint 5 merge restarts the server. For Task 2's database change, follow `execution/sprint5/runbooks/task2-rollout.md` (admission gate, drain running work, final backup, stop idle workers); confirm it was done for #92. | Now |
| 2 | Task 6 (Script Review rules): confirm it is deployed, then test it | PRs #105, #110 and #111 are merged (20 to 21 Oct). Code computes the score, advisory notes never lower it, a confirmation call guards hard caps, a hedge word must sit next to its figure; six of six live controls scored 10 and both invented-fact Lego drafts were capped at 6. Merges auto-deploy: check Admin, System info shows the new commit. Test Script Review in the combined test. | With the test |
| 3 | Get the testing plan and Task 6 doc onto `main` | The acceptance plan, 57-case tracker, bug ledger, `task6.md` and this page are not on `main` yet. Ask the docs agent for one docs PR (or tell me where the files are) and merge it. | Before the test |
| 4 | Hold the first public long video | Task 6 is merged. Still read every fact at Gate 1 against your facts brief and publish only as Private until the combined test passes, and until the chapter-bounds fix (to-do #16) is merged: Cold Open runs fail without it. | Until the test passes |
| 5 | Combined acceptance test | After #1 to #3 (Task 6 can run in parallel; test the Script Review part after it merges): install the build you will test (APK or OTA), then run the plan's shared journeys once: one real 2-minute Video from the phone (L1), one Short (S1), one **private** upload, and a 10-minute run only if you want long-duration sign-off. Record PASS or FAIL per case in the tracker and send me the results. This replaces the old checklist from 13 Oct. | After #1 to #3 |
| 6 | Reconnect YouTube channels | Weekly (testing-mode tokens expire in 7 days). Confirm the YouTube Analytics API is enabled in Google Cloud (needed for long-form numbers and subtitle upload). | Weekly |
| 7 | Admin button missing on the Channels screen | Report `ba8c7c8e`, case END-02: on the admin account, check the app version and `admin.whoami` first. A bug prompt was sent to the frontend agent on 13 Oct; tell me its answer. | With the test |
| 8 | Set the picture style per channel | In the app: channel, Content profile, Visuals, style prompt. **Not In Your Textbook:** the look A text in `channel_bibles/NIYT_CHANNEL_CONFIG.md` §7 (a documentary frame; fallbacks B and C are there too). **Underdogs:** one line for the look you want. Others: add the painting sentence if they should look painted. Do this before real runs. | Before the test |
| 9 | Music: longer tracks and licence check | Add 2 to 3 tracks of 4 minutes or more per mood (cleared for monetised public use, -18 LUFS). Look up each existing track in YouTube Studio, Audio Library; if any needs attribution, tell backend agent 1. The credit line in a video's description comes from that entry. | Before the first public long video |
| 10 | Triage and receipts | Triage the 5 newest bug reports; paste the receipts SQL from the Task 12 report (F8); missing phone screenshots (F5). | When you have time |
| 11 | Sprint 5 Task 8 (backend fixes from your test) | PR #107 merged (21 Oct). Four migrations were applied to the local dev database; preview applies them through the deploy. Check the deploy run succeeded. The agent closes its worktree (Hard rule 8). Remaining: one real check of R13 on preview once the deploy is up (no spend needed to start). | After the deploy |
| 12 | Sprint 5 Task 7 (app gaps): merge #106, build the APK | PR #106 is ready, CI green, not merged (21 Oct). Build with `eas build --profile preview --platform android` (a new native build: `expo-clipboard` is native), install, then take the six screenshots listed in its report. Row 11 designs (Voice picker as a page inside Edit settings, per-attempt cost on the cost card) go in a separate PR with its own task doc. | After #106 merges |
| 13 | Voice choice per channel | Listening test first (Task 8 R10 Part A), then pick per channel. Do not decide from names. | After Task 8 Part A |
| 14 | Channel and test run | Read `channel_bibles/NIYT_CHANNEL_CONFIG.md` (v2.1: concept, story feel and voices, full production spec with support tags, exact settings to enter including look A and the title guidance, treatments S-1 and L-1, Sprint 6 and 7 gap register). Enter the settings (T03, T04), then follow `execution/sprint5/SPRINT4_5_TEST_SEQUENCE.md` in order and reply `T01 pass` etc. Both need the docs PR (to-do #3). | Now |
| 15 | Forward the Task 6 addendum | `execution/sprint5/tasks/task6.md` D4: the reviewer must treat the brief's IMAGINED allowance (feelings, wants, worries, sensations and up to two everyday speech lines) as allowed, or every first-person script is capped at 6, retried 3 times and escalated. D4 was widened on 18 Oct: forward the current text. Send it to the Task 6 agent with round 2. | Now |
| 16 | Chapter-bounds fix (Cold Open runs) | The Mary Celeste run failed with "expected 3 to 6 chapters, got 7". Branch `BUGS_CHAPTER_BOUNDS` (worktree `D:\Study Material\7AI-BUGS_CHAPTER_BOUNDS`), task doc `execution/sprint5/bugs/tasks/chapter-bounds.md` (r1). Code-complete and live-checked ($0.1826); not pushed, no PR yet. Merge it when green, then rerun the Mary Celeste brief. | Priority 1 |

## In review

| Item | State |
|---|---|
| Sprint 5 Task 6, Script Review rules (`SPRINT5_TASK6_BE`) | Merged: #105, #110 (live detection check), #111 (hedge fix). The agent closes its worktrees (Hard rule 8). |
| Sprint 5 Task 8, backend fixes from the first test (`SPRINT5_TASK8_BE`, worktree `D:\Study Material\7AI-SPRINT5\task8`) | PR #107 merged 21 Oct. |
| Sprint 5 Task 7, app gaps (`SPRINT5_TASK7_FE`, worktree `D:\Study Material\7AI-SPRINT5\task7`) | PR #106 ready for review, CI green on `d042334`, not merged. Not yet seen on a phone. |
| Docs not on `main` | Acceptance plan, 57-case tracker, bug ledger, `task6.md` r5, `task7.md` r3, `task8.md` r2, NIYT spec v2.2, Sprint 6 plan, template (Hard rules 8 and 9), hot-fixer protocol (sweep), `chapter-bounds.md`, this page (to-do #3). |
| Chapter-bounds hot-fix (`BUGS_CHAPTER_BOUNDS`) | Code-complete on the branch, no PR yet (to-do #16). Hard rule 9 (same-cause sweep) and the sweep section in the hot-fixer protocol come from this bug. |
| Archive of old doc folders (DOCS_ARCHIVE) | Separate PR by another agent; status unknown. |

## Next work (in order)

1. Finish Sprint 5: confirm the deploy of #103 (to-do #1), Tasks 8 and 6 are merged; finish Task 7 (#106) and the chapter-bounds fix (to-do #16), then rerun the Lego video as the acceptance retest and finish the combined acceptance test (to-do #5). Known gaps the plan keeps open on purpose: stale duplicate-attempt rows in general (not only publishing), the pacing check on a real long video, a real YouTube upload, and a 10-minute run.
2. Script Review rules SR-1 to SR-9: Sprint 5 Task 6 (`execution/sprint5/tasks/task6.md`): rules in the reviewer, cheap checks for numbers, names and absolutes not in the brief, score caps enforced in code, a budgeted real-model check (about $3 ceiling). **Needed before the first public long video.**
3. After the test: fix whatever it fails, then close the 13 open reports one by one against the tracker (no bulk closing).
4. Small backend task: Compare shows long-form watch numbers (Task 10 stores them, but `dashboard.comparison` does not return them) and declare `chapterWarning` in the `runs.get` type.
5. Deferred on purpose: general video ratings (`2947b8da`), reference character image upload (`61ad1f75`), spend per stage and attempt in the app (`a675e528`, partly covered), speech and transcription provider retirement dates (6 Jan and 26 Feb 2027, see the audit), moving-video and sound-effect features, new agents or models.
6. Moved from earlier sprints: tester-facing bug type and priority chips; per-channel colour setting; two small items (R10.3, R10.10); the YouTube thumbnail 403; add the app tests to CI.

Details: `execution/sprint5/STATUS.md` (live), `execution/sprint4/STATUS.md` (history; the old rows say "Not started" and are not current).

## Decisions waiting on you

| Decision | Note |
|---|---|
| Adopt the continuity (visual repair) change as a quality feature | Not yet. Task 5's test was synthetic, so the result is inconclusive. Needs a comparison on a real approved long video before any claim. |
| Add a search-based fact check to Script Review | Open. Long-form does not use web search: facts come from your brief. |
| An "abandon this run" button for stuck gates | Not built. Only if stuck gates become a real problem. |
| Automatic retry spend limit | Task 8 default: retries may spend up to 2 times the estimate, then the run asks you. Say if you want a different limit. |
| Voice provider and voices per channel | Open. Listening test first (Task 8 R10 Part A): current voice, the newer OpenAI model with a direction line, ElevenLabs if you have a key. A designed or licensed custom voice is the only way to be unique. |
| Music that follows the story's emotion | Now part of sound design (G4, Sprint 7): one track plays under the whole video today. |
| Channel look | Look A (documentary frame) is entered at T04 and judged at the first S-1 Gate 2 (look test). Fallbacks B (paper-cut) and C (clean line) are in the spec §7. Look again when the image model or its quality changes. |
| Hook order | S-1 and L-1 open with the spoken disclaimer. Recommended: first image and line, disclaimer by sentence 2 (retention). Decide before the first Public Short. |
| Channel name | Working name stays for tests. Shortlist: Through Their Eyes, Elsewhen, or keep Not In Your Textbook with a new tagline. Decide before the first Public upload. |
| Sprint 6 and 7 scope | Candidate list is the gap register in `channel_bibles/NIYT_CHANNEL_CONFIG.md` §13 (G1 to G16). Recommended first: series as formats (G2, draft in the spec), reviewer imagined allowance (G3), disclosure fields (G5), voice direction (G6). Largest: sound design (G4). New: look per series and still quality (G16). |

## Accepted limits (not fixable by code)

- YouTube Testing mode: tokens expire every 7 days and there is a 100 test-user cap. You are not applying for Google production verification.
- Free stock libraries do not hold concrete footage for abstract topics.
- Subtitle upload needs the wider `youtube.force-ssl` permission (it can also delete videos; nothing in the app uses that).
- A very narrow upload-in-flight duplicate window existed (YouTube gives no idempotency key); Task 2 narrows it, it does not remove every race.
- Expo push delivery depends on Google and Expo; receipts can arrive late.

Full list with reasons: `execution/KNOWN_ISSUES_AND_BLOCKERS.md`, Section 7.

## Done recently

- Sprint 5 Tasks 1 to 5 merged (#91 to #95, plus the Task 1 follow-up); every Sprint 5 PR merged, last one #103; planner fixes #87 to #90 live.
- Sprint 4 fully merged and deployed: Tasks 1 to 12 (including long-form pipeline #69, length fix #75, quality and publishing #72, image model #68, run data #73 and #74) and Frontend PR #53 and Tasks 2 to 4 (#76 to #82). New app build installed on the phone.
- Sprint 3 closed, including the Approve-screen fix (PR #63) and the 24-report triage (PR #65).
- Bugs Task 7 (bug triage columns): closed. Task 13 (per-attempt debug bundles in R2): live.
- Done by you: public API base URL (F1), tenant ceiling 40 and usage SQL (F2), bug report columns (F3), Task 13 bundles (F4), YouTube connect and redirect (F7).

## Where things are

- `STATUS.md` (this page): the live picture.
- `execution/sprint5/STATUS.md`: Sprint 5 live status; `execution/sprint5/tasks` and `reports`; `runbooks/task2-rollout.md` for the publishing database change.
- `execution/sprint3`, `execution/sprint4`, `execution/bugs`, `execution/ui-ux`: tasks and reports. A task doc is written once; after it closes, only the report and this page change.
- `execution/KNOWN_ISSUES_AND_BLOCKERS.md`: long-form history of issues and why.
- `execution/week1` to `week5`, `execution/sprint2`, `execution/frontend`, `execution/admin/sprint1`: frozen history. Do not update.

## Rules

1. Docs change only through a pull request to `main`. The Project copy is refreshed from `main` afterwards.
2. Agents write only their own task report and send a one-line status; the architect updates this page.
3. When an item closes, move it to "Done recently" and drop it from the to-do.
