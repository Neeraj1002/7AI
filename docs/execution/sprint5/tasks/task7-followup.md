# Sprint 5 Task 7 Follow-up: Row 11 designs and chapter bounds from the server (Frontend)

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting**, then [WORKFLOW](../WORKFLOW.md). Use `task7b` under the shared Sprint 5 root (`D:\Study Material\7AI-SPRINT5`), your own worktree off fresh `main`, branch `SPRINT5_TASK7_FE_FOLLOWUP`, one PR. Do not edit `STATUS.md` or any doc except your own report; give branch, worktree and PR in your first reply and at the top of the report (Hard rule 7).

**Keep replies and tool output short: no step-by-step narration, read only the files you need, one-line status messages.**

**Revision**: r2, 2026-10-24, the server field gained `editMin`, `editMax` and `targetWords`; `exactCount` is advice; two more mirrored values listed. r1, 2026-10-21, first issue.

**Written**: 2026-10-21 by the architect chat, at the founder's request. **Status**: PR #113 is open and ready (24 Oct), built against the four-field version of `chapterBounds`; the r2 changes below go in as one more commit in #113 (or a small PR if #113 is already merged). **Priority**: P1 (after PR #106 merges and is built on a phone).

**Objective**: two things in one app-only PR. (1) Build the "row 11" designs the founder approved: the Voice picker becomes a page inside the Edit settings sheet (no second modal), and the per-attempt cost breakdown moves onto the Run screen's cost card. (2) Stop the app from mirroring the server's chapter rules: read the chapter bounds and the intake warnings from the server and use them in the Gate 1 edit sheet and on the run screens.
**Duration**: 1.5 to 2 days.
**Depends On**: PR #106 merged (the Task 7 screens exist); PR #112 merged, and PR #115 merged (it adds the read-only field `runs.get.chapterBounds`; see R3 and the chapter-bounds task doc r3). Until that field is deployed, R3 and R4 degrade quietly (no bounds means no live counter limit; the server's message after Save still shows).
**Owning Component**: `app/` only (Edit settings sheet, Voice picker, cost card, step history, Gate 1 edit sheet, New brief result, Run screen). **Not** in scope: any backend change.
**Success Criteria**: (1) in Edit settings the user opens the voice list as a page inside the same sheet and returns with the choice kept; no stacked modal; (2) the cost card expands to cost per attempt and per stage, and step history shows each attempt's outcome and reason without repeating the cost; (3) the Gate 1 edit sheet shows live chapter count and words-per-chapter limits taken from `runs.get.chapterBounds`, with no chapter-count constant in the app; (4) intake warnings appear on the run as a plain sentence and never block; (5) app type-check, lint, tests and web export pass; each changed screen checked at phone size, with screenshots from a phone or emulator in the report.

## R0. Read first (table in the report, at most 12 lines)

1. Open the row 11 designs the founder gave you and list, per screen, what they show (Voice picker page, cost card). If a screen is not in them, say so and build from the decisions below, marking the gap.
2. Confirm in `app/` where the chapter rule is mirrored today: `lib/script-editor.ts` (the mirror of `parseChapterSheet`), the Gate 1 edit sheet, `GateActionBar.tsx` (a comment about "fewer than 3 chapters"), `run/[id].tsx` (`chapters.length > 2` decides when "Show full script" appears). Say which are limits and which are only layout.
3. Confirm the backend field exists on `main`: `runs.get.chapterBounds { min, max, minWordsPerChapter, exactCount, editMin, editMax, targetWords }` and `runs.get.run.creationOptions.intakeWarnings`. If `chapterBounds` is missing, stop on R3 and tell the architect; do not add a constant.

## R1. Voice picker as a page inside Edit settings (decided by the founder, 21 Oct)

The Edit settings sheet gets a second "page" for voices (slide in, back arrow returns to the settings list). No second modal. One sample plays at a time, as built in Task 7; the sheet keeps the user's unsaved choices when going back and forth. Same component for channel settings and run setup if they currently stack a modal; if that is a larger change, do Edit settings only and list the rest.

## R2. Cost per attempt on the cost card (decided by the founder, 21 Oct)

