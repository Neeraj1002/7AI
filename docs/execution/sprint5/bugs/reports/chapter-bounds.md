# BUGS_CHAPTER_BOUNDS report

**Branch**: `BUGS_CHAPTER_BOUNDS` (cut from `origin/main` 9d1d72f). **Worktree**: `D:\Study Material\7AI-BUGS_CHAPTER_BOUNDS`. **PR**: none yet (nothing pushed).
**Task doc**: none was handed out; the task came as a chat message, so Hard rule 5 had nothing to sync. The "sweep rule" the message refers to was not in it; I swept the whole repo (code, scripts, app, docs) for every old value.

## R0: where a chapter count, chapter minimum, pace or chapter timing is defined or assumed

| Place | What it said | Now |
|---|---|---|
| `script-generation/long-form.ts` `LONG_MIN_CHAPTERS` 3, `LONG_MAX_CHAPTERS` 6, `LONG_MIN_CHAPTER_WORDS` 25 | the hard-coded limit | removed; read from `long-form/chapter-bounds.ts` |
| `buildLongSystemPrompt` | printed `({LONG_MIN_CHAPTERS} to){LONG_MAX_CHAPTERS}` and `\${LONG_MIN_CHAPTER_WORDS}` literally: the model was never told a number | exact count, exact titles, word minimum |
| `validateChapters` | `expected 3 to 6 chapters, got N` | `Your reply has N chapters, but this video needs exactly 7 chapters (...)` |
| `generateLongScript` retry | generic "did not match the required shape" | names the count returned and the allowed range |
| `parseChapterSheet` (Gate 1 edit; called by `runs.gate1` and the state machine) | only "at least 3" | same bounds as the model's reply, for the run's length |
| `long-form/chapters.ts` `MIN_CHAPTERS` 3, `MIN_CHAPTER_SECONDS` 10 (YouTube list) | a second copy of the same rule | re-exported from `chapter-bounds.ts` |
| `LONG_WORDS_PER_MINUTE` 155 | owned by long-form.ts | moved to `chapter-bounds.ts`, re-exported (cost estimate and video generation unchanged) |
| `script-review` long prompt | "about **145** words per minute" | **disagreed with 155**; now interpolated from the constant |
| `formats/manifest.ts` `chaptered-explainer` hint | "About **4** chapters." sent to the model as `Format structure:` next to a brief listing 7 | count removed; the default for a length lives in `chapter-bounds.ts` |
| `video-generation/plan-long.ts` | at least 2 stills per chapter, 12 to 200 stills | unchanged; 20 chapters at the shortest length still gets 2 each |
| `video-intelligence` `MAX_REVIEW_FRAMES` 12 | thins chapters above 12 | unchanged; already handles more chapters |
| `long-narration.ts` `CHAPTER_GAP_SECONDS` 0.25 | pause between chapters | unchanged (not a bound) |
| `cost-estimate.ts` Shorts 150 wpm; `buildUserMessage` Shorts 150 | Shorts pace | unchanged |
| Not changed on purpose: `formats/video-kind.ts` 120 to 900 s | video length | n/a |

**App mirrors (for the Task 7 agent)**: no limit is hard-coded. `GateActionBar.tsx:36` has a comment saying "fewer than 3 chapters"; the message shown is the server's. `app/(app)/run/[id].tsx:711` `chapters.length > 2` only decides when "Show full script" appears. The server's edit-sheet message now also says things like "The edited script has 21 chapters, but this video needs 3 to 20 chapters" (and a chapter under 26 words is refused), so Sprint 5 Task 7 item A8 ("needs at least 3 chapters" only after Save) should read the new wording; the too-few message is unchanged. `runs.get` returns `run.creationOptions.intakeWarnings` (new, optional list of plain sentences) for the soft warning.

