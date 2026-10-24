# BUGS_CHAPTER_BOUNDS report

**Branch**: `BUGS_CHAPTER_BOUNDS` (first cut from `origin/main` 9d1d72f; `main` merged in at 7f9655f). **Worktree**: `D:\Study Material\7AI-BUGS_CHAPTER_BOUNDS`. **PR**: [#112](https://github.com/Neeraj1002/7AI/pull/112) (draft until the last step below).
**Task doc**: `docs/execution/sprint5/bugs/tasks/chapter-bounds.md` r1, copied in unchanged (commit `BUGS_CHAPTER_BOUNDS_DOC`). It was handed out after the first code commits, so it is not the branch's first commit (Hard rule 5 asks for first); it is identical to the source.

**R9** (second PR): branch `BUGS_CHAPTER_BOUNDS_R9`, worktree `D:\Study MaterialAI-BUGS_CHAPTER_BOUNDS` (recreated at the same path: the R1 to R8 worktree had been removed by the Hard rule 8 closing before R9 was handed out), PR [#115](https://github.com/Neeraj1002/7AI/pull/115). Task doc r2 copied in unchanged as the branch's first commit (`BUGS_CHAPTER_BOUNDS_R9_DOC`).

Status, as three separate statements. R1 to R8 (#112): **code-complete** yes, **merged** yes (21 Oct), **deployed** not stated here. R9 (#115): **code-complete** yes, **merged** no, **deployed** no.

## R0: where a chapter count, chapter minimum, pace or chapter timing is defined or assumed

| Place | What it said | Now |
|---|---|---|
| `script-generation/long-form.ts` `LONG_MIN_CHAPTERS` 3, `LONG_MAX_CHAPTERS` 6, `LONG_MIN_CHAPTER_WORDS` 25 | the hard-coded limit | removed; read from `long-form/chapter-bounds.ts` |
| `buildLongSystemPrompt` | printed `({LONG_MIN_CHAPTERS} to){LONG_MAX_CHAPTERS}` and `\${LONG_MIN_CHAPTER_WORDS}` literally: the model was never told a number | exact count, exact titles, word minimum |
| `validateChapters` | `expected 3 to 6 chapters, got N` | `Your reply has N chapters, but this video needs exactly 7 chapters (...)` |
| `generateLongScript` retry | generic "did not match the required shape" | names the count returned and the allowed range |
| `parseChapterSheet` (Gate 1 edit; called by `runs.gate1` and the state machine) | only "at least 3" | same bounds as the model's reply, for the run's length |
| `long-form/chapters.ts` `MIN_CHAPTERS` 3, `MIN_CHAPTER_SECONDS` 10 (YouTube list) | a second copy of the same rule | re-exported from `chapter-bounds.ts` |
| `LONG_WORDS_PER_MINUTE` 155 | owned by long-form.ts | moved to `chapter-bounds.ts`, re-exported |
| `script-review` long prompt | "about **145** words per minute" (disagreed with 155) | interpolated from the constant |
| `formats/manifest.ts` `chaptered-explainer` hint | "About **4** chapters." sent to the model next to a brief listing 7 | count removed |

## Same-cause sweep (Hard rule 9)

Searched `studio/src`, `studio/scripts`, `app/` and `docs/` for the old values (`3 to 6`, `LONG_MIN/MAX_CHAPTER*`, `145`, `About 4 chapters`, chapter minimums, words-per-minute copies).

| Hit | State |
|---|---|
| The five code rows above (limits, prompt placeholders, YouTube duplicate, review 145, format hint) | **Fixed here** |
| `cost-estimate.ts` (long: 155 wpm default; ignores a stated word count) | Left alone: it prices a video before the brief or voice is known; an estimate only |
| `run-pipeline/length-forecast.ts` (Gate 1 "expected length": text against the run length at the voice's pace) | Left alone: it judges the narrated duration the viewer gets, which a stated writing target does not change |
| `video-generation/long-form.ts:123` log line says "script planned at 155" even when the plan used the voice's pace or a stated count | Left alone: log text only; **needs a new task** if the log is to be exact |
| `cost-estimate.ts` Shorts 150 wpm, `buildUserMessage` Shorts 150 | Left alone: Shorts are out of scope |
| `plan-long.ts` (2 stills per chapter, 12 to 200 stills), `video-intelligence` `MAX_REVIEW_FRAMES` 12, `long-narration.ts` `CHAPTER_GAP_SECONDS` 0.25 | Left alone: not chapter-count bounds; already correct for 3 to 20 chapters |
| `formats/video-kind.ts` 120 to 900 s | Left alone: video length, not chapters |
| `sr-*.json` fixtures and `round3-replay.test.ts` (145 wpm in recorded model output and one test's own constant) | Left alone: recorded history |
| Sprint 4 docs: `sprint4/BUSINESS_LOGIC.md:98`, `sprint4/reports/task9.md:48`, `sprint4/tasks/task9.md:63,65` ("145 words a minute", "3-6 chapters") | Left alone: historical, not edited (the new `sprint5/BUSINESS_LOGIC.md` section is the current rule) |
| `sprint5/tasks/task7.md` A8 ("needs at least 3 chapters" only after Save) | **Needs the Task 7 agent**: the server message changed (below) |
| `docs/channel_bibles/COLD_OPEN_CHANNEL_CONFIG.md`, linked from the task doc | Not in the repo or the worktree; not checked |

**App (list for the Task 7 agent)**: no limit is hard-coded. `GateActionBar.tsx:36` has a comment about "fewer than 3 chapters"; the message shown is the server's. `app/(app)/run/[id].tsx:711` `chapters.length > 2` only decides when "Show full script" appears. New server wording for an invalid Gate 1 edit: "The edited script has 21 chapters, but this video needs 3 to 20 chapters." and a chapter under 26 words is refused; the too-few message is unchanged. `runs.get` returns `run.creationOptions.intakeWarnings` (optional list of sentences) for the soft warning.

## What changed

- `long-form/chapter-bounds.ts`: the one owner. Floor 3; ceiling `min(20, floor(seconds / 10))`; minimum 10 s per chapter = 26 words at 155 wpm (25 words is 9.7 s); soft average 40 s; default count `round(seconds / 150)` clamped (2 min 3, 5 min 3, 10 min 4, 15 min 6). A brief with titles makes the range exactly their count.
- `long-form/brief-chapter-plan.ts`: reads titles (`... titles exactly: "A", "B"`, curly quotes, or `Chapter N: "Title"`), the announced count on that line, word budgets (`word budget(s)...: 60, 125` or `Chapter N: about 120 words`), fact allocations (`chapter allocation:` line, whatever verb each chapter uses, or `Chapter N uses ...`) and a stated word count; `checkBriefChapterPlan()` is the intake check.
- Intake (`runs.create`, `runs.rerun`, long only, before the cost estimate and any spend): "The brief has 8 titles but 7 word budgets. ..."; a count outside 3 to the ceiling; a word budget under 26. Average chapter under 40 s, or a stated word count more than 20% from minutes x pace: a warning in `creationOptions.intakeWarnings`, never a failure. The refusal is a `BAD_REQUEST` from `runs.create` (the run is never created); Task 8's settings preflight is a separate check that parks an existing run, and is untouched.
- Shorts are untouched.

## Schema impact

None: `intakeWarnings` is an optional field of the existing `creationOptions` JSON (zod schema only, no migration). Confirmed.

## R6: the flaky failure

One earlier full run had a single failed test that nobody named. **It did not reproduce, so I cannot name it.** On the merged head (`5d92fbc`) I ran the full suite three times with the default worker count: 161 files passed, 12 skipped; 1,397 passed, 65 skipped, every time, no failure. A fourth run with `--maxWorkers=24` on 14 cores (to try to starve the CPU-heavy tests) also passed. Task 8's report names two tests that time out when every worker is busy (the stock-footage stub test at 30 s and the "no output cap outside llm" tree scan at 5 s); the lone failure was in the first full run on a cold worktree, so that pair is the likely cause, but I did not observe it and do not claim it.

## R7: the intake check against every known brief

Fixtures in `studio/src/long-form/fixtures/briefs/`, one test each in `brief-chapter-plan.test.ts`: Mary Celeste (7 titles, 7 budgets, 7 allocations, 1,500 stated), NIYT L-1 Indus (7 titles, 7 allocations, 1,500 stated), NIYT S-1 (a Short, 110 stated), task6 Appendix A (no lists, 1,240 stated, 8 min), task6 Appendix B Lego (no lists, no stated count). All pass intake with no warning; the only stop is two present lists that disagree. Finding: the first Mary Celeste check stopped on "7 titles but 6 fact allocations" because chapter 7 "restates" its facts instead of "using" them; fixed and tested.

## R8: a stated word count wins

When a `Constraint:` line states "about N words", that N is the script target in the prompt, the repair message and the length check (accepted within 10%, flagged beyond 20%), expressed as the pace that makes minutes x pace equal N, so every length rule reads one number (`longPace` in `script-generation/index.ts`). Otherwise the voice's pace, else 155, applies. Mary Celeste test: 1,500 stated versus 1,550 derived; a 1,368-word script is accepted in one call with the stated count and needs two repairs without it; a 1,680-word script (inside the derived range) is sent back when 1,500 is stated. `sprint5/BUSINESS_LOGIC.md` has the new "Chapter bounds" section.

## Real check

First live call (before R8), Mary Celeste brief, 600 s: 7 chapters, all 7 titles exact, 3 calls, **$0.1826** (two were length repairs). 

**Overspend disclosure.** After R8 I re-ran the same live check to see the stated count at work. I had added a spend guard to the script that wraps `callLLM`; it did not take effect (a test with an invalid API key reached the provider and got a 401), and I piped that live run's output through a filter that dropped everything when the guard line was missing. So the second run very likely spent real money (one call is about $0.05, three about $0.18) and I have no output or cost for it. The task total is therefore somewhere between $0.18 and about $0.36 against the $0.30 ceiling, and I cannot say where; check the Anthropic usage page for the time of the run. I removed the guard code and made no further live calls. R8 is covered by the offline tests above; it was not seen live.

## Tests and checks

Typecheck, lint and build clean. Full suite with `--maxWorkers=4`: 161 files passed, 12 skipped; 1,408 tests passed, 65 skipped.

## Hard rules 5 to 9

- **5** Task doc copied in unchanged (commit `BUGS_CHAPTER_BOUNDS_DOC`), identical to the source; not first on the branch (see top).
- **6** Done below, in the final section.
- **7** I wrote only this report, `sprint5/BUSINESS_LOGIC.md` (named by R8), and the task doc copy. No `STATUS.md` or other doc was edited.
- **8** Not yet: only after the founder says the PR is merged.
- **9** Sweep table above.

## Pull `main`, docs scope, CI (Hard rule 6)

Merged `origin/main` (7f9655f, Task 8) into the branch before the work in R6 to R8. Conflicts: `studio/src/api/routers/runs.ts` (the `runs.rerun` strip list: kept my `intakeWarnings` plus Task 8's `preflightBlock`, `settingsChanges`, `estimateUsd`, `retryAllowanceUsd`) and `studio/src/types/pipeline.types.ts` (kept both sets of new `creationOptions` fields). To be filled in at the last step: second pull, docs-scope check, CI result.

## R9: `runs.get.chapterBounds` (second PR)

`runs.get` returns `chapterBounds: { min, max, minWordsPerChapter, exactCount }` for a long-form run and `null` for a Short. It is computed on every read from the run's resolved length and its `briefText`, by `chapterBoundsForBrief()` (the call Script Generation uses) turned into the view by `chapterBoundsView()`; both live in `long-form/chapter-bounds.ts` / `brief-chapter-plan.ts`, so there is still one owner. `exactCount` is true when the brief lists its titles (then `min` equals `max`). If the brief cannot be read the length-based default comes back, never an error (`deriveChapterBounds` in `runs.ts`). The field is part of the inferred `runs.get` output type. No stored data, no schema change, no model call, no spend; `runs.create`, intake and `app/` are untouched.

Tests (`runs.run-screen-data.test.ts`): a Short returns `null` and keeps its existing fields; 10 minutes with no titles returns 3, 20, 26, false; 7, 8 and 9 listed titles return exactly that count with `exactCount: true`; 2, 5 and 15 minutes give ceilings 12, 20 and 20; an old long run with no stored length and no brief returns the default without throwing; the read starts no run. Typecheck, lint and build clean; full suite with `--maxWorkers=4`: 161 files passed, 12 skipped; 1,418 tests passed, 65 skipped.

**One thing for the architect to decide (not changed).** The field says `min = max = 7, exactCount: true` for a brief that lists 7 titles, as the task asks. The server's Gate 1 edit check (`parseChapterSheet`) does not bind an edit to the brief's count: it accepts any count from 3 to the length's ceiling, with 26 words per chapter. If the app enforces `exactCount` it will be stricter than the server and refuse an 8-chapter edit the server would accept. Either the app treats `exactCount` as advice (show "the brief lists 7 chapters"), or the edit check should also bind to the brief's titles (a separate change to `parseChapterSheet`, which this task does not ask for).

### Values the app still mirrors (for the Task 7 follow-up agent), checked on `main` at e16cbde plus the Task 7 merge

| App file | Value | Server owner | Note |
|---|---|---|---|
| `lib/script-editor.ts:4` and its message at :36 (also the comments in `GateActionBar.tsx:37` and `ScriptEditorModal.tsx:12`) | `MIN_CHAPTERS = 3`, "Needs at least 3 chapters" | `chapter-bounds.ts` `min`/`max` | replace with `chapterBounds` (R3 of the follow-up) |
| `lib/script-editor.ts` (no check) | no maximum, no per-chapter word minimum | max 20 (or the length's ceiling), 26 words | the server refuses these only after Save; use `max` and `minWordsPerChapter` |
| `lib/script-editor.ts:5` `WORDS_PER_MINUTE = 155` (used by `script-versions.ts:9,33` for the length shown) | 155 | `LONG_WORDS_PER_MINUTE`; the server plans from the voice's measured pace (Task 8) and, since R8, from a stated word count | not sent by the server yet; a displayed length can differ from the planner's. `runs.get.expectedLength` (Task 8) is the server's own estimate; prefer it |
| `lib/long-brief.ts:16-17` `MIN_MINUTES = 2`, `MAX_MINUTES = 15` | 2 and 15 | `formats/video-kind.ts` `LONG_MIN_SEC`/`LONG_MAX_SEC` (120 to 900) | video length, not chapters; not sent by the server |
| `lib/brief-extras.ts:4,27` `MAX_SOURCE_LENGTH = 500`, `MAX_SOURCES` | 500 characters, source count | `runs.create` `sources` schema | commented as matching; not sent by the server |
| `app/(app)/run/[id].tsx:711` `chapters.length > 2` | 2 | none | only decides when "Show full script" shows; not a rule |
| (new, no app copy yet) `intakeWarnings` | sentences | `creationOptions.intakeWarnings` | read-only list; show with the run |

Intake refusals (the brief's lists disagree, a count outside the range) arrive as `runs.create` `BAD_REQUEST` messages; the app shows the server's sentence and must not rephrase or re-derive them.

### Hard rules 5 to 9 for R9

- **5** Task doc r2 copied in unchanged as the first commit; identical to the source (checked again after the `main` merge).
- **6** `main` pulled into the branch (one clean merge; it brought Task 7 FE #106, the publishing-citation retry and the template change). Docs scope is checked before `gh pr ready`, below.
- **7** I wrote only this report; `STATUS.md` and every other doc untouched.
- **8** Not run: the closing waits until the founder says the R9 PR is merged.
- **9** The sweep section above stands; the app list above is the extra mirror check R9 asked for.
