# Sprint 5 Task 7: App Gaps From the First Acceptance Run (Frontend)

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting**, then [WORKFLOW](../WORKFLOW.md). Use `task7` under the shared Sprint 5 root (`D:\Study Material\7AI-SPRINT5`), your own worktree off fresh `main`, branch `SPRINT5_TASK7_FE`. Several small PRs are fine (list them in your report). Record the branch in your row of `sprint5/STATUS.md` when you create it, and write only your own row and your own report.

**Keep replies and tool output short: no step-by-step narration, read only the files you need, one-line status messages.**

**Written**: 2026-10-18 by the architect chat, at the founder's request, from the founder's first combined acceptance run on his phone. **Status**: not started. **Priority**: P0 for R1 to R5; P1 for R6 to R8; P2 for the rest.

**Objective**: close the app gaps the first real 2-minute Video run showed: an Inbox that stops at 7 or 8 runs, no cost on the Run screen, a Script tab that shows the wrong script, no way to change a setting on a failed run, wrong or unclear attempt labels, raw provider errors on the failure card, a script editor that is hard to use on a phone, and a voice picker with play buttons.
**Duration**: 3 to 4 days.
**Depends On**: Sprint 4 frontend tasks merged (they are). Items marked "needs Task 8" use fields from [Task 8](task8.md); build the screen against the contract in its report, or against a documented stub, and say which. R1, R3, R7 and R9 do not wait.
**Owning Component**: `app/` (Run screen, Inbox, step history, failure card, Gate 1 Edit sheet, Gate 2, channel settings, Admin run view). **Not** in scope: any backend change (Task 8), Script Review rules (Task 6).
**Success Criteria**: (1) Inbox shows all of the user's runs, loading more as the user scrolls; (2) the Run screen shows cost per run, attempt and stage; (3) after Gate 1 the screens show the approved text; (4) a failed or waiting run lets the user change allowed settings and retry without cancelling; (5) attempt labels and failure messages are plain and correct; (6) voice picker plays a sample beside each voice; (7) the Edit script sheet is usable on a phone; (8) the Queue keeps a stable layout when any status filter is chosen, and the run detail screen has one history section with short Brief and Script previews; (9) app type-check, lint and app tests pass; each screen checked on a phone-size layout.

## What the test showed (evidence)

Founder's run `7a90cd6e` (Lego, Underdogs) and screens, 18 Oct. Backend evidence E1 to E12 is in [Task 8](task8.md).

| # | App gap | Where it is fixed |
|---|---|---|
| A1 | Inbox shows only about 7 or 8 runs; it showed more before. | R1 |
| A2 | No final or running cost on the Run screen. The Admin debug screen has a flat list of 68 events and a total ($0.5492) but nothing per attempt or stage, and the normal screen shows only "Stops at $X". | R2 |
| A3 | Script tab and Gate 2 show the writer's draft (~311 words), not the edited script that was approved and narrated. | R3 |
| A4 | To change the voice the founder had to cancel, tap "Edit brief and rerun" and start from the first stage. | R4 |
| A5 | Attempt 1 showed green "done" although it failed Video Review (longest still 8.3 s). No notification when the system retried or failed a review; the founder expected a Gate 2 notification and found a new attempt. | R5 |
| A6 | Failure card shows the raw provider text, cut off ("OpenAI API call failed: 400 [{'type': 'enum', 'loc': ('bo...."). Spend-limit error needs the founder to find where to raise the limit. | R5 |
| A7 | Voice choice is a name only: no sample, no description; the founder dislikes the template voices and wants to hear them. | R6 |
| A8 | Gate 1 Edit sheet: hard to edit a 300-word script on a phone; the "needs at least 3 chapters" error appears only after Save; no copy button; long-pressing and pasting a whole new script was the only workable way. | R7 |
| A9 | Gate 2: the founder could not share or download the video to show it (screen recording over 30 MB). | R8 |
| A10 | Admin run view labels the Gate 2 card "Gate2 Running, Attempt 1" and lists cost events with no attempt or stage. | R2, R5 |
| A11 | Carry-overs: Admin button missing on the Channels screen (report `ba8c7c8e`, case END-02); "(default)" suffix on tiles; per-channel colour setting; tester-facing bug type and priority chips; two small items R10.3 and R10.10; app tests not in CI. | R9 |

Added after the founder's screen recording of the published run (18 Oct, evening):