**Docs that still state the old numbers (architect-owned, not edited)**: `sprint4/BUSINESS_LOGIC.md:98`, `sprint4/reports/task9.md:48`, `sprint4/tasks/task9.md:63,65` (145 wpm, 3-6 chapters); `sprint5/tasks/task7.md` A8. Old model-output fixtures mention 145 wpm; they are recorded history.

## What changed

- `studio/src/long-form/chapter-bounds.ts`: the one owner. Floor 3, ceiling `min(20, floor(seconds / 10))`, minimum 10 s per chapter = `ceil(10 x 155 / 60)` = **26 words** (the task said "about 25"; 25 words is 9.7 s, under YouTube's 10 s), soft average 40 s, default count `round(seconds / 150)` clamped (2 min: 3, 5: 3, 10: 4, 15: 6). `chapterBounds()` returns the allowed range; titles from the brief make it exactly their count.
- `studio/src/long-form/brief-chapter-plan.ts`: reads titles (`... titles exactly: "A", "B"`, curly quotes, or `Chapter N: "Title"`), the announced count on that line, word budgets (`word budget(s)...: 60, 125` or `Chapter N: about 120 words`) and fact allocations (`chapter allocation:` line, or `Chapter N uses ...`). `checkBriefChapterPlan()` is the intake check.
- Intake (`runs.create`, `runs.rerun`, long only, before the cost estimate and before any spend): `The brief has 8 titles but 7 word budgets. Make the lists in the brief match before starting.`; a count outside 3 to the length's ceiling; a word budget under 26. Average chapter under 40 s: a warning in `creationOptions.intakeWarnings` and the log, not a failure. Shorts are not touched.
- Prompt: `Write exactly 7 chapters ... with these exact titles: 1. "..."`; with no titles `Write between 3 and 12 chapters ... default for this length is N`.

## Tests (all green: 1,245+ passed, typecheck and lint clean)

2, 5, 10 and 15 minutes; 7, 8 and 9 listed chapters accepted at the bounds, intake and generation; 21 rejected (reply, intake, edit sheet); 8 titles with 7 budgets, titles with 6 allocations, budgets with allocations and an announced count that differs, all stopped with no run created and no budget lookup; soft warning at 9 chapters in 5 minutes and none at 7 in 10; Shorts unchanged (a Short ignores chapter lists); repair message names the count returned and `exactly 7`.

## Real check (dev, one live call, ceiling $0.30)

`npx tsx scripts/chapter-bounds-real-check.ts --brief <file> --live` (`--live` is required to spend; the cost cap is the `CEILING_USD` constant). Mary Celeste brief, 600 s. Intake passed: 7 titles, 7 word budgets, 7 allocations. The prompt carried `exactly 7 chapters` and the 7 titles. **Result: 7 chapters, all 7 titles exact, 3 calls, $0.1826.** Calls 2 and 3 were the length repairs (first script 2,875 output tokens), not chapter-count retries. Final 1,370 words, `lengthOutOfRange` false.

A first offline run on this brief failed intake with "7 titles but 6 fact allocations": chapter 7's allocation says "restates", not "uses". Fixed (labelled `chapter allocation:` line counts every chapter named) and covered by a test with this brief's line.

## Observations, not changed

- The script target is 155 wpm x 10 min = 1,550 words (accepted 1,395 to 1,706); the brief says "about 1,500". 1,370 lands in the 10 to 20% band, so it is accepted but cost two repairs.
- The brief's per-chapter word budgets (60, 125, 340, 375, 375, 175, 50) are checked for count only. The model's chapters were 51, 172, 321, 305, 197, 256, 68, so chapter 5 is about half its budget. Enforcing budgets is a separate decision.
- The Gate 1 checklist content (quotes, chapter 7 sentence limits, "ghost ship" only in chapter 4) was not reviewed here.

## Hard rule 6 / 8

Not done yet: nothing is pushed, no PR is open. Before `gh pr ready`: fetch, pull `main`, re-run build, lint, typecheck and tests, and check `git diff --name-only origin/main...HEAD -- docs/` lists only this report.
