# Sprint 5 Bug Task: LLM Registry (Parts A and B reported here; Part C stopped at R9.0)

**Date**: 2026-10-19
**Status**: Part A merged ([PR #108](https://github.com/Neeraj1002/7AI/pull/108)). Part B complete, ready for review. Part C stopped at R9.0 (see its section).
**Branch / worktree / PR (for the architect to record)**: `BUGS_LLM_REGISTRY_A` / `D:\Study Material\7AI-BUGS_LLM_REGISTRY_A` / [PR #108](https://github.com/Neeraj1002/7AI/pull/108). **Part B**: `BUGS_LLM_REGISTRY_B` / `D:\Study Material\7AI-BUGS_LLM_REGISTRY_B` / [PR #109](https://github.com/Neeraj1002/7AI/pull/109). Part C would use `BUGS_LLM_REGISTRY_C`.
**Task doc**: `docs/execution/sprint5/bugs/tasks/llm-registry.md`, r2; already on `main` (2c2e19c) and identical to the architect's source (only line endings differ), so no doc commit was needed. Revisions picked up: none after r2.
**Docs scope**: this report is the only doc this branch adds or changes. `STATUS.md` untouched.
**Real hours**: not clocked; about 4 hours of agent time for Part A (estimate was 4); Part B about a working day (estimate was 1 day).

## One line for the founder

**Part B ready: PR #109, branch `BUGS_LLM_REGISTRY_B`. One finding first: the L-1 brief asks for seven chapters and Script Generation accepts three to six, so T18 will fail there (section "Finding for the founder and architect" under Part B).**

Part A:

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

## Part B - make it hard to break again

### Finding for the founder and architect (not an LLM Registry bug)

The L-1 brief in `NIYT_CHANNEL_CONFIG.md` Appendix A says "seven chapters, titles exactly: ...". The long-form rule in `studio/src/agents/script-generation/long-form.ts` is `LONG_MIN_CHAPTERS = 3`, `LONG_MAX_CHAPTERS = 6` (Sprint 4 Task 9 R2). In the canary's real calls (`claude-sonnet-5`, reasoning off, about 3.3k of 16,000 tokens, `stopReason=stop`) the model followed the brief and wrote seven chapters both times; the stage rejected the reply and its one repair with "expected 3 to 6 chapters, got 7". So the founder's T18 will fail at Script Generation until either the brief is cut to six chapters or the maximum is raised to 7. I changed neither. The canary keeps going by reading that rejected reply as the model wrote it, and labels the rows.

### What the code does now (R0 items that Part B changed)

| # | Before Part B | After |
|---|---|---|
| 5 | `maxRetries: 0` in the client; the stage wrapper (`withRetryAndCircuitBreaker`, 3 attempts, 0.5 s then 1 s) re-ran the whole stage on any transient error | `callLLM` retries a transient error itself (below); a transient error that `callLLM` already retried carries `llmRetriesSpent` and the wrapper trips its breaker at once instead of running the stage again. Nothing stacks. The SDK still retries nothing. |
| 6 | `usage_events.metadata Json?` exists | Used, no schema change: `metadata.llm` holds the evidence for each call. |

### R5 - One failure table (`llm/failure-policy.ts`, applied by `llm/index.ts`)

| Failure | Action in the table | Extra calls | Message / note |
|---|---|---|---|
| Cut-off (`stopReason: length`) | retry once: limit doubled (at most 32,000, never above the model maximum), reasoning off | 1 | the two Part A texts; the technical line is now longer (R6) |
| Bad JSON or schema failure, not a cut-off | mechanical repair, then one more call that says what was wrong (`buildJsonRepairMessages`, moved from Script Generation, text unchanged; the long planner's correction attempt takes its place in the same ceiling) | 1 | existing errors |
| Provider refusal (`content-filter`) | no retry | 0 | "<Stage>: the model declined to answer this request (stop reason: content-filter, the provider's own reason: ...). It was not retried. ..." |
| 429, 5xx, 529, timeout, network error | wait 1 s, 2 s (exponential, 30 s cap), never less than `retry-after` or `retry-after-ms`; a `retry-after` over 60 s is not waited out | up to 2 | the original error, flagged so the wrapper does not run the stage again |
| 400, 401, 403, 422 and other non-transient errors | no retry | 0 | the original error |
| 400 or 422 on a request that sent a schema | one fallback to plain text (moved from Script Generation, unchanged: same statuses, only on the first call, later calls send no schema) | 1 | logged as before |

- **Ceiling**: two extra provider calls per stage call, across all causes (`CallLedger`, `MAX_EXTRA_PROVIDER_CALLS = 2`, not configurable above 2). A stage call is one `callLLM` plus, for Script Generation, its repair call (one ledger for the generation); the long planner shares one ledger per batch call. Script Generation's long-form *length* repairs are a quality loop, not failure handling, and get their own ledger each.
- **Budget**: every extra call asks the stage's guard first (`run-pipeline/llm-retry-guard.ts`): the weekly account and channel budget through `checkBudget` (Sprint 5 Task 8 R8.2's rule), and the per-video limit the user set. Both count what the stage call has spent but not yet booked (`checkBudget` gained an optional `pendingSpendUsd`). A refusal fails with "Spend limit reached before the retry: <Stage> was not tried again. <the budget gate's own words> ...", keeps the calls already paid for booked, and carries `recoveryKind: spend_limit` so Retry works after the limit is raised. The plumbing is an optional `retryGuard` parameter on `callLLM` and on each of the seven agent entry points; the state machine passes `makeLlmRetryGuard(run)` at each. No schema, no new required parameter.
- **Tests** (`llm/failure-policy.test.ts`, `llm/index.failure-table.test.ts`, `run-pipeline/llm-retry-guard.test.ts`, plus the Script Generation regression file): every row, including a retry refused by the budget (cut-off, transient, fallback and repair), a second failure of a different kind (cut off, then a 401: the first call is still booked), the ceiling across causes, `retry-after` handling, the wrapper not stacking, and the structured-output status table (400 and 422 fall back; 401, 403, 429, 500, 529 and a status-less error do not).

### R6 - Evidence on every call

- Each reply carries `evidence`: purpose, model, attempt (1-based provider call inside the `callLLM`), kind (`first`, `cut-off-retry`, `transient-retry`, `structured-fallback`), limit, outputTokens, reasoningTokens, percentUsed, nearMiss (60% or more), normalized stopReason, the provider's raw finish reason, blocks (reply part kinds, for example `thinking:1,text:0`), the reasoning setting sent, and durationMs.
- It is stored on **every usage event** as `metadata.llm` (success and failure paths, one event per billed call; the long planner merges it with its own call metadata). Real example from the stage check below, a forced cut-off then retry: `{"kind":"cut-off-retry","limit":660,"attempt":2,"outputTokens":524,"percentUsed":79.4,"blocks":"thinking:0,text:1","finishReason":"end_turn","reasoningTokens":0,...}`.
- The technical line of the cut-off and refusal messages gains `reasoningTokens`, `blocks`, `finishReason` and `limit`. Real: `(stopReason=length, maxTokens=240, outputTokens=240, replyLength=690, attempts=2, firstMaxTokens=120, reasoningTokens=0, blocks=thinking:0,text:1, finishReason=n/a, limit=240)`.
- A call at 60% of its limit or more logs `llm.near-miss purpose=... used=.../...`.
- A failed stage's output gains `llm`: the per-call evidence, the provider call count and the provider's response metadata for the failed call (response id, model, timestamp, request id and retry-after style headers, provider metadata; never the prompt, never the reply body, which stays in `rawReply` as before).
- **Two honest limits.** (1) The raw provider finish reason is `n/a` for a *structured-output* call that was cut off: the AI SDK's `NoObjectGeneratedError` carries only the unified reason (`length`) and no response body (checked with a real call); plain and streamed calls carry it (`max_tokens`, `end_turn`). (2) The near-miss *flag* lives on the usage event (`metadata.llm.nearMiss`) and in the log; a *successful* stage's own output is not changed, because each of the seven stages builds its output differently and the task allowed the usage event to carry the numbers. A failed stage's output carries the full evidence.
- **Verified with real calls** on the throwaway database (`scripts/llm-registry-real-check.ts --skip-part1`, cost $0.04, limit forced to 330 and to 120 in this process only): Demo A (recovers) wrote usage events with `metadata.llm` attempt 1 (limit 330, 100%, `stopReason: length`) and attempt 2 (`cut-off-retry`, limit 660, 524 tokens, 79.4%); the stage completed. Demo B (cut off twice) failed with the message above in `runs.get` (`run.lastError`), and the failed stage's `output.llm` held both calls and the response metadata (request ids).

### R7 - Model facts table (`llm/models.ts`)

One row per model in use, with columns `pinnedId`, `maxOutputTokens`, `supportsReasoning`, `supportsStructuredOutput`, `streamingAboveTokens`, and the Part A `thinking` control. The URLs and the date (2026-10-19) are in the comment above the table. Read from the provider's pages that day: Models overview (every Claude id is a pinned snapshot, dateless ids included; Haiku 4.5 is an alias of `claude-haiku-4-5-20251001`) and the Structured outputs page (its supported-models list names `claude-sonnet-5-5`, `claude-sonnet-5` and `claude-haiku-4-5-20251001`).

| Model | Pinned id | Max output | Reasoning | Structured output | Streaming above |
|---|---|---|---|---|---|
| claude-sonnet-5 | `claude-sonnet-5` (its own snapshot) | 128,000 | yes (adaptive, `disabled` accepted) | yes | 21,333 |
| claude-sonnet-5-5 | `claude-sonnet-5-5` | 128,000 | yes (adaptive, lowest is `between_tools`) | yes | 21,333 |
| claude-haiku-4-5 | `claude-haiku-4-5-20251001` | 64,000 | yes (manual budget only) | yes | 21,333 |

Two things to know: the registry still calls Haiku by its alias `claude-haiku-4-5` (the task says do not switch models; moving it to the dated id is one registry line plus one pricing row, your call), and `callLLM` now refuses a schema request on a model whose row says `supportsStructuredOutput: false`. Tests (`llm/models.test.ts`): a purpose's limit and its retry limit are at most its model's maximum (and the retry at most 32,000), reasoning is requested only where supported, every model in use has a facts row and a pricing row, and the facts and pricing tables list the same models (this extends the R8.6 rule; no second list).

### R8 - `npm run llm:canary`

`npm run llm:canary -- --yes [--ceiling 1] [--out table.md]` (`llm/canary.ts`; helpers and their tests in `llm/canary-support.ts`). It refuses without `--yes`, stops before a call once the running total reaches the ceiling ($1 default), and refuses to run with `NODE_ENV=production`, a database URL naming `sevenai_preview`, or a database host that is not this machine. It uses no database. One real call per purpose, fed the way a run feeds it: the S-1 and L-1 briefs from the NIYT spec through intake, the script through review, the script through planning, the S-1 script through metadata and the Video Intelligence prompt (one generated plain frame as the attachment, because that purpose needs a frame, not a video).

The table below is the command's own output (run 2026-10-19 14:50 UTC on this branch, total $0.19 against the $1 ceiling, written with `--out` and pasted unedited):

| purpose | fixture | model | limit | outputTokens | reasoningTokens | % used | stopReason | cost | ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| intake-parsing | S-1 | claude-haiku-4-5 | 4000 | 441 | n/a | 11.0% | stop | $0.0030 | 4881 |
| intake-parsing | L-1 | claude-haiku-4-5 | 4000 | 917 | n/a | 22.9% | stop | $0.0068 | 12260 |
| script-generation | S-1 | claude-sonnet-5 | 16000 | 453 | 0 | 2.8% | stop | $0.0112 | 5962 |
| script-generation | L-1 (failed step) | claude-sonnet-5 | 16000 | 3281 | 0 | 20.5% | stop | $0.0460 | 49336 |
| script-generation | L-1 (failed step) | claude-sonnet-5 | 16000 | 3436 | 0 | 21.5% | stop | $0.0529 | 29861 |
| script-review | S-1 | claude-haiku-4-5 | 16000 | 407 | n/a | 2.5% | stop | $0.0047 | 6182 |
| script-review | L-1 (rejected 7-chapter script) | claude-haiku-4-5 | 16000 | 1375 | n/a | 8.6% | stop | $0.0130 | 19394 |
| video-production-planning | S-1 | claude-sonnet-5 | 16000 | 901 | 0 | 5.6% | stop | $0.0131 | 12325 |
| video-production-planning | L-1 batch 1 (12 scenes), rejected 7-chapter script | claude-sonnet-5 | 16000 | 2288 | 0 | 14.3% | stop | $0.0353 | 33539 |
| metadata-generation | S-1 | claude-haiku-4-5 | 4000 | 135 | n/a | 3.4% | stop | $0.0016 | 2102 |
| video-intelligence-own-draft | S-1 (one plain frame) | claude-haiku-4-5 | 4000 | 139 | n/a | 3.5% | stop | $0.0021 | 2740 |
| **total** | 11 calls |  |  |  |  |  |  | **$0.1896** |  |

near-miss (60% of the limit or more): none.

Reading it: the largest reply is the L-1 script at 3,436 of 16,000 tokens (21.5%), and the highest share of any limit is intake on L-1 at 22.9% of 4,000. Nothing is near its limit, reasoning tokens are 0 wherever the model reports them (Haiku 4.5 reports none), and every stop is `stop`. An earlier run the same hour gave the same shape (largest 3,110 of 16,000). Per the "After merge" plan the architect tightens limits after a week of real near-miss data; no limit was changed here. The "L-1 batch 1" row is one planner call of 12 scenes, the largest request the long planner makes, not the whole plan. The two "failed step" rows are the two Script Generation calls whose seven-chapter replies were rejected (finding above); the L-1 review and planning rows use that rejected reply, as labelled.

## Behaviour changes in Part B (each place)

1. **Transient provider errors** are retried inside `callLLM` (up to two extra calls, 1 s then 2 s, `retry-after` honoured) and the stage wrapper no longer re-runs the stage on top. Before: the wrapper re-ran the whole stage up to three times with 0.5 s and 1 s waits. A transient error from a non-LLM step still goes through the wrapper unchanged. A timeout or dropped connection that the SDK did not wrap as an API error is now transient (before: "unrecognized error", never retried).
2. **The structured-output fallback (400 or 422) now applies to every call that sends a schema** (Script Generation, the long planner), not only Script Generation. The rule itself is unchanged.
3. **Provider refusal** (`content-filter`) now fails at once with its own message (before: "did not return valid JSON" or a schema error from an empty reply).
4. **Every extra call is checked against the budget**, including Part A's cut-off retry, which was not. `checkBudget` gained an optional last parameter (`pendingSpendUsd`, default 0).
5. **The Script Generation repair call and the long planner's correction attempt** now take a place in the two-extra-calls ceiling (before: each was one call by its own code, with no shared rule).
6. The cut-off message's technical line is longer; usage events of LLM calls have `metadata.llm`; a failed stage's output may have an `llm` key; the long planner's usage metadata is the merge of its own and `llm`.

## Deviations (Part B)

- R5 and R6 share `llm/index.ts`, `client.ts` and `types.ts` and are one commit (`BUGS_LLM_REGISTRY_B_R5_R6`); R7's columns landed in that commit because `callLLM` reads them, and the R7 commit holds its tests.
- The near-miss flag is on the usage event and in the log, not in a successful stage's own output (see R6, two honest limits). The raw finish reason is `n/a` for a structured-output cut-off (SDK limitation).
- The canary's long-planning row is the first batch only, its Video Intelligence row uses one generated plain frame, and its L-1 downstream rows use the rejected seven-chapter reply (all labelled in the table).
- The registry keeps the Haiku alias rather than the dated pinned id (R7 says not to switch models).
- `scripts/llm-registry-real-check.ts` stays as Part A's evidence; the canary supersedes its table, and the script now also prints the usage-event evidence. The throwaway database `sevenai_llm_registry_check` was used for the stage-level evidence and is dropped at the end of Part B.

## Part B results

- Gates on this branch at the final code commit: `npm run build`, `npm run lint` and `npx tsc --noEmit` clean; `npx vitest run` 1,033 passed, 65 skipped (the DB-backed files), 0 failed (Part A: 953 passed).
- Real spend for Part B: three canary runs ($0.04, $0.18, $0.19, the first without the L-1 downstream rows), the stage-level check ($0.04) and one tiny structured cut-off probe (about $0.001); each check stayed far under the $1 ceiling.

## Before marking ready (template Hard rules 5 to 7, Part B)

- **Task doc**: `docs/execution/sprint5/bugs/tasks/llm-registry.md` is on `main`, r2, identical in content to the architect's source (only line endings differ), so no doc commit.
- **Pulled `main`**: `git fetch origin` shows nothing new since the branch was cut (`0f01ba9`), so the merge was a no-op and there were no conflicts to resolve. Build, lint, type-check and the full test run are the results above.
- **Docs scope**: `git diff --name-only origin/main...HEAD -- docs/` lists only this report. `STATUS.md` and every other doc untouched.

## Sign-off (Part B)

- Task objective: met for R5 to R8; success criterion 3 (T09 and T18) is the founder's test after deploy, with the T18 finding above.
- Schema impact: none (`usage_events.metadata` already existed). Business logic: no new states; a retry is two usage events inside one stage attempt, as before.
- Tests: passing. Ready for review: yes.

## Part C - Thumbnail 403 re-test: stopped at R9.0, nothing built

R9.0 says to stop if Sprint 5 Task 8 R11.5 is already done or in progress. It is: [PR #107](https://github.com/Neeraj1002/7AI/pull/107) (draft, `SPRINT5_TASK8_BE`) lists "thumbnail 403 cannot be reproduced here, cause written down, plain message added". Its R11.5 entry says it had no YouTube access, so it did not re-test; it names phone verification as the usual cause (which you have since completed), requests the scopes `youtube.upload` and `youtube.force-ssl` as enough for `thumbnails.set`, and adds `coverFrameMessage` to the publishing output (403: verify the channel; 401: reconnect; other: set it by hand). So the 403 status is: **unknown since your phone verification; the last real result is still the Sprint 2 403** (`youtube.thumbnail / forbidden`, while `longUploadsStatus` read `eligible`).

Why I did not run the attempt myself: the NIYT channel's token is stored encrypted in the preview database, which this track must not reach. The only YouTube credentials on this machine are the old local dev ones from Sprint 2, which belong to whichever channel that test used, not NIYT, and a real upload to a channel you did not name for this test is not mine to make. The re-test is therefore a founder-side step once PR #107 is deployed: publish one Private video from NIYT and read `coverFrameSet` and `coverFrameMessage` on the publishing output. Proposed wording for the test sequence (T25, not edited here): "Publish a Private test video; open the run's publishing output; `coverFrameSet` is true and the thumbnail shows on the video in Studio, or `coverFrameMessage` says why not." If it still fails with 403 on a verified channel, then R9.3's order applies (stored token scopes and grant date, request shape and image, raw error body, then a by-hand `thumbnails.set` with the same token); that is a new, small task and I can take it.

## Before marking ready (template Hard rule 6)

`git fetch` then merge of `origin/main` into this branch: already up to date, no conflicts. Build, lint, type-check and the full test run repeated after that (953 passed, 65 skipped, 0 failed). `git diff --name-only origin/main...HEAD -- docs/` lists only this report. The task doc was not touched.

## Sign-off (Part A)

- Task objective: met (criteria 1 and 2 verified; criterion 3 is the founder's T09 after merge and deploy)
- Schema impact: none. Business logic: no new states.
- Tests: passing. Ready for review: yes.