The cost card on the Run screen holds the breakdown: total spent, estimate and limit as today, then one expansion with cost per attempt and, inside each attempt, per stage (from `videoAttempts[]` and `stageSummaries[]`, read through the existing `costBreakdownOf`). A failed call that was not charged reads "failed, not charged". Step history keeps each attempt's outcome and reason only; no cost repeated there. Four decimals only under one cent.

## R3. Chapter bounds and target from the server (no constants in the app)

Read `runs.get.chapterBounds { min, max, minWordsPerChapter, exactCount, editMin, editMax, targetWords }` (null for Shorts). Their meaning: `min`/`max`/`exactCount` are what **generation** needs; `editMin`/`editMax` are what a **Gate 1 edit** accepts; `targetWords` is the script target the server uses. Use them in the Gate 1 edit sheet:
- Live chapter count against `editMin` and `editMax` (these are the limits). When `exactCount` is true, add one plain amber line "The brief lists N chapters" as advice only; never block on it (a Gate 1 edit may change the count; founder decision 24 Oct).
- A per-chapter warning under `minWordsPerChapter`; the server's own message after Save shown as sent.
- The word-count and length-against-target display uses `targetWords`, not words-per-minute x minutes. If the field is absent (older server), show the count with no target.
- Remove from `lib/script-editor.ts` and `lib/script-versions.ts` the 3-chapter minimum and its message and the 155 pace; keep only the parsing of `## Chapter title`.
- Add all seven fields to `lib/task8-contract.ts` so a rename breaks `tsc`.

## R4. Intake warnings

Show `run.creationOptions.intakeWarnings` (optional list of sentences) on the Run screen and after run creation, as plain amber lines under the brief ("Each chapter averages about 30 seconds; chapters usually work better at 40 or more"). Never block, never red. Absent means nothing is shown.

## R5. Same-cause sweep (Hard rule 9)

Search `app/` for any other copy of a server rule (chapter counts, minimum words, words per minute, 3-chapter messages) and list each hit in the report as fixed here, left alone with a reason, or needs a new task. Where the server owns the value, the app reads it. Known hits from the chapter-bounds report: the 3-chapter minimum and the 155 pace (fixed by R3); the 2 and 15 minute limits in `lib/long-brief.ts` and the source limits in `lib/brief-extras.ts` (left alone here: the server must expose them first; they need a new task).

## NOT in this task

Any backend change; per-chapter word budgets (not enforced anywhere); Share/download of the video (Sprint 6 plan item P13); a native module other than those already in the build.

## Schema Impact

None.

## Business Logic / State Transition

None. The Gate 1 edit still goes through `runs.gate1`; the server's validation stays the source of truth.

## Testing

Unit tests for: the voice page keeps unsaved choices across back and forth; the cost card expansion with a failed-not-charged row and a sub-cent amount; chapter bounds absent, exact count (advice line, no block), and a range; the target from `targetWords`; a chapter under the minimum words; intake warnings absent, one, several. `npx tsc --noEmit`, `npx eslint .`, `npx vitest run --root ../app`, `npx expo export --platform web`. Phone or emulator screenshots of the Voice page, the cost card expansion, the Gate 1 edit sheet with a limit warning, and a run with an intake warning. If no phone or emulator is available, say so; the founder will take them from the build.

## Report

`docs/execution/sprint5/reports/task7-followup.md`: branch, worktree and PR at the top; R0 table; per item done and what was seen on a device; the sweep section; Hard rules 5 to 9 lines; code-complete, merged and deployed as three separate statements.

## Definition of Done

Draft PR opened with the first push, CI green on the final head, `main` pulled (Hard rule 6), docs scope clean (this task doc identical to the source and your report only), `gh pr ready`. After the founder merges: close per Hard rule 8.

## Links & References

[Task 7](task7.md) and its report · [Task 8 contract](task8.md) · [chapter-bounds task](../bugs/tasks/chapter-bounds.md) · Sprint 6 plan P13 (share and download)

## Revision log
- r1, 2026-10-21: first issue.
- r2, 2026-10-24: `chapterBounds` gained `editMin`, `editMax`, `targetWords` (PR #115); `exactCount` shown as advice only; the app's 155 pace replaced by `targetWords`; the 2 to 15 minute and source limits listed as a new task.
