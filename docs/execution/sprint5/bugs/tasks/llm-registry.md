# Sprint 5 Bug Task (named): LLM Registry - one output-limit and failure policy for every LLM stage, plus the thumbnail 403 re-test

**Read `docs/execution/bugs/HOTFIXER_AGENT_PROTOCOL.md` and `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** They define the branch, worktree, commit, report and review rules. This file states only what is specific to this task. Keep every reply to the founder to 3 lines; only the report is long. Do not edit `STATUS.md` (either one) or any doc except your own report; the architect records the branch and the status (founder rule, it overrides the protocol's claim and closure steps for `STATUS.md`).

**Revision**: r2, 2026-10-19, R9.1 closed (all three tiers enabled), R9.3 suspects ordered, git rules.

**Written**: 2026-10-19 by the architect chat, at the founder's request. **Status**: not started. **Task doc**: `docs/execution/sprint5/bugs/tasks/llm-registry.md`.

**Git rules for this task**: template Hard rules 5 to 7 (task doc sync, pull `main` and docs-scope check before ready, who owns which doc) apply in full. The latest version of this file is in `D:\Study Material\7AI\docs\execution\sprint5\bugs\tasks\llm-registry.md`.

**Where this task lives (founder decision, 19 Oct)**: bug work belongs to the active sprint. This task and its report sit in Sprint 5's bug folders. The hot-fixer protocol still names `docs/execution/bugs/Sprint3/tasks/` (archived, see docs/ARCHIVE_INDEX.md) and `reports/`; for this task use `docs/execution/sprint5/bugs/tasks/` and `docs/execution/sprint5/bugs/reports/` instead. The protocol amendment is pending (Sprint 6 plan item P8); do not edit the protocol.

**Objective**: stop "reply was cut off at the output cap" failures for good. Today each LLM stage sets its own output cap, hidden reasoning can spend that cap before any answer is written, and a cut-off fails the stage at once with advice ("shorten the brief") that is wrong for an empty reply. After this task the registry owns every stage's model, output limit and reasoning setting; a cut-off recovers by itself once; the failure text names the real cause and carries the evidence; and tests plus a canary command keep it from coming back.

**Duration** (estimate, report real hours): Part A about 4 hours, Part B about 1 day, Part C about 1 to 2 hours.

**Depends On**: Bugs Task 11 (structured output and failure-path usage booking, R4 and R5 in `Sprint3/reports/task11.md` (archived, see docs/ARCHIVE_INDEX.md)); Sprint 5 Task 8 R8.2, R8.6 and R9 (budget check before a paid call, a pricing row for every model, stages move to `claude-sonnet-5-5`); Sprint 5 Task 6 round 2 (PR #105, draft: reviewer on Sonnet 5.5 with structured output). Work on whatever is on `main` when you start. If one of them is still open, keep its registry entries and add the new fields beside them; do not wait for it and do not redo its work.

**Owning Component**: `studio/src/llm/` (`index.ts`, `client.ts`, `registry.ts`, `types.ts`, and the new files named below) and the agents that define their own output caps.

**Role**: BE for every item; Part C also needs one founder step in YouTube Studio. No app change (R3 names the one thing to report).

**Release shape**: two small releases, because the founder's combined test is waiting on Part A (the protocol lets an urgent item go out as its own small release).
- Part A: branch `BUGS_LLM_REGISTRY_A`, commits `BUGS_LLM_REGISTRY_A_R<X>: ...`, closing commit `BUGS_LLM_REGISTRY_A_REPORT: ...`, its own draft PR.
- Part B: branch `BUGS_LLM_REGISTRY_B`, cut from a fresh `origin/main` after Part A is merged, same naming.
- Part C (thumbnail 403 re-test): branch `BUGS_LLM_REGISTRY_C`, same naming, its own small draft PR. It does not depend on A or B and may go first, last or in parallel.
- The task is named, not numbered, because the next free Bugs Task number cannot be confirmed from the docs (precedent: `BUGS_LOG_2`). Tell the founder the branch name in your first reply.

**Success criteria**
1. A reply cut off by the output limit recovers by itself with one retry (larger limit, reasoning off). Both calls are booked as usage; the stage result is the retry's reply. A second cut-off fails with a message that names the real cause (Part A).
2. Every purpose in the registry declares its model, output limit and reasoning setting. No file outside `studio/src/llm/` defines an output-token cap or passes a number as `maxTokens`; a test fails if one does (Part A).
3. The founder's S-1 Short (T09 in `docs/execution/sprint5/SPRINT4_5_TEST_SEQUENCE.md`) and L-1 Long (T18) get through Script Generation and Video Planning with no cut-off. That is the founder's test after merge and deploy; the agent's job is the evidence in R4 and R8.
4. Every LLM call records tokens used against its limit and a call above 60% is flagged; the failure text carries reasoning tokens, reply part kinds and the raw finish reason (Part B).
5. One failure table in the client covers cut-off, bad JSON, refusal, overloaded or rate-limited, and timeout, with a ceiling of two extra calls per stage call, each retry checked against the run's budget (Part B).
6. `npm run llm:canary` prints tokens used against the limit for every purpose from real calls, with the cost; the report holds the table (Part B).
7. The custom-thumbnail upload is tried once more now that the NIYT channel is phone verified, and the result is a fact in the report: it works (`coverFrameSet: true`, thumbnail visible on the video), or the exact reason it still fails with the fix or the founder step (Part C).

---

## What happened, in plain words

- **Bugs Task 11 (8 Oct)** raised `SCRIPT_MAX_TOKENS` from 2048 to 4096 and made `stopReason: length` fail at once with no retry, replacing the earlier "retry once with a larger cap" (the founder's list).
- **Video Planning** hit the same cut-off earlier. The founder says one of the merged PRs already fixes it for the planner (R0 item 4).
- **19 Oct (IST), Not In Your Textbook, Short, 45 s, Freeform, Script Generation**: "reply was cut off at the output cap (stopReason=length, maxTokens=4096, outputTokens=4096, replyLength=0)", with the advice "shorten the brief or lower the target length". A full budget with no visible text means the tokens went to something that is not the reply. Three suspects: hidden reasoning (the most likely; the founder asked on 18 Oct for the stages to move to Sonnet 5.5, Task 8 R9 and Task 6 D3, and whether that was live on 19 Oct is R0 item 3), a structured or tool reply whose partial text the client drops, or a real overflow. The architect could not read the code or the debug bundle, so none of these is confirmed. R0 settles it.
- The same failure has now shown up in three stages. Each time one agent's cap was patched. That is the thing to stop.

**Decisions (founder, 19 Oct, in chat)**: one policy for every LLM stage, owned by the registry: **yes**. The automatic retry on a cut-off comes back (once, larger limit): **yes**. This reverses the "fail at once" part of Bugs Task 11 R4; the rest of R4 stays (real usage booked, raw reply kept). Evidence on the error, a failure table, a canary command and a model facts table: **yes**. The founder's combined test (T09 onward) waits for Part A.

## R0 - Read first, before any code (table in the report, at most 12 lines)

Confirm or correct each "docs say" line from the real code. After the table, send the founder three lines: the confirmed cause, which PR holds the planner fix, and anything in the docs that was wrong. Then start R1.

**Docs say**: `callLLM({ purpose, system, messages, maxTokens, outputSchema? })` in `llm/index.ts` goes to `llm/client.ts` and returns text, usage and `stopReason`. Purposes live in `llm/registry.ts` (at least intake parsing, script generation, script review, video production planning, publishing metadata, video review and the video-intelligence own-draft purpose; the docs disagree on which of them run on `claude-haiku-4-5` and which on `claude-sonnet-5`). Each agent sets its own cap constant. Structured output uses the AI SDK (`Output.object`); on `NoObjectGeneratedError` the client returns the text and the real usage; a 400 or 422 on the structured request falls back once to plain text. A reply that is not valid JSON and did not stop for length gets mechanical repair plus one more call (Bugs Task 11 R5). Failure-path usage is booked through `stage-failure.ts`. The budget gate runs once before the stage and does not re-check before a retry.

1. Every `callLLM` call site and any model call outside it (search for the Anthropic and AI SDK imports and for every `maxTokens` and `*_MAX_TOKENS`): purpose, model, cap, structured or plain, any reasoning or effort option, and what happens on length, bad JSON, refusal, overload and timeout.
2. The failed run's stage output (the founder attaches its debug bundle): model, input, output and reasoning tokens, `stopReason`, whether the reply was text, thinking or a tool call, and any reasoning option set.
3. Which model each purpose resolves to on `main` now and, from the provider's documentation for that exact model id (not from memory): does it reason by default, does the output limit include the reasoning, what is its maximum output, and when is streaming required.
4. PRs #87 to #97. `docs/STATUS.md` lists the planner fixes as #87 to #90; the founder believes one of #91 to #97 holds the same cut-off fix for the video planner. Say which PR, whether it is merged and deployed, why that failure happened, and exactly what it changed (limit, reasoning, retry, message). Say which stages it does not cover. Reuse or generalise it in R1 and R2; do not build a second mechanism beside it.
5. What the SDK already retries (`maxRetries` and its rules for 429, 5xx and timeouts), so the retries in R5 do not stack on top.
6. Whether usage events and stage outputs can carry the new numbers in R6 without a schema change.
7. Whether the reviewer's malformed JSON in Task 6's real-model check (PR #105, 18 Oct) was a cut-off. One line. Do not fix Task 6 here.

If the evidence shows a cause other than reasoning (for example, the client drops a structured reply), fix that cause inside R1 and R2 and tell the founder in one line before continuing.

---

# PART A - stop the failures (own release, ships first)

## R1 (BE) - The registry owns the limit and the reasoning setting

**Where**: `llm/registry.ts`, `llm/types.ts`, and every agent that defines its own cap.

**Fix**
1. Each purpose declares `maxOutputTokens` and `reasoning` (`'off'` or `{ budgetTokens }`). Both are required by the type, with no default in code, so a new purpose cannot leave them out. `reasoning` maps to whatever the provider calls it for that model (thinking, effort, adaptive). `'off'` is sent explicitly and never left to the provider's default.
2. Agents stop defining `*_MAX_TOKENS` and stop passing `maxTokens`; `callLLM` reads the limit from the registry. If one purpose serves both Shorts and Long videos and needs two limits, declare both in the registry and choose with a named size class, never with a number at the call site.
3. The limit is a runaway guard, not a size guess. You pay for tokens written, not for the limit. Starting values: 16,000 for script generation, video planning and script review; 4,000 for intake parsing and publishing metadata; any other purpose keeps its current limit or 4,000, whichever is higher. Never start below a stage's current limit. R8's table confirms each sits well above its real peak.
4. If a purpose has reasoning on, its limit must be at least the budget plus the expected answer; the client refuses to build the call otherwise (an error in the registry test or at startup, not mid-run).
5. Reasoning stays off for every purpose in this task. If Script Generation quality drops later (Gate 1 notes, review scores), turning reasoning on for that one purpose with a budget is one registry line. Do not do it here.

**Verify**: unit tests (R4); the R0 table updated to "purpose, model, limit, reasoning" after the change.

## R2 (BE) - One automatic retry on a cut-off

**Where**: `llm/client.ts`.

**Fix**: on `stopReason: length` the client retries once, automatically: limit doubled (at most 32,000 and never above the model's maximum), reasoning off, streaming if the SDK or API requires it. Each call is booked as its own usage event (`stage-failure.ts` for the failure path), so the retry counts against the budget; the extra call costs cents. The stage result is the retry's reply. A second length stop raises the error in R3. Keep the rest of Bugs Task 11 R4: the raw reply is kept and real usage is booked. This replaces "fail at once" for length only. Part A keeps it simple: this rule adds at most one extra call per stage call; if the retried reply is bad JSON the mechanical repair still runs but no further model call is made. R5 sets the overall ceiling.

**Verify**: a mocked-SDK test for each path (R4) and the real check in R4 step 3.

## R3 (BE) - Honest messages

**Where**: the length error built in `llm/client.ts`. Today it reads "Script Generation reply was cut off at the output cap (stopReason=length, maxTokens=…, outputTokens=…). The script is too long for one reply: shorten the brief or lower the target length."

**Fix**: two texts, each starting with the stage name and each followed by the existing technical line in brackets.
- Reply text empty: "<Stage>: the model used its whole output budget without writing an answer, twice. Your brief is not the problem. Press Retry this step; if it repeats, send the debug bundle."
- Some text: "<Stage>: the reply was cut off even after one automatic retry with a larger limit. Press Retry this step; if it repeats, send the debug bundle."

"Shorten the brief or lower the target length" disappears from both. If the app rewrites this error into its own text (Sprint 5 Task 7 R5, the failure card), do not edit app files: tell the architect which known case is needed.

**Verify**: the exact strings in tests, and the text returned by `runs.get` for a forced cut-off (R4 step 3).

## R4 (BE) - Tests, and one real check

1. Table-driven client tests with a mocked SDK: normal reply; length with text; length with empty text and reasoning tokens; length then success on the retry (limit doubled, reasoning off, two usage events); length twice (the right message for text and for empty); structured and plain paths.
2. Registry tests: every purpose has a model, a limit and a reasoning setting. A scan test reads `studio/src` and fails if any file outside `studio/src/llm/` defines an output-token cap constant or passes a numeric literal as `maxTokens` or `maxOutputTokens` (no exceptions list; if one is truly needed, ask).
3. One real check on the dev server or fixtures (Task 6 R5.3 precedent; no connection to `sevenai_preview`; spend ceiling $1, stop and report if it would be exceeded). Run the S-1 brief (`docs/channel_bibles/NIYT_CHANNEL_CONFIG.md`, Appendix A, with the channel settings text of section 7 as the fixture) through Script Generation and Video Planning with real calls. Report tokens used against the limit, reasoning tokens and stop reason per stage. Then force one purpose's limit very low in a test-only way (not reachable from the API or from production config) and show the automatic retry in the usage events and the final message returned by the API.

**Part A is done when** R1 to R4 are committed and pushed, the report file exists with the R0 table and Part A's sections, the PR is marked ready, and the founder has one line: "Part A ready: PR #N, branch ...".

---

# PART B - make it hard to break again (second release, after Part A is merged)

## R5 (BE) - One failure table in the client

**Where**: new `llm/failure-policy.ts` (the table), used by `llm/client.ts`.

**Fix**: one table in one place. For each failure: the action, the number of tries, the message.

| Failure | Action |
|---|---|
| Cut-off (`stopReason: length`) | R2 |
| Reply not valid JSON or fails the schema, and not a cut-off | the existing repair plus one more call (Bugs Task 11 R5), moved here unchanged |
| Provider refusal or content-filter stop | no retry; a plain message naming the stop reason |
| Overloaded, rate-limited (429, 5xx, 529), timeout, network error | wait and retry with backoff, honouring `retry-after`; use R0 item 5 so the SDK's retries and ours do not stack |
| Bad request or auth (400, 401, 403, 422) | no retry, except the existing structured-output fallback from Bugs Task 11 (one fallback to plain text on 400 or 422) |

Ceiling: at most two extra provider calls per stage call, across all causes. Every retry is checked against the run's remaining budget by the same rule the stage uses (Sprint 5 Task 8 R8.2). If it would pass the limit, skip the retry and fail with "Spend limit reached before the retry". Choose the plumbing after R0 (for example an optional callback on `callLLM`); if it needs more than an optional parameter, tell the architect first. Keep existing behaviour where it is not clearly wrong, and list in the report each place you changed it.

**Verify**: mocked tests for each row, including a retry refused by the budget check and a second failure of a different kind (the first call's usage is still booked).

## R6 (BE) - Evidence on every call

**Fix**
1. The technical line in brackets gains `reasoningTokens`, `blocks` (reply part kinds with counts, for example `thinking:1,text:0`), the raw provider `finishReason`, `limit` and `attempts`.
2. Every LLM call, success or failure, records `outputTokens`, `reasoningTokens`, the limit, percent used and the attempt number in its usage event or, if that cannot carry them without a schema change, in the stage output that the debug bundle already includes (R0 item 6). Never add a column: ask first.
3. A call that uses at least 60% of its limit logs `llm.near-miss purpose=... used=.../...` and sets a flag in the stage output.
4. The raw provider response metadata (not the prompt) is kept for a failed call.

**Verify**: a test that a forced cut-off yields all of these fields; the debug bundle from R4 step 3 or R8 shows them.

## R7 (BE) - Model facts table

**Where**: beside the pricing table (Sprint 5 Task 8 R8.6), for example `llm/models.ts`.

**Fix**: one row per model in use: the exact pinned id (a dated snapshot where the provider offers one; if not, say so), `maxOutputTokens`, `supportsReasoning`, `supportsStructuredOutput`, and the token level above which streaming is required. Read these from the provider's model documentation on the day and put the URL and the date in a comment above the table (never from memory). Tests: a purpose's limit and its retry limit are at most its model's maximum; reasoning is requested only where the model supports it; every model a purpose uses has a row here and a pricing row (R8.6 already makes an unknown model a test failure: extend it, do not duplicate it). Do not switch models here: Task 8 R9 owns the Sonnet 5.5 move.

## R8 (BE) - Canary command

**Where**: `llm/canary.ts` plus an `npm run llm:canary` script in `studio/package.json` (the code lives inside `llm/` so R4's scan test still passes).

**Fix**: for every purpose, one real call with a small fixed fixture (reuse the existing script, review and planner fixtures and the S-1 and L-1 briefs of the NIYT spec; write no new content). Print a table: purpose, model, limit, outputTokens, reasoningTokens, percent used, stopReason, cost, milliseconds, and the total. The command refuses to run without `--yes`, enforces a default spend ceiling of $1 (a flag raises it), and runs against the dev environment only. Put the table in the report. Anything above 60% of its limit is listed under "near-miss" with a proposed limit. This is also the command the founder or the architect runs before any future model change.

**Verify**: the table in the report, produced by the command and not typed by hand.

**Part B is done when** R5 to R8 are committed and pushed, the report is extended with Part B's sections and the canary table, the PR is marked ready, and the founder has one line.

---

# PART C - Custom thumbnail 403 re-test (own small release, any time)

**Why here**: the cover-frame upload (Sprint 2 Task 5) has returned 403 on every live attempt ("doesn't have permissions to upload and set custom video thumbnails"). The documented but untested guess was a Studio feature-eligibility or phone-verification step. The founder says NIYT has been phone verified for about two weeks (said 19 Oct), so the first job is to find out whether the 403 is already gone. This is the same work as Sprint 5 Task 8 R11.5 ("reproduce and fix the 403, or write down why it cannot be fixed"). Part C does not duplicate it.

## R9 (BE, with one founder step) - Re-test, then fix or explain

**R9.0 Read first (3 lines in the report)**: `docs/execution/sprint4/tasks/hardening-thumbnail-phone-verification.md`, the Sprint 2 Task 5 task and report, and `docs/execution/sprint5/tasks/task8.md` R11.5. Check on `main` and in the open PRs whether R11.5 is already done or in progress. If it is done or another agent is on it, do not build anything: report what you found, the 403 status if known, and stop Part C. Otherwise carry on.

**R9.1 Founder step (done 19 Oct)**: the founder confirmed in YouTube Studio, NIYT channel, Settings, Channel, Feature eligibility, that all three tiers show Enabled: Standard, Intermediate (videos over 15 minutes, custom thumbnails, live streaming) and Advanced. So the account side is cleared and a remaining 403 points to our side first (R9.3). Do not ask the founder for this again.

**R9.2 One real attempt**: use the existing publish path once, on a private or unlisted test upload, following Sprint 5 Task 8's rules for real publishes (no public video for a test). Read and report: `coverFrameSet`, the raw status code, and the full error body with its reason code if it fails. From Google's documentation (not from memory) confirm which OAuth scope `thumbnails.set` needs and that the stored token has it; also confirm the file meets the documented limits (format, size).

**R9.3 If it still fails with 403**: check the likely suspects in this order. (1) The stored OAuth token: its granted scopes (Google's documentation for `thumbnails.set`), and when it was granted. A token granted before the channel was verified or enabled may need the founder to reconnect the channel in the app; say so if so. (2) Our request shape, image format and size. (3) Anything else the raw error body points to. Then make the same `thumbnails.set` request by hand with the same token and a hand-made image, to separate our code from the account. Then:
- If the by-hand call also fails: it is the account or the feature gate. Write down the exact reason and the exact founder step, and stop. This is the "write down why it cannot be fixed" outcome of R11.5.
- If the by-hand call works and ours does not: it is our code (scope, request shape, image, timing after upload). Fix it in the smallest way and show a real upload that sets the thumbnail.

**R9.4 If it works**: say so with the evidence, and add the test to the report as the exact steps the founder repeats in the test sequence (proposed new step at T25: set a thumbnail, read `coverFrameSet`). Do not edit the test sequence.

**Verify**: a real upload. The thumbnail is visible on the video in Studio (founder screenshot) and `coverFrameSet` is `true`; or the report holds the exact failure and the reason.

**Part C is done when** R9 is committed and pushed (a code change only if R9.3 found one), the report has the Part C section, and the founder has one line: "Part C: 403 gone / still 403 because ..., PR #N if any".

---

## After merge (not agent work)

The founder deploys Part A and runs T09 (S-1 Short), and T18 (L-1 Long) after Part B. The architect then (1) reads the debug bundles for tokens used against the limit, (2) tightens each limit to about 3 to 4 times its real peak once a week of near-miss data exists (floor 4,000), (3) updates `docs/decisions/LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md`, and (4) asks the founder to add one rule to the task template: a new LLM stage needs a registry entry and a canary example.

## Schema Impact
None expected. If a requirement cannot be met without a column, stop and ask the founder (protocol guardrail).

## Business Logic / State Transition
No new run states or transitions. An automatic retry is invisible to the state machine: it shows as two usage events inside one stage attempt.

## NOT in this task
Image, voice and transcription calls (their own registries: `ai-visuals/registry.ts`, `media/registry.ts`); the budget gate itself (only the check in R5); prompt wording and script quality (Task 6 owns the review prompt, Task 8 R9 owns the Sonnet 5.5 switch); a fallback model; splitting long scripts into per-chapter calls (only if the near-miss data ever shows an output close to 32,000); a usage dashboard; any app screen.

## Testing
```bash
npm run build && npm run lint && npx tsc --noEmit
npx vitest run llm
npx vitest run          # once, before the report
```
Verification bar (protocol): real calls, not "should work". For this task that means the dev-environment real checks in R4 step 3 and R8; preview is verified by the founder's T09 and T18 after merge and deploy.

## Report
`docs/execution/sprint5/bugs/reports/llm-registry.md` (Part A creates it, Parts B and C extend it): the R0 table; one section per requirement; the real-check numbers (Part A) and the canary table (Part B); each place a behaviour changed; deviations; real hours; and one line for the founder. Do not edit `STATUS.md`.

## Links & References
- `docs/execution/bugs/HOTFIXER_AGENT_PROTOCOL.md`, `docs/execution/templates/TASK_TEMPLATE.md`
- `docs/execution/bugs/Sprint3/reports/task11.md` (archived, see docs/ARCHIVE_INDEX.md) (R4 cap and cut-off rule, R5 repair and retry, structured output)
- `docs/execution/week2/tasks/task1.md`, `docs/execution/week2/reports/task1.md` (archived, see docs/ARCHIVE_INDEX.md) (`callLLM`, registry); `docs/execution/week5/reports/task4.md` (archived, see docs/ARCHIVE_INDEX.md) (model tiers)
- `docs/execution/sprint5/tasks/task8.md` (R8.2, R8.6, R9, R11.5), `task6.md` (D3, round 2), `task7.md` (R5 failure card)
- Part C: `docs/execution/sprint4/tasks/hardening-thumbnail-phone-verification.md`, the Sprint 2 Task 5 task and report
- `docs/decisions/LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md`
- `docs/channel_bibles/NIYT_CHANNEL_CONFIG.md` (section 7, Appendix A: S-1 and L-1 briefs); `docs/execution/sprint5/SPRINT4_5_TEST_SEQUENCE.md` (T09, T18)

## Revision log
- r1, 2026-10-19: first issue (Parts A, B and C).
- r2, 2026-10-19: R9.1 closed by the founder; R9.3 suspects ordered; git rules point to template Hard rules 5 to 7.
