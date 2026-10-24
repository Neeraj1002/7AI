# Sprint 5 Bug Task (named): Chapter bounds - one owner for chapter counts, minimums and pace, plus an intake check

**Read `docs/execution/bugs/HOTFIXER_AGENT_PROTOCOL.md` and `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** They define the branch, worktree, commit, report and review rules. This file states only what is specific to this task. Keep every reply to the founder to 3 lines; only the report is long. Do not edit `STATUS.md` (either one) or any doc except your own report and the one doc named in R8.

**Revision**: r3, 2026-10-24, R9 extended with `editMin`, `editMax` and `targetWords` (so the app mirrors no chapter limit and no pace); r2, 2026-10-21, R9 added (server sends the chapter bounds to the app); r1 was written after the work started (the architect forgot to hand out a task doc).

**Written**: 2026-10-21 by the architect chat, at the founder's request. **Status**: R1 to R8 merged (PR #112, 21 Oct). R9 is a second small PR: new branch `BUGS_CHAPTER_BOUNDS_R9` off fresh `main` in the same worktree (`D:\Study Material\7AI-BUGS_CHAPTER_BOUNDS`). Do not run the Hard rule 8 closing until the R9 PR is merged. **Task doc**: `docs/execution/sprint5/bugs/tasks/chapter-bounds.md`. **Priority**: 1 (blocks every Cold Open long-form run and the combined test).

**Git rules for this task**: template Hard rules 5 to 9 apply in full (task doc sync, pull `main` and docs-scope check before ready, who owns which doc, close after merge, same-cause sweep). The latest version of this file is in `D:\Study Material\7AI\docs\execution\sprint5\bugs\tasks\chapter-bounds.md`; copy it into your branch as a commit, never edit it. Report path: `docs/execution/sprint5/bugs/reports/chapter-bounds.md` (Sprint 5 bug folder, per the founder's 19 Oct decision; the protocol amendment is Sprint 6 plan item P8).

**Objective**: a long-form script must be accepted when it has the number of chapters its brief asks for (7, 8 or 9 for Cold Open), for any video length from 2 to 15 minutes. Today the run failed with "expected 3 to 6 chapters, got 7" because the limit was hard-coded when long videos meant 2 to 10 minutes.

## What happened, in plain words

The first Cold Open run (Mary Celeste brief, 7 chapters with exact titles) failed Script Generation twice: the model finished normally (stopReason=stop, about 1,500 words) but the reply check allowed 3 to 6 chapters. R0 found a worse fault: the system prompt never told the model a number; it printed the literal text `{LONG_MIN_CHAPTERS} to){LONG_MAX_CHAPTERS}`. Script Review used 145 words per minute while Script Generation used 155; the format hint said "About 4 chapters" next to a brief listing 7; YouTube's rule (3 chapters, 10 seconds each) was defined a second time in `chapters.ts`.

## Founder decisions (20 to 21 Oct)

- D1: chapter bounds come from one function; a brief that lists titles sets the exact count; no titles means the default scales with length; floor 3, ceiling 20 (fewer when the video is too short to give each chapter 10 seconds).
- D2: hard minimum 10 seconds per chapter (26 words at 155 wpm, since 25 words is 9.7 s); soft warning under about 40 seconds on average (`intakeWarnings`, never a failure).
- D3: a mismatch inside the brief (titles, word budgets, fact allocations) stops the run at intake, before any spend, with a plain sentence.
- D4 (21 Oct): a word count stated in the brief wins over the derived target (with the usual +/-20%).
- D5 (21 Oct): per-chapter word budgets are NOT enforced in code (a hard check triggers paid repairs). Chapter 5 of the live run came out at 197 words against a budget of 375; a chapter far outside its budget should be an advisory note at Gate 1. That belongs to the story editor (Sprint 6 plan item P12), not this task.

## R0 - Read first (done; keep the table in the report)

List every place a chapter count, minimum words per chapter, words-per-minute or chapter-timing constant is defined or assumed (schema, prompt, `parseChapterSheet`, long-form Script Review, planner, chapter timings, YouTube chapters, the app). Report each with file and line, and any two that disagree.

## R1 (BE) - One owner for the bounds (done on the branch)

`studio/src/long-form/chapter-bounds.ts` is the only place these numbers live. The prompt, the reply check, the repair message, the Gate 1 edit sheet, Script Review and the YouTube chapter list all read it. Shorts are unchanged.

## R2 (BE) - Read the brief's plan (done on the branch)

`studio/src/long-form/brief-chapter-plan.ts` reads titles, word budgets and fact allocations from the brief, including a labelled "chapter allocation:" line and the wording "restates" as well as "uses". A brief with no titles, no budgets or no allocations is NOT an error.

## R3 (BE) - Intake check (done on the branch)

`runs.create` and `runs.rerun` stop a mismatched long brief before any spend, for example "The brief has 8 titles but 7 word budgets". A chapter count outside the allowed range is refused. Warnings only for a short average chapter.

## R4 (BE) - Repair retry says the numbers (done on the branch)

The repair message names the count the model returned and the allowed range ("has 9 chapters, but this video needs exactly 7").

## R5 (BE) - Same-cause sweep (done in part; finish)

Hard rule 9. The report has a sweep section: every old value found, with file and state (fixed here, left alone with reason, needs a new task). The app has no mirrored limit; keep the list for the Task 7 agent. Old Sprint 4 docs are historical: do not edit them, list them.

## R6 (BE) - Name the flaky failure

One earlier full test run had a single failure nobody identified. Run the full suite three times with the default worker count, capture the failing test's name and say whether it is the known pair from Task 8 (the two CPU-heavy tests that time out when every worker is busy). An unnamed failure cannot stay in the report.

## R7 (BE) - The intake check must not stop good briefs

Run the intake check against every known long-form brief: Appendix A and Appendix B of `sprint5/tasks/task6.md`, the Underdogs Lego brief, the NIYT briefs in `channel_bibles/NIYT_CHANNEL_CONFIG.md`, and the Mary Celeste brief. It stops a brief only when two lists that are present disagree, never because a list is absent. Add each as a test fixture.

## R8 (BE) - A word count stated in the brief wins (D4)

When the brief states a word count ("about 1,500 words"), the script target and the length check use it (+/-20%) instead of words-per-minute x minutes. Otherwise the derived target applies. Add the Mary Celeste case as a test (1,500 stated versus 1,550 derived). Also add a short "Chapter bounds" section to `docs/execution/sprint5/BUSINESS_LOGIC.md` (the one doc this task may edit besides its report): what sets the count, the minimums, the ceiling, the intake check, and that a stated word count wins.

## Real check (done: $0.1826 of $0.30)

One live script generation on dev with the Mary Celeste brief: 7 chapters with the exact titles. Re-run only if R8 changes the target; ceiling $0.30 in total for the task.

## R9 (BE) - Send the chapter bounds to the app (r2, founder decision 21 Oct)

**Why**: the app must not copy the server's chapter rules (the same mistake in a new place). The Gate 1 edit sheet enforces 3 to 20 chapters and 26 words per chapter on the server, and the app only knows "at least 3" before Save. The Task 7 follow-up (`sprint5/tasks/task7-followup.md`, R3) reads this field.
**Change** (read-only, computed from the run, no stored data): `runs.get` returns, for a long-form run, `chapterBounds: { min, max, minWordsPerChapter, exactCount, editMin, editMax, targetWords }`, and `null` for a Short. `min`, `max` and `exactCount` say what **generation** needs (`min` equals `max` when the brief lists its titles). `editMin` and `editMax` say what a **Gate 1 edit** accepts for this run's length (3 to the length's ceiling); a founder may change the chapter count away from the brief's titles at Gate 1, so `exactCount` is advice for the app, not a limit. `targetWords` is the script target the server really uses (the brief's stated word count if it has one, else minutes x the voice's measured pace, else 155). All numbers come from `long-form/chapter-bounds.ts` and the existing pace helper, so there is still one owner. Declare them in the `runs.get` output type. An older run whose brief or voice cannot be read returns the length-based default, never an error. Built in PR #115 (r3 fields added in the same PR).
**Tests**: a Short returns `null`; a 10-minute run with no titles returns the default range; a run whose brief lists 7 titles returns 7, 7 and `exactCount: true`; a 2-minute run's ceiling is the length-based one; `editMin`/`editMax` are 3 and the ceiling even when the brief lists 7 titles; a brief with a stated 1,500 words returns `targetWords` 1,500; an old run returns a value without throwing; `runs.get` output for the existing fields is unchanged.
**Rules**: no live LLM call and no spend in this requirement. Do not change schema, `runs.create` or intake. Do not touch `app/`. Hard rules 5 to 9 apply; the report gets an "R9" section and keeps the sweep section (list any other value the app might still mirror, for the Task 7 follow-up agent).

## NOT in this task

Enforcing per-chapter word budgets (D5; P12). Choosing the default words-per-minute from the voice's measured pace (Task 8 R7 owns pace; a later item will make the script target follow it). Editing Sprint 4 docs. Any app change (list it for the Task 7 agent). Any schema change (stop and ask).

## Schema Impact

None. `intakeWarnings` goes in existing run JSON; confirm and report.

## Business Logic / State Transition

Intake can now refuse a long-form run with a plain sentence (existing refused-before-spend path). No new state.

## Testing

Lengths 2, 5, 10 and 15 minutes; 7, 8 and 9 chapters accepted when the brief lists them; 21 refused; a mismatched brief stopped at intake; every known brief passes intake (R7); a stated word count wins (R8); Shorts unchanged; typecheck, lint, build, full suite (use `--maxWorkers=4` and say so). One live check as above.

## Report

`docs/execution/sprint5/bugs/reports/chapter-bounds.md`: branch, worktree and PR at the top; R0 table; the sweep section; the flaky-test finding; Hard rules 5 to 9 lines; code-complete, merged and deployed as three separate statements.

## Definition of Done

Draft PR opened, CI green on the final head, `main` pulled, docs scope clean (task doc identical to the source, your report, `BUSINESS_LOGIC.md`), `gh pr ready`. After the founder merges: close per Hard rule 8.

## Links & References

[Task 8](../../tasks/task8.md) (R7 voice pace) · [Task 6](../../tasks/task6.md) · [Hot-fixer protocol](../../../bugs/HOTFIXER_AGENT_PROTOCOL.md) · [Cold Open channel config](../../../../channel_bibles/COLD_OPEN_CHANNEL_CONFIG.md) · Sprint 4 Task 9 R2 (the original 3 to 6 rule; historical)

## Revision log

- r1, 2026-10-21: first issue, written after the work started; folds in the agent's R0 findings and founder decisions D1 to D5.
- r2, 2026-10-21: R9 (the server sends `runs.get.chapterBounds`); #112 is merged, R9 ships as a second small PR; closing (Hard rule 8) waits for it.
- r3, 2026-10-24: R9 extended in the same PR #115: `editMin`, `editMax` and `targetWords` added; `exactCount` is advice (founder decision: a Gate 1 edit may change the count away from the brief's titles); the app's 2 to 15 minute limits (`lib/long-brief.ts`) and source limits (`lib/brief-extras.ts`) need a new task so the server owns them.