| # | App gap | Where it is fixed |
|---|---|---|
| A12 | Queue: choosing the **Failed** status filter changes the layout. The list area collapses, the green "Nothing waiting on you" banner and the "Recent runs" header drop to the bottom half and a large blank gap opens above them; choosing All moves them back. The "New brief" button covers the last visible row. The channel chips are cut off at the right edge ("Not In Your Texti...") with no hint that they scroll. | R10 |
| A13 | The Failed list showed "No runs to show here." while the channel chip "Not In Your Textbook" was still selected from earlier (the channel filter is kept and nothing says so). That may be correct (the Lego run is Published, with failed attempts inside it) or a bug; not proven either way. | R10 |
| A14 | Run detail: the Brief card is cut off with "..." and has no Show more. The Script tab shows two full chapters and puts "Show full script" at the bottom of the card. | R11 |
| A15 | Run detail has two history sections: Step history and Details (a flat list of stages and attempts, "FAILED, tap for why"). Details shows "video review attempt 1 done" although attempt 1 failed review. | R11 |
| A16 | "Why didn't it work? optional tags" is shown on a video published a few hours ago, before any views. All 7 progress segments are red on a finished run, and red also means failure elsewhere on the screen. | R11 |

## Decisions (defaults apply unless the founder says otherwise)

- **D1, which settings can change on a run (R4):** voice, music mood, picture style, YouTube visibility and max spend can change on a failed or waiting run; topic, format, length and the approved script cannot after Gate 1 (they would invalidate finished work). The first step is a stage-by-setting table sent to the architect before coding.
- **D2, notifications (R5):** one push for "retrying after a failed review" and one for "run blocked or failed"; the Gate 2 push stays as it is.

## R0. Read the code first

Table in the report: each item below **confirmed** or **wrong (what is really there)**.
1. How the Inbox loads runs: page size, cursor or "load more", cache, filter, and which change lowered it (A1). Use the git history of the Inbox and the runs list call.
2. What `runs.get` returns today for cost, attempts, script and approved script, and what Task 8 will add.
3. Where the failure message is built (provider text or a mapped message) and where the spend limit can be changed.
4. How the Edit sheet validates chapters.

## R1. Inbox shows every run (A1)

Find the cause (page size, a limit left in a query, missing cursor handling, a filter or a cache) and fix it: load the first page, load more on scroll or "Load more", show the total count if the backend returns it. If the backend list is the cause, Task 8 R12 fixes it; say so in one line and build the app side against its contract. Test with more than 30 runs, pull to refresh, and a run that finishes while the list is open.

## R2. Cost on the Run screen (A2, A10) (needs Task 8 R8)

On the Run screen: total spend so far (final cost when the run ends), the estimate and the limit. In step history, each attempt shows its cost and expands to cost per stage (script, review, voice, images, render, video review). Show the same at Gate 2 and on finished runs. A cost that is $0 for a failed provider call is shown as failed, not as an error. Use 4 decimals only where the amount is under $0.01. The Admin run view groups its cost events by attempt and stage with subtotals that match the total.

## R3. Show the approved script (A3) (needs Task 8 R11.1)

After Gate 1 the Script tab and Gate 2 show the approved (edited) text with its real word count and estimated length; a labelled "Original draft" section shows the writer's version, and the screen says which one the video used. Before Gate 1 the draft is shown as today.

## R4. Change settings on a failed or waiting run (A4)

Add "Edit settings" on the failure card and the waiting screens. It lists only the settings allowed at the current stage (D1), then "Save and retry this step". It keeps the approved script, the money already spent and every finished step; it does not restart from the first stage. A change that would invalidate finished work is shown as unavailable with the reason in one line. Changes are recorded in the step history. Backend support (an update-run-settings call and the preflight re-check) is a dependency: if it is missing, send the architect the exact call you need before coding, so a Task 8 follow-up can add it. First step of this item: the stage-by-setting table.

## R5. Attempts, failure messages and notifications (A5, A6) (needs Task 8 R5)

1. Attempt labels from the backend outcome: completed, failed review (with the reason, for example "longest shot 8.3 s, limit 7.5 s"), failed error (with a short plain reason), blocked, cancelled, running. Never green "done" for a failed review.
2. Failure card in plain language for known cases: voice not supported by the model, provider usage limit (show the return date when given), spend limit ("this video used $0.51 of its $0.50 limit: raise the limit and retry", with the control right there), video review found a problem (the reason). Unknown errors show a short sentence with the full text under Technical details; never a text cut off in the middle of a bracket.
3. Notifications per D2.

## R6. Voice picker with play buttons (A7) (needs Task 8 R10 Part B)

On channel settings, run setup and Edit settings (R4): a list of enabled voices from the catalog, each with name, tone tags and a play and pause button that streams its stored preview (one plays at a time). Selected state is clear; no provider ids are shown. Channel default plus per-run override. If the catalog is not ready, build the picker against a documented stub and tell the architect.

