# Combined acceptance test: results and bugs (first run, 26 Oct 2026)

**One page for everything tested so far.** Source: the founder's replies (`T01 pass` and so on) and the screenshots and JSON sent on 26 Oct. The test steps are in [`../SPRINT4_5_TEST_SEQUENCE.md`](../SPRINT4_5_TEST_SEQUENCE.md) (v2.4). Only the architect edits this file; it is replaced by the next run's results, not patched by agents.

**What was tested.** Phone app version `01a16f4a`. Backend commit `c256510` (merge of #123; `main` was the same commit at the time). Runs: Cold Star channel, Mary Celeste brief, Video (long), finished and published (run started 25 Oct 20:05). Not on the tested build: Sprint 6 Task 1 PR A (#116) and PR B (#124), merged the same evening, so the thumbnail and packaging checks must be retested after their deploy.

## 1. Bugs found (7)

Fix order is the order below. One hot-fixer task (`BUGS_ACCEPTANCE_1`) takes B1 to B5; B6 and B7 are separate (see section 4).

| # | Bug | Steps | What the founder saw | What the code says (checked 26 Oct) | Severity |
|---|---|---|---|---|---|
| B1 | **The account email goes into the public YouTube description** | T16, T43 (T25 too) | "Edited by 7aistudiochannel@gmail.com." is the last line of the published description (JSON of the Mary Celeste upload). T16 also showed the email instead of a name | `studio/src/run-pipeline/state-machine.ts:2091`: `approver.name?.trim() \|\| approver.email`. The safe fallback `FALLBACK_EDITOR = 'the team'` (`agents/publishing/packaging.ts:7`) is only used when there is no approver at all | **High: personal data on a public page.** Edit the live description in YouTube Studio now |
| B2 | Voice page: play button is slow to respond | T33 | Sample takes a long time to start | Not looked at. Task 7 follow-up (#113) built the page; Task 8 R1/R2 (#107, #104) handle voice models | Medium |
| B3 | Voice page: the app goes to a white screen | T33, T42 | The whole app turns white when you save or do anything on the Voice page. The founder confirms T42 (picker broken) is the same bug | Not looked at | **High: blocks changing a voice** |
| B4 | Watermark upload fails: "Unsupported FormDataPart" | T45 | Error on upload of a PNG watermark | Not looked at. It is a phone-side upload error (`FormData` is built by the app). Same area as Sprint 3 R12/F6 (was reported fixed) | Medium (regression) |
| B5 | The finished-run cost card shows the final cost only; **estimate and limit are missing** | T32 | Card shows "Final cost $0.15" and the per-attempt list; no estimate and no limit | `app/components/CostCard.tsx` draws "Estimate", "Retries up to" and "Limit" only when the run sends them; a finished run apparently does not. Which side (server or app) is not verified. Founder decision: **both the estimate and the final cost must show** | Low |
| B6 | Cancel sometimes stays on "Cancelling…" for a long time | T46 | Sometimes stuck for a long time, sometimes resolves | Same as open report `9e007cd7` (endless Cancelling). Sprint 3 F6 was confirmed "done" on 26 Oct, so this is either a regression or a case F6 did not cover. **Still open** | Medium |
| B7 | Gate 2 refuses a voice, music or pictures change once the video exists | T33 | "Not working as expected" | **Probably by design** (T33's pass condition says it is refused with one line pointing to Revise at Gate 2). Open until the founder says whether that line showed. See question Q4 | Unknown |

## 2. Results per step

Legend: **PASS** founder said pass (or "works"). **FAIL** see the bug. **UNSURE / NOT TESTED / NOT SENT** are the things still owed; they are collected in section 3.

| Part | Step | Result | Note |
|---|---|---|---|
| 1 Set-up | T01, T02, T03, T04 | PASS | |
| | T05 | **UNSURE** | Display name. Cannot tell whether a name is set or where. B1 shows no name is used at publish |
| | T06, T07, T08 | PASS | |
| 2 Short | T09 to T15 | PASS | |
| | T16 | **FAIL** | Description showed the email (B1). Soft link in the title still to be confirmed (Q2) |
| | T17 | PASS | |
| 3 Long | T18 to T23 | PASS | |
| | T24 | PASS, **retest** | Thumbnail needs retesting; run again after the Task 1 PR A and B deploy |
| | T25 | PASS (as sent) | B1 applies: the description of this upload carries the email. `coverFrameSet` and `coverFrameMessage` were cut off in the pasted JSON (Q3) |
| | T26, T27, T28 | PASS | |
| 4 App screens | T29 | PASS | App `01a16f4a`, system commit `c256510` |
| | T30, T31 | PASS | |
| | T32 | **FAIL** | B5 |
| | T33 | **FAIL** | B2, B3 (and B7 open) |
| | T34 | **NOT TESTED** | Gate 1 chapter limits |
| | T35 | PASS | Mary Celeste, 7 chapters |
| | T36 | **NOT TESTED** | Founder asked for the two briefs (given in chat) |
| | T37 | **PARTLY SENT** | Received: cost card (T32), Script tab, Brief, Step history. Missing: Voice page (T33), Gate 1 edit sheet (T34), intake warning (T36a) |
| 5 Added 26 Oct | T38 | PASS | Admin button per account (END-02) |
| | T39 | **PARTLY** | Script tab OK (139 words, about 56 s, "This is the script the video was made from", Review 10/10). The collapsed "Original draft" and an edited script were not seen (Q5) |
| | T40, T41 | PASS | |
| | T42 | **FAIL** | Voice picker broken: same as B3 |
| | T43 | PASS (found) | The publishing summary exists and shows the upload data. It also shows B1 |
| | T44 | PASS | |
| | T45 | **FAIL** | B4 |
| | T46 | **FAIL** | B6 |

**Totals (46 steps).** PASS 35 (T24, T25 and T43 with notes: retest, and B1 on the last two). FAIL 6 (T16, T32, T33, T42, T45, T46). NOT TESTED 2 (T34, T36). UNSURE or PARTLY 3 (T05, T37, T39).

## 3. NOT TESTED or NOT CONFIRMED (founder to test or answer)

| Step | What is missing | What to do |
|---|---|---|
| T05 | Whether the account has a display name and where to set it | Q1 |
| T34 | Not run | Gate 1 of a long run: Edit script, change the chapters (about $0.20 for a run to Gate 1; reuse the T35 run if it is still at Gate 1) |
| T36 | Not run | Use the two briefs from chat (no spend) |
| T37 | Three of four screenshots missing | Voice page, Gate 1 edit sheet, intake warning (Q7) |
| T39 | Collapsed "Original draft" and an edited run not seen | Q5 |
| T16 x
| T24, T25 | Thumbnail and cover-frame result | Retest after the Task 1 deploy; send the cut-off JSON (Q3) |
| T46 | How long "stuck", what resolved it | Q6 |
| Not on a phone | New-tenant $10 weekly default and equal split (Sprint 3 R7); manual Retry cap of 3 (Sprint 3 R2) | Stay "not verified". Need a new tenant (invite script) and three paid retries |

## 4. Next actions

1. Founder, now: edit the live description of the Mary Celeste video in YouTube Studio and delete the "Edited by …@gmail.com." line (B1 is live).
2. Architect: one hot-fixer task for B1, B2, B3, B4 and B5 (B5 needs a check of whether the server or the app drops the estimate and limit). B6 goes to the backend agent that owns Cancel; B7 waits for Q4.
3. After the fixes and the Task 1 deploy: retest T05, T16, T24, T25, T32, T33, T42, T43, T45, T46 and run T34, T36, T37, T39 (Part 6 of the test sequence).
