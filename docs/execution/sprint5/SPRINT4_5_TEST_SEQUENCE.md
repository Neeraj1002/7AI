# Sprint 4 and 5 test sequence (founder run)

**Version 2.1, 2026-10-18.** Changes since v2: the profile now holds the story guide, look A and the new title guidance (T04), S-1 carries an arc line (T09, T11) and T14 has a look test. Derived from `SPRINT4_5_ACCEPTANCE_PLAN.md` (journeys L1, S1, duration, phone checks) plus the first test run on 18 Oct. The 57-case CSV tracker is not on `main`, so steps carry their own IDs (T01 to T28). Reply in order: `T07 pass`, `T07 fail` plus a screenshot, or `T07 skip`. Add `G: <what>` whenever the video misses the channel concept (pictures not in the planned stance, no ambience, music not matching the emotion, flat voice, a story that makes you feel nothing); each G goes into the gap register (`channel_bibles/NIYT_CHANNEL_CONFIG.md` §13).

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
| T05 | Check your account has a display name (profile or settings) | A name is set. If you cannot find where, say so: T16 covers it before anything goes Public |
| T06 | Channels screen | Admin button visible (END-02); no stray "(default)" text on tiles |
| T07 | New brief, Type Video | Visuals locked to AI images; Length 1 and 16 show the red error; 10 min shows the estimate and max spend; a max spend below the estimate is refused |
| T08 | New brief: Sources field | A web link is accepted, plain text is refused |

## Part 2: the Short (S-1 "The Weigher", cents)

| ID | Do | Pass if |
|---|---|---|
| T09 | New brief: Short, NIYT, Freeform (the only format chip), Length 45, AI images, music calm; paste the S-1 brief from spec Appendix A (it now includes the arc line); add its 2 source links; Create | Run appears in Queue and Inbox once |
| T10 | Wait for Gate 1 | Push notification arrives |
| T11 | Open Gate 1; read score, concerns and the "Sources you gave" card; check the script with the Gate 1 checklist | First and last sentences exact; no name for the narrator; no grams, kilograms or "archaeologists" in the first-person part; only the 4 listed facts; sources card shows both links; the worry and the relief show in the hands or senses, not in words like "nervous" or "relieved"; at most one everyday line, with a speech tag |
| T12 | Approve (edit first if the checklist fails) | Run moves on; Run screen shows a real stage |
| T13 | Wait for Gate 2 | Push notification, once |
| T14 | Gate 2: quality card; watch the whole Short twice with sound | 1080x1920, 30 fps, longest shot 4 s or less; captions in the safe area and in time; the spoken first sentence says imagined; first-person pictures show hands and eye-level views; no writing or marks; music calm. **Look test (look A):** did one frame make you feel something? does any frame look like generic AI? do hands and faces hold up at phone size? Answer `look A ok` or `look A no`. If `no`: do not run T15; I give you look B, you save it as a new version and repeat T09 to T14 once (about 20 cents). Report any G notes |
| T15 | **Revise** once with the note "slower, wider opening street shot" | New attempt starts; history shows attempt 2 honestly; the note is visible |
| T16 | Approve; publish as Private; open it in YouTube Studio | Title (35 to 55 characters, one soft link to today that the script contains, such as taxes, no clickbait), description (disclaimer, sources, "Written and fact-checked by <your name, not your email>", hashtags incl. #shorts), altered content = yes, made for kids = no |
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
| T25 | Approve; publish Private | "Uploaded" subtitles chip; chapters in the YouTube description; disclaimer, sources and your name present |
| T26 | Play it on the phone, scrub once | Plays; chapters work |
| T27 | Compare tab after 24 to 48 hours | Shorts and Videos tabs show numbers or an honest "not available yet" |
| T28 | Public decision (you, with me) | Short: Public after T16 and T17 pass. Long: stays Private until Task 6 merges |

## Waiting on a build (do not test yet)

Task 6 Script Review rules (and its imagined-allowance addendum) · Task 8 fixes (voice list, preflight, no rebuild, honest attempt status, logo check, cost view) · Task 7 app fixes (Inbox, Queue, Script tab, edit settings) · Task 5 one-scene repair on a real video · Task 2 durable publishing recovery · stale duplicate-attempt rows · weekly YouTube reconnect and Analytics API check · music tracks and licence check · Sprint 6 and 7 items in the spec's gap register.

## Rules for the run

If a paid step fails, stop and send the screenshot; do not rerun. Do not approve a Gate 2 video that shows writing, logos or violence. Keep the Long Private until Task 6 merges. Record the commit (T01) and the app version (T02) with the results. If the look test at T14 says `look A no`, stop and tell me before any further paid run.
