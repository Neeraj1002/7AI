# Sprint 4 and 5 test sequence (founder run)

**Version 2.4, 2026-10-26, evening.** First run done: results, the seven bugs and everything still untested are in [`testing/ACCEPTANCE_RESULTS_2026-10-26.md`](testing/ACCEPTANCE_RESULTS_2026-10-26.md). 35 of 46 steps passed; T16, T32, T33, T42, T45 and T46 failed; T05, T34, T36, T37 and T39 are still open (Part 6 lists the retest and the missing steps). T05, T29 and T36 below carry the extra detail the founder asked for. **Version 2.3, 2026-10-26.** Added Part 5 (T38 to T46): checks for PRs merged since v2.2 or never covered (#96, #101, #103, #104, #106, #107, #114) and the Sprint 3 phone checks carried over when Sprint 3 closed. T12, T16 and T25 gain one pass condition each. **Version 2.2, 2026-10-24.** Added Part 4 (T29 to T37): the app and chapter-limit checks for Sprint 5 Tasks 7 and 8 and PRs #112, #113 and #115, to run on the build that contains #113. Changes in v2.1: the profile now holds the story guide, look A and the new title guidance (T04), S-1 carries an arc line (T09, T11) and T14 has a look test. Derived from `SPRINT4_5_ACCEPTANCE_PLAN.md` (journeys L1, S1, duration, phone checks) plus the first test run on 18 Oct. The 57-case CSV tracker is not on `main`, so steps carry their own IDs (T01 to T28). Reply in order: `T07 pass`, `T07 fail` plus a screenshot, or `T07 skip`. Add `G: <what>` whenever the video misses the channel concept (pictures not in the planned stance, no ambience, music not matching the emotion, flat voice, a story that makes you feel nothing); each G goes into the gap register (`channel_bibles/NIYT_CHANNEL_CONFIG.md` §13).

Channel settings, the two treatments (S-1 Short, L-1 Long) and the checklists are in `channel_bibles/NIYT_CHANNEL_CONFIG.md`. The channel keeps its current name for the tests.

## Closed (tested on 18 Oct, run `7a90cd6e`, 2-minute Video, Lego, Underdogs)

Real 2-minute Video created from the phone with estimate and max spend · long-form script (about 311 words, 3 chapters) · Gate 1 edit with the 3-chapter rule and the edited text used · Coral voice end to end · video generation (24 stills, 1920x1080, 30 fps, 98 s) · Video Review quality checks · automatic regeneration (1 of 2) · Gate 2 with 720p preview and chapters · spend-limit stop and Retry after raising it · provider-limit recovery by Retry · Cancel run · Edit brief and rerun · Admin cost view · debug bundles · YouTube upload (Unlisted) · subtitles uploaded, .srt download.

**Failed or not clean (in Tasks 8, 7, 6; retest after they ship):** voice refused after Gate 1 · full rebuild on review failure · attempt shown "done" when it failed · logos in pictures · cost not shown in the app · Script tab shows the draft · Inbox shows only 7 to 8 runs · Queue layout with Failed filter · music does not follow emotion.

## Part 1: set-up, no spend

| ID | Do | Pass if |
|---|---|---|
| T01 | Admin → System info | Commit equals GitHub `main` (note it) |
| T02 | Note the installed app version | Noted; this is the build you test |
| T03 | Channel detail: enter the values from spec §7 (niche, Private, Gate 1 and 2 on, captions on) | Saved and still there after reopening |
| T04 | Content profile: enter every field from spec §7 (the story guide, look A style prompt and negative prompt, title guidance, description template and the rest); Save as a new version; reopen. If you saved an earlier set, save again as the next version | No red error, every value kept (the guide is 3,070 characters, the title guidance about 1,460), version history shows the save. A rejected field means the app disagrees with the doc: send a screenshot |
| T05 | Check your account has a display name: open the app, tap the profile or settings icon, look for "Name" or "Display name" | A name is set and is not your email. If there is no such field, that is a finding (the publish step then uses your email: bug B1); say which screens you opened |
| T06 | Channels screen | Admin button visible (END-02); no stray "(default)" text on tiles |
| T07 | New brief, Type Video | Visuals locked to AI images; Length 1 and 16 show the red error; 10 min shows the estimate and max spend; a max spend below the estimate is refused |
| T08 | New brief: Sources field | A web link is accepted, plain text is refused |

## Part 2: the Short (S-1 "The Weigher", cents)

| ID | Do | Pass if |
|---|---|---|
| T09 | New brief: Short, NIYT, Freeform (the only format chip), Length 45, AI images, music calm; paste the S-1 brief from spec Appendix A (it now includes the arc line); add its 2 source links; Create | Run appears in Queue and Inbox once |
| T10 | Wait for Gate 1 | Push notification arrives |
| T11 | Open Gate 1; read score, concerns and the "Sources you gave" card; check the script with the Gate 1 checklist | First and last sentences exact; no name for the narrator; no grams, kilograms or "archaeologists" in the first-person part; only the 4 listed facts; sources card shows both links; the worry and the relief show in the hands or senses, not in words like "nervous" or "relieved"; at most one everyday line, with a speech tag |
| T12 | Approve (edit first if the checklist fails) | Run moves on; Run screen shows a real stage After you tap Approve the screen says "Decision sent" (no stuck spinner). |
| T13 | Wait for Gate 2 | Push notification, once |
| T14 | Gate 2: quality card; watch the whole Short twice with sound | 1080x1920, 30 fps, longest shot 4 s or less; captions in the safe area and in time; the spoken first sentence says imagined; first-person pictures show hands and eye-level views; no writing or marks; music calm. **Look test (look A):** did one frame make you feel something? does any frame look like generic AI? do hands and faces hold up at phone size? Answer `look A ok` or `look A no`. If `no`: do not run T15; I give you look B, you save it as a new version and repeat T09 to T14 once (about 20 cents). Report any G notes |
| T15 | **Revise** once with the note "slower, wider opening street shot" | New attempt starts; history shows attempt 2 honestly; the note is visible |
| T16 | Approve; publish as Private; open it in YouTube Studio | Title (35 to 55 characters, one soft link to today that the script contains, such as taxes, no clickbait), description (disclaimer, sources, "Written and fact-checked by <your name, not your email>", hashtags incl. #shorts), altered content = yes, made for kids = no Publishing is not blocked by digits inside a source link (#114): if any source link has numbers in its address, the upload still completes. |
| T17 | Play it on the phone | Plays with sound |

## Part 3: the 10-minute video (L-1 "A Day in an Indus City", about $1 to $1.50; after T17)

| ID | Do | Pass if |
|---|---|---|
| T18 | New brief: Video, Freeform, 10 min, AI images, music calm; paste the L-1 brief (Topic, Constraints, Facts); add the source links; note estimate, weekly left, max spend; Create | Brief accepted (if the box refuses the length, tell me and I trim); cost block matched |
| T19 | Gate 1 | Notification; 7 chapters with the exact titles; about 1,500 words; run the Gate 1 checklist: chapters 2 to 4 first person with no modern units; commentary-only facts only in chapters 1, 5, 6, 7; chapter 7 restates the inferred facts as "probably"; each chapter shows its feeling and turn through hands and senses (no feeling labels); at most two everyday lines, in chapters 2 to 4 |
| T20 | Approve; leave the app 30 minutes | Queue and Run show "Generating images n of N"; one Inbox card for the run; no duplicate attempt rows |
| T21 | Gate 2 notification | Arrives once, at Gate 2 |
| T22 | Gate 2 quality card | Length at least 8:00; longest shot at most 7.5 s; 1920x1080, 30 fps; chapters listed |
| T23 | Watch the whole 720p preview with sound | First-person chapters show hands and eye-level views; no writing, marks or violence; the spoken disclaimer is clear; voice says the hard names acceptably; music does not fight the voice; commentary chapters show the place as it looks today; the look holds across chapters (same light and grade, no uncanny faces). Report G notes |
| T24 | Download the `.srt`, spot-check 3 places | Spelling right; in sync within about a second |
| T25 | Approve; publish Private; open the run's publishing output and then the video in YouTube Studio | "Uploaded" subtitles chip; chapters in the YouTube description; disclaimer, sources and your name present. **Thumbnail 403 re-test (NIYT, after Task 8 is deployed):** `coverFrameSet` is true and the thumbnail shows on the video in Studio, or `coverFrameMessage` says why not (403: verify the channel; 401: reconnect; other: set it by hand). If it is still a 403 on the verified channel, tell me: a small task follows Same as T16: digits inside source links do not block publishing (#114). |
| T26 | Play it on the phone, scrub once | Plays; chapters work |
| T27 | Compare tab after 24 to 48 hours | Shorts and Videos tabs show numbers or an honest "not available yet" |
| T28 | Public decision (you, with me) | Short: Public after T16 and T17 pass. Long: stays Private until the combined test passes |

## Part 4: app screens, chapter limits and the Mary Celeste rerun (new build, 24 Oct)

Run after the build that contains PR #113 is on your phone (the build agent or you note whether it needed a new native build). No spend except T35 (about $0.20). Send the four screenshots named in T37 with your results.

| ID | Do | Pass if |
|---|---|---|
| T29 | Note the app version again (as T02) and Admin, System info commit (as T01) | The commit equals GitHub `main` after #113 and #115 are merged; version noted |
| T30 | Inbox: scroll down past the first 8 runs | Older runs load as you scroll and a total is shown; no run is missing |
| T31 | Queue: choose the Failed filter, then a channel filter, then clear one | The layout does not jump; an active channel filter says it is on |
| T32 | Run screen of a finished run with attempts: open the cost card | Total, estimate and limit show; one expansion lists cost per attempt and, inside it, per stage; a call that failed without charge reads "failed, not charged"; an amount under one cent shows four decimals; Step history shows each attempt's outcome and reason and no cost |
| T33 | A run waiting at a gate: Edit settings, open Voice | The voice list opens as a page inside the same sheet (no second window); the back arrow keeps your unsaved choices; one sample plays at a time; saving a changed voice before the video exists works (no spend to start); a stopped run offers "Save only" and "Save and retry this step", and a refused save shows a red "Nothing was saved" line with the server's message; once the video is made, voice, music and pictures are refused with one line that points to Revise at Gate 2; a refused save changes nothing |
| T34 | Gate 1 of a long run: Edit script, change the chapters | The live chapter count shows the limits for this run (3 up to the length's ceiling); a chapter under 26 words is flagged; the length shows against the target word count; too many chapters on Save shows the server's own sentence, not a phone-made one |
| T35 | New brief: Cold Open channel, Video, 10 min, the Mary Celeste brief (7 titles, 7 word budgets); Create; wait for Gate 1 (about $0.20) | Accepted at intake; Gate 1 shows exactly 7 chapters with the 7 exact titles and about 1,500 words; an amber line says the brief lists 7 chapters; you can edit to 6 chapters and Save (allowed); no "expected 3 to 6" error |
| T36 | Two intake checks, no spend: (a) a 2-minute Video with 7 chapters listed; (b) a brief with 8 titles but 7 word budgets | (a) is accepted with an amber line about short chapters, never red; (b) is refused at Create with a plain sentence, no run is created |
| T37 | Take four screenshots: the Voice page (T33), the cost card expansion (T32), the Gate 1 edit sheet with a limit warning (T34), a run with an intake warning (T36a) | Sent with your results, so the Task 7 follow-up can be closed |

## Part 5: added 26 Oct (PRs merged since v2.2, and the Sprint 3 phone checks carried over)

Run after Part 4. No spend unless a row says so. Reply the same way (`T38 pass`).

| ID | Do | Pass if |
|---|---|---|
| T38 | Sign in as your tenant account and open Channels; sign out; sign in as your admin account and open Channels. If you cannot find Sign out (profile or settings), say so | Tenant account: no Admin button. Admin account: Admin button visible. Neither shows anything left over from the other account (#101, #103; END-02) |
| T39 | Open a finished run, Script tab (a run you edited at Gate 1 is best) | It shows the script the video was made from, with its real word count and length, and says so; the original draft sits under a collapsed "Original draft"; your edit shows, not the draft (Task 7 A3) |
| T40 | Open a run with a long brief, and a Gate 1 run with long review text: look at the Brief, the Script and the review text | Each shows 5 lines with "Show more" directly under it; tapping shows the rest (Task 7 A14; Sprint 3 U15) |
| T41 | Run screen of a run that had a failed attempt (or any finished run): Step history and the progress bar | No "Details" section; each attempt shows its outcome and reason; a failed review reads "failed review", never "done"; the bar is green for done, amber for the current step, red only for the step that failed, grey when cancelled or rejected (Task 7 A5, A15, A16) |
| T42 | **Optional, about one Short's cost.** Gate 1 of a Short: Edit settings, Voice, pick Ballad (refused after Gate 1 on 18 Oct), Save, approve | The video is spoken in Ballad, or the run stops **before spending** with a plain sentence about the voice. It must not fail after Gate 1 with money spent (#104; Task 8 R1, R2) |
| T43 | After the T16 or T25 upload: Admin, open that run, look for the publishing summary | It shows the upload receipt and the video ID (#92, #96). If you cannot find it, say so; that is a finding, not a fail |
| T44 | Fully close the app and open it; then tap the email box on the sign-in screen | It opens without a crash or a flash of the wrong screen; the cursor is visible and the keyboard does not hide the box (Sprint 3 F6) |
| T45 | Channel settings of a throwaway or test channel: upload a small PNG as the watermark, save, close the channel, reopen it | The upload succeeds (no "Unsupported FormDataPart" message) and the watermark is still there on reopening (Sprint 3 R12, F6). Remove it afterwards if you do not want it |
| T46 | **Optional, a few cents.** Start a cheap Short and tap Cancel run while it is running | It shows "Cancelling..." and then Cancelled within a short time; it does not stay stuck (Sprint 3 F6) |

**Not in this test, and why.** The new-tenant $10 weekly default and its equal split (Sprint 3 R7) needs a new test tenant made with the invite script: not a phone step, so it stays "not verified". The manual Retry cap of 3 (Sprint 3 R2) needs three paid retries on one run: stays "not verified". The LLM Registry canary (#109) is a developer script; its effect (no cut-off at Gate 1) is covered by T09 and T18. If any attempt fails Video Review during the run, also note whether the retry reviewed the same video without paying for new pictures (Task 8 R3): the attempt costs in the cost card show it.

## Part 6: still to run, and the retest after the fixes (26 Oct)

**Not run or not confirmed in the first run (test these now, no code change needed):**

| ID | Do | Pass if |
|---|---|---|
| T34 | As written above (reuse the T35 run if it is still at Gate 1) | As written above |
| T36 | Use the two briefs below, Create each on the Cold Open channel as a Video; no spend | (a) accepted with an amber line, never red; (b) refused at Create with a plain sentence and no run created |
| T37 | Send the three missing screenshots: Voice page, Gate 1 edit sheet with a limit warning, a run with an intake warning | Received |
| T39 | On a run you edited at Gate 1, Script tab, tap "Show full script" | Your edited text shows; "Original draft" is collapsed underneath (it is absent on an unedited run, which is fine) |

**T36 briefs (paste as the whole brief):**

(a) 2-minute Video, 7 chapters:
`Topic: How the paper clip became a symbol of quiet resistance in 1940.`
`Constraint: seven chapters, titles exactly: "The invention", "The patent that never was", "Norway in 1940", "The clip on the lapel", "The ban", "The quiet signal", "What the record shows".`

(b) Any length Video, 8 titles but 7 word budgets:
`Topic: How the paper clip became a symbol of quiet resistance in 1940.`
`Constraint: eight chapters, titles exactly: "The invention", "The patent that never was", "Norway in 1940", "The clip on the lapel", "The ban", "The quiet signal", "What the record shows", "The legend and the record". Word budgets: 150, 200, 200, 200, 200, 200, 150.`

**Retest after the hot-fix (`BUGS_ACCEPTANCE_1`) and the Task 1 deploy:**

| ID | Retest | Pass if |
|---|---|---|
| R-B1 (T16, T25, T43) | Publish one Private video; read the description | No email anywhere; the credit line shows your name, "the team", or is absent |
| R-B2/B3 (T33, T42) | Voice page: play a sample, change the voice, Save, pick Ballad | The sample plays within a few seconds; no white screen; the choice saves or is refused with a sentence before any spend |
| R-B4 (T45) | Upload a PNG watermark, save, reopen | Uploads and persists, no "Unsupported FormDataPart" |
| R-B5 (T32) | Cost card of a finished run | Final cost, **estimate and limit** all show |
| R-B6 (T46) | Cancel a running Short several times | Always ends at Cancelled within about a minute |
| T24, T25 | After the Task 1 deploy, publish one Private Video | Thumbnail set; `coverFrameSet` true or a plain reason |

## Waiting on a build (do not test yet)

Sprint 6 Task 1 (curiosity packaging: titles and thumbnails): PR A (#116) and PR B (#124) merged on 26 Oct after the first run, so the first run did not test them; their steps are added when the build with them is deployed and the thumbnail retest (T24, T25 in Part 6) is run. PR C waits for Task 2 (per-video disclaimer On/Off; hook first). Until Task 2 ships, this sequence judges the spoken disclaimer as it is today (S-1 and L-1 still open). Also waiting: Task 5 one-scene repair on a real video; Task 2 (Sprint 5) durable publishing recovery in a real upload; stale duplicate-attempt rows; weekly YouTube reconnect and Analytics API check; music tracks and licence check; the other items in the spec's gap register. **Now merged and covered by the steps above:** Task 6 Script Review rules (T11, T19), Task 8 backend fixes (voice list and preflight at T33; honest attempt status and cost at T32; logo check and no full rebuild by T14 and T22), Task 7 app screens (T30 to T34), the chapter-limit fix (T35, T36). **Added in v2.3:** Admin entry per account (T38; #101, #103), Script tab, Show more and Step history (T39 to T41), voice per model (T42; #104), Admin publishing summary (T43; #92, #96), numeric source links (T16, T25; #114), the Sprint 3 phone checks (T44 to T46).

## Rules for the run

If a paid step fails, stop and send the screenshot; do not rerun. Do not approve a Gate 2 video that shows writing, logos or violence. Keep the Long Private until the combined test passes. Record the commit (T01) and the app version (T02) with the results. If the look test at T14 says `look A no`, stop and tell me before any further paid run.
