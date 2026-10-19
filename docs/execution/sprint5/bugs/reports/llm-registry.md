# Sprint 5 Bug Task: LLM Registry (Part A report; Parts B and C extend this file)

**Date**: 2026-10-19
**Status**: Part A complete, ready for review. Parts B and C not started.
**Branch / worktree / PR (for the architect to record)**: `BUGS_LLM_REGISTRY_A` / `D:\Study Material\7AI-BUGS_LLM_REGISTRY_A` / [PR #108](https://github.com/Neeraj1002/7AI/pull/108). Parts B and C will use `BUGS_LLM_REGISTRY_B` and `BUGS_LLM_REGISTRY_C`.
**Task doc**: `docs/execution/sprint5/bugs/tasks/llm-registry.md`, r2; already on `main` (2c2e19c) and identical to the architect's source (only line endings differ), so no doc commit was needed. Revisions picked up: none after r2.
**Docs scope**: this report is the only doc this branch adds or changes. `STATUS.md` untouched.
**Real hours**: not clocked; about 4 hours of agent time for Part A (estimate was 4).

## One line for the founder

Part A ready: PR #108, branch `BUGS_LLM_REGISTRY_A`. The cause is confirmed and reproduced: the old request with the old cap gave `replyLength=0` with 4,095 of 4,096 tokens spent on reasoning.

## R0 - What the code really does (docs lines confirmed or corrected)

| # | Docs said | Code / real result |
|---|---|---|
| 1 | each agent sets its own cap; a cut-off fails the stage | **Confirmed.** 7 `callLLM` sites, all through `llm/client.ts` (the only file importing the AI SDK; no model call exists outside it). Caps were: intake 512, script gen 4096 (Short) / 12000 (Long), script review 1024 / 2048, VI own-draft 512, metadata 512, Short planner 2048, long planner 8192. Only script gen and the long planner handled a cut-off; the other four turned one into "did not return valid JSON". Refusal (`content-filter`) was handled nowhere. Overload, 429 and timeout: client maps `APICallError.isRetryable` to `TransientStageError`; the stage wrapper retries with backoff. |
| 2 | the failed run's debug bundle | **Not available to me.** Instead I reproduced the request (S-1 brief, same prompts, old cap 4,096, no thinking setting, `claude-sonnet-5`): `finishReason=length`, `replyLength=0`, `outputTokens=4096` of which `reasoningTokens=4095`, reply parts `["reasoning"]`. Same numbers as the 19 Oct failure. |
| 3 | purposes run on haiku-4-5 or sonnet-5; Sonnet 5.5 moves are pending | **Confirmed on `main`**: script-generation and video-production-planning on `claude-sonnet-5`; intake, review, VI, metadata on `claude-haiku-4-5`. No purpose is on 5.5 yet (PR #105 and #107 are still draft). Provider docs (read 2026-10-19): **Sonnet 5 reasons by default (adaptive thinking), reasoning tokens count against `max_tokens`**, max output 128K, `thinking: disabled` accepted. **Sonnet 5.5** also reasons by default, **rejects `disabled` (400)**, lowest setting is `between_tools`; a manual `budget_tokens` is a 400 on Sonnet 5, 5.5 and Haiku 5.5. **Haiku 4.5**: thinking off by default, manual budget only, max output 64K. Streaming: the provider says to stream above 21,333 output tokens (a client-side rule of its SDK, to avoid HTTP timeouts). |
| 4 | planner fix is in #87-#90, maybe one of #91-#97 | **#87** (merged 14 Oct, refined by #89): batches of at most 12 scenes, an exhausted batch is split, completed scenes are checkpointed. It kept the 8,192 limit, changed no reasoning setting, added no retry of the same request, and covers the **long planner only**. #91-#97 hold no cut-off fix (#91 adds diagnostics; the rest are unrelated). The Short planner (`plan.ts`, 2,048, no handling) was never covered. The split stays as the fallback after the client's retry; no second mechanism was built. |
| 5 | SDK retries | `maxRetries: 0` is set in `client.ts`; the stage wrapper owns retries. Nothing stacks today. |
| 6 | usage events carry the new numbers? | `usage_events` has a `metadata Json?` column (the long planner already writes call metadata into it), so Part B R6 needs no schema change. Part A used no new column. |
| 7 | was the reviewer's malformed JSON (PR #105) a cut-off? | **Not shown.** Task 6's report says the original wire text and stop reasons are unavailable and all 53 retained replies ended `end_turn`, none at the cap; the old errors cannot be attributed to hidden reasoning. Haiku 4.5 does not reason by default, so reasoning is unlikely there. |

Wrong in the docs: nothing material. Two things worth knowing: the registry still says Sonnet 5 / Haiku 4.5 (the Sonnet 5.5 moves are not on `main`), and the model facts above differ by model, so one reasoning rule does not fit all three.

## Part A results

### R1 - Registry owns the limit and the reasoning setting

Every purpose now declares `maxOutputTokens` and `reasoning` (`'off'` or `{ budgetTokens }`), both required by the type, plus a `label` (the stage name used in messages). Agents no longer define `*_MAX_TOKENS` or pass `maxTokens`; `callLLM` has no `maxTokens` parameter.

| Purpose | Model | Limit | Reasoning | Was |
|---|---|---|---|---|
| script-generation | claude-sonnet-5 | 16,000 | off | 4,096 Short / 12,000 Long |
| video-production-planning | claude-sonnet-5 | 16,000 | off | 2,048 Short / 8,192 Long |
| script-review | claude-haiku-4-5 | 16,000 | off | 1,024 / 2,048 |
| intake-parsing | claude-haiku-4-5 | 4,000 | off | 512 |
| metadata-generation | claude-haiku-4-5 | 4,000 | off | 512 |
| video-intelligence-own-draft | claude-haiku-4-5 | 4,000 | off | 512 |

- `'off'` is always sent explicitly (`thinking: { type: "disabled" }`). For Sonnet 5.5 the installed `@ai-sdk/anthropic` 4.0.49 cannot express `between_tools`, so `client.ts` rewrites the request body on the wire for models whose facts say so (`rewriteThinkingBody`). A real call with `claude-sonnet-5-5` and reasoning off returned `reasoningTokens=0` with no 400. This was added now because PR #105 and Task 8 R9 both move purposes to 5.5; without it every one of their calls would have reasoned.
- New `llm/models.ts`: per-model maximum, how thinking is switched off, streaming threshold (Part B R7 extends it with pinned ids and structured-output support). `assertPurposeConfig` refuses, at call time and in a test, a limit above the model maximum, a manual budget on a model that rejects one, a budget under 1,024, and a budget plus 2,000 above the limit.
- No size classes were needed: one limit per purpose covers a Short and a Long.
- A pricing row for `claude-sonnet-5-5` ($2 / $10, from the docs) was added so that model can be called without a pricing error. Task 8 R8.6 may add the same row; the merge conflict is one line.

### R2 - One automatic retry on a cut-off

`callLLM` retries once when the reply ends at the limit (`stopReason: length`, or `unknown` with the whole limit spent): limit doubled (at most 32,000 and never above the model maximum), reasoning off, streaming above 21,333 tokens. The first call is carried on the reply (`priorAttempts`), and every stage's usage booking writes one usage event per call (success and failure paths; the long planner's cut-off calls carry `finishReason: length` and `output_token_exhaustion` metadata). A provider error on the retry keeps the first call booked. The retry is at most one extra call; if the retried reply is bad JSON the existing repair still runs and makes no further call. The long planner catches the new `LLMCutOffError` and splits the batch as before.

### R3 - Honest messages

Both texts are exactly as specified, start with the stage name from the registry, and carry the technical line (`stopReason`, `maxTokens`, `outputTokens`, `replyLength`, `attempts`, `firstMaxTokens`). "Shorten the brief or lower the target length" is gone everywhere. I did not touch app files; if the app's failure card rewrites this error (Task 7 R5), the architect should add this known case: text beginning `<Stage>: the model used its whole output budget without writing an answer, twice.` or `<Stage>: the reply was cut off even after one automatic retry`.

### R4 - Tests and the real check

- New: `llm/index.test.ts` (callLLM paths: normal, cut-off then success with limit doubled, reasoning off and two usage rows, empty reply with reasoning tokens, unknown stop reason at the limit, cut off twice with text, cut off twice empty, stage name from the registry, provider error on the retry keeps the first call booked, no retry on a first-call error), `llm/registry.config.test.ts`, `llm/no-output-cap-outside-llm.test.ts` (scans `studio/src`; no exceptions list; it caught my own stub in `parse-brief.ts` while I was writing it), extra cases in `client.test.ts` (thinking settings, reasoning tokens, streaming, stream errors surface the provider error) and a pipeline test that books both calls for a cut-off-then-complete and a cut-off-twice script generation.
- Existing tests changed because the contract changed: script-generation index/no-reply-text/long-form tests, plan-long tests (the "unknown stop reason" case moved into the client tests), `state-machine.structured-usage`.
- Gates: `tsc --noEmit` clean, `npm run lint` clean, `npm run build` clean, `npx vitest run` 953 passed, 65 skipped (the DB-backed files), 0 failed.

**Real check** (`studio/scripts/llm-registry-real-check.ts`; S-1 from `NIYT_CHANNEL_CONFIG.md` Appendix A with the section 7 style guide and banned openers/endings read from that file; dev environment, a throwaway database `sevenai_llm_registry_check` on the local server created for this check because `sevenai_dev` lacks the Sprint 5 migrations; nothing near `sevenai_preview`; total spend about $0.15 against the $1 ceiling):

| Call | Model | Output tokens / limit | Reasoning tokens | Stop |
|---|---|---|---|---|
| **Old request, for the cause** (cap 4,096, no thinking setting) | claude-sonnet-5 | 4,096 / 4,096 (100%) | 4,095 | length, reply empty |
| Script Generation, S-1 (two runs) | claude-sonnet-5 | 556 / 16,000 (3.5%), 533 / 16,000 (3.3%) | 0 | stop |
| Video Planning, S-1 (9 stills; two runs) | claude-sonnet-5 | 706 / 16,000 (4.4%), 791 / 16,000 (4.9%) | 0 | stop |
| Streamed 32,000-token requests, structured and plain | sonnet-5, haiku-4-5, sonnet-5-5 | 8 to 13 | 0 / n/a | stop (six real calls, all fine) |

Forced low limit (test-only: the script mutates the in-process registry object, nothing reachable from the API or config), real Script Generation stage on a dev run:

- **Recovers**: limit forced to 330. Usage events: intake, then `script-generation out=330`, then `script-generation out=533` (the retry at 660, reasoning off). The stage completed and the run moved on to `script_review`.
- **Cut off twice**: limit forced to 120, retry at 240. Usage events: `out=120`, `out=240`. `runs.get` returned `run.status=needs_attention`, `run.currentStage=script_generation` and `run.lastError` (also the stage `error`): "Script Generation: the reply was cut off even after one automatic retry with a larger limit. Press Retry this step; if it repeats, send the debug bundle. (stopReason=length, maxTokens=240, outputTokens=240, replyLength=719, attempts=2, firstMaxTokens=120)".

Scale: S-1 uses about 3 to 5% of the new limits. The long form (L-1, T18) is not run here; Part B's canary covers it.

## Behaviour changes (each place)

1. A cut-off reply no longer fails at once; it retries once (reverses Bugs Task 11 R4's "fail at once").
2. Short planner, script review, intake, VI and metadata now report a cut-off as a cut-off instead of "did not return valid JSON".
3. Every LLM call now sends an explicit thinking setting; limits are 2 to 8 times higher (16,000 / 4,000). Cost: nothing extra for unused headroom; a runaway reply now costs more before it stops.
4. Failure paths book one usage event per call, not one per stage.
5. `callLLM`'s `maxTokens` parameter is gone; `LLMResponse` gains `maxOutputTokens` and `priorAttempts`.

## Deviations

- R1 to R3 landed in one commit (`BUGS_LLM_REGISTRY_A_R1`) because they share the same files and the tree had to compile; R4's script and the 5.5 support are the second code commit.
- Added Sonnet 5.5 thinking support and its pricing row (not asked for; reason above).
- `scripts/llm-registry-real-check.ts` is committed as the evidence for R4 step 3; Part B's `llm:canary` supersedes it.
- The throwaway database `sevenai_llm_registry_check` stays until Part B finishes, then is dropped.

## Part C - Thumbnail 403 re-test: stopped at R9.0, nothing built

R9.0 says to stop if Sprint 5 Task 8 R11.5 is already done or in progress. It is: [PR #107](https://github.com/Neeraj1002/7AI/pull/107) (draft, `SPRINT5_TASK8_BE`) lists "thumbnail 403 cannot be reproduced here, cause written down, plain message added". Its R11.5 entry says it had no YouTube access, so it did not re-test; it names phone verification as the usual cause (which you have since completed), requests the scopes `youtube.upload` and `youtube.force-ssl` as enough for `thumbnails.set`, and adds `coverFrameMessage` to the publishing output (403: verify the channel; 401: reconnect; other: set it by hand). So the 403 status is: **unknown since your phone verification; the last real result is still the Sprint 2 403** (`youtube.thumbnail / forbidden`, while `longUploadsStatus` read `eligible`).

Why I did not run the attempt myself: the NIYT channel's token is stored encrypted in the preview database, which this track must not reach. The only YouTube credentials on this machine are the old local dev ones from Sprint 2, which belong to whichever channel that test used, not NIYT, and a real upload to a channel you did not name for this test is not mine to make. The re-test is therefore a founder-side step once PR #107 is deployed: publish one Private video from NIYT and read `coverFrameSet` and `coverFrameMessage` on the publishing output. Proposed wording for the test sequence (T25, not edited here): "Publish a Private test video; open the run's publishing output; `coverFrameSet` is true and the thumbnail shows on the video in Studio, or `coverFrameMessage` says why not." If it still fails with 403 on a verified channel, then R9.3's order applies (stored token scopes and grant date, request shape and image, raw error body, then a by-hand `thumbnails.set` with the same token); that is a new, small task and I can take it.

## Before marking ready (template Hard rule 6)

`git fetch` then merge of `origin/main` into this branch: already up to date, no conflicts. Build, lint, type-check and the full test run repeated after that (953 passed, 65 skipped, 0 failed). `git diff --name-only origin/main...HEAD -- docs/` lists only this report. The task doc was not touched.

## Sign-off (Part A)

- Task objective: met (criteria 1 and 2 verified; criterion 3 is the founder's T09 after merge and deploy)
- Schema impact: none. Business logic: no new states.
- Tests: passing. Ready for review: yes.