## R7. Script editor on a phone (A8)

Full-screen editor, not a bottom sheet under the keyboard. A "Copy script" button, a live chapter counter ("3 chapters") and a one-line hint about the `## Chapter title` format before Save, a live word count and estimated length against the target (warn under the floor of 80% of target), the cursor position kept when the keyboard opens, and the existing server error shown clearly if Save is rejected.

## R8. Gate 2 extras (A9)

A "Download or share the preview" action (the 720p preview file) at Gate 2, and a line showing how many regenerations were used and the sampled frames the reviewer looked at. Lowest priority; do it last or leave it as a follow-up with a one-line reason.

## R9. Carry-overs (A11)

Confirm or fix each, one line each in the report: the missing Admin button on the Channels screen (check the app version and `admin.whoami` first); the "(default)" suffix on the tiles; the per-channel colour setting; tester-facing bug type and priority chips; items R10.3 and R10.10 from the old list; add the app tests to CI.

## R10. Queue: stable layout, channel filter, empty states (A12, A13)

1. The status filter (All, Published, Cancelled, Failed) must never move the banner or the header. Put the "Nothing waiting on you" banner above the filters, keep the filter row fixed, and let only the list change height. No large blank gap for a short or empty list.
2. Add bottom padding to the list so the "New brief" button never covers the last row.
3. Channel chips: scroll horizontally with a fade at the edge, or wrap, so no chip name is cut off; the selected chip is clearly marked.
4. The channel filter must be visible when it is on. When a channel is selected, say so near the list ("Showing Not In Your Textbook, show all") and reset it to All channels when the app starts. The Inbox and Queue should not disagree silently about what is filtered.
5. Empty states say why: "No failed runs in Not In Your Textbook. Show all channels."
6. Check the Failed filter with All channels against seeded data: a run whose final state is Failed appears; a published run with failed attempts does not (say which rule you applied in the report). If a run that ended failed is missing, fix the filter or tell Task 8 which field is wrong.

## R11. Run detail: previews, one history, status colours (A14, A15, A16)

1. Brief and Script cards show 4 to 5 lines and a "Show more" / "Show less" button directly under the text, not below the whole text. Same component for both; the Script card shows the first lines of chapter 1, not two full chapters.
2. Remove the "Details" section. Step history becomes the only history: each attempt shows its outcome and reason (R5), and "tap for why" moves into the attempt row. Stage rows that only Details had (publishing, analytics) appear in Step history so nothing is lost.
3. "Why didn't it work? optional tags": show it only when it is useful (after the first analytics poll, or when the run failed or was rejected), and name it for what it is. Ask the architect before removing it, because it may be the feedback hook from an earlier task.
4. Progress bar colours: done is a calm completed colour, current is amber, failed is red, pending is grey. A finished run is not all red. Use the existing colour tokens; if none fits, propose one.

## Not in this task

Any backend change (Task 8), the voice catalog itself (Task 8 R10), music following the emotion of the story, Script Review (Task 6), public publishing, new agents, web search.

## Acceptance criteria

All Success Criteria above, plus: each of A1 to A16 is marked fixed, waiting on Task 8 (with the field named) or deferred (with reason); screenshots of the Inbox with more than 8 runs, the cost view, the Edit settings sheet and the voice picker, attached to the report or listed as missing.

## Schema Impact

None in the app. Backend changes belong to Task 8.

## Business Logic / State Transition

No new states in the app. It shows the backend outcomes and the "blocked, waiting for provider" state from Task 8 R4. Update the app screen notes in `docs/` only for the screens you change.

## Testing

App type-check, lint, app tests; test the Inbox paging, the cost sums on a fixture, and the Edit settings rules. Build and run on a phone-size layout; report anything skipped as skipped, not passed.

## Report

`docs/execution/sprint5/reports/task7.md`: the R0 table, A1 to A16 status table, one section per requirement, screenshots, what waits on Task 8, deviations, and a one-line status to the founder. Code-complete, merged and deployed (and the app build number) are reported as separate statements.

## Definition of Done

Merged PR(s); tests pass; A1 to A16 each marked; a new app build on the founder's phone shows the Inbox, cost and Edit settings working against the deployed backend.

## Links

[Task 8, backend fixes](task8.md) · [Task 6, Script Review rules](task6.md) · [WORKFLOW](../WORKFLOW.md) · [Acceptance plan](../SPRINT4_5_ACCEPTANCE_PLAN.md) (once on `main`)
