# Bugs Task 11: Script-Generation JSON Failure + Failure-Path Usage Accounting

**Date**: 2026-10-07
**Status**: Done, action needed (founder deploys, runs the usage SQL, presses Retry on the failed run)
**Branch**: `BUGS_TASK11_SCRIPT_JSON` (PR [#55](https://github.com/Neeraj1002/7AI/pull/55))
**Roles**: all items BE. Backend deploy only. No OTA, no app change, no schema change.

## Background

Run `248fae8a-93e8-4e88-a8aa-f80014a1befa` (the founder's own test brief; `creationOptions`
`{"audioLayer":"none","visualSource":"ai-stills","targetDurationSec":45}`) failed at `script_generation`
attempt 1. `JSON.parse` rejected the model reply in `generateScript`, which threw a
`NonTransientStageError`, so the run went to `needs_attention` after one call. The error kept only 200
characters of the reply, the parser's position message (on `cause`) was never logged, and the failure-path
usage event booked tokens 0, cost $0, provider/model `unknown` for a real Sonnet call.

## What changed, per item

**R1: self-explanatory failure** (`agents/script-generation/index.ts`, `run-pipeline/stage-failure.ts`,
`pipeline-stage.repository.ts` `failStage`, `state-machine.ts` `failStageAndEscalate`).
The error message now carries the parser message (which names the position), `stopReason` and reply
length. The first and last 300 characters of the reply are logged. The failed stage row's `output` keeps
`rawReply` (capped at 8000, with a `rawReplyTruncated` flag), `stopReason`, `replyLength`, `parseError`,
and, when it retried, `attempts`, `firstParseError`, `firstStopReason`, `firstRawReply`. Only failures
that have a raw reply write `output`; every other failed row is unchanged.

**R2: accounting** (`stage-failure.ts` `llmUsageContext` / `failureUsageFields`, every agent that parses a
model reply, `state-machine.ts`). A thrower now attaches the finished call's provider, model, tokens and
cost to the error context, and the catch paths book them instead of `unknown`/0/$0.

Stages that had the same pattern (a real call completed, then the reply was rejected, then the catch wrote
`unknown`/0/$0): **intake** (`parse-brief.ts`), **script_generation**, **script_review**,
**video-production-planning** (`plan.ts`, including its visualSource-override throw), and
**metadata-generation** (`publishing/index.ts`). All five are fixed.
**video_review** (`video-intelligence`) had a variant: its multimodal reply was rejected and the stage wrote
no usage event at all (only the success path booked spend). Fixed by booking the attached usage in that
stage's catch. **video_generation** (TTS, Whisper, image calls) has the same `unknown`/no-token catch, but
`generateVideo` throws without per-call usage, so a real call cannot be attributed. Not changed. **Not fixed**:
if a provider call itself fails (no reply), nothing was billed and the existing provider/model-with-zero row
stays correct.

**R3: retry once** (`generateScript`). On a parse or schema failure the same attempt makes one more call
that includes the original request, the bad reply and the exact parse error, asking for corrected JSON
only. If `stopReason` is `length`, the retry repeats the request with a note and a 4096 output cap and does
not feed back the half script. Only a second failure raises the existing non-transient error. Each call is
booked as its own usage event (the error lists every completed call), so the retry counts against the
budget. A provider error on the retry call keeps the first call's spend on the error.
Note: the budget gate still runs once, before the stage; it does not re-check before the retry call.

**R4: tolerant parsing** (`llm/extract-json.ts` `extractJsonObjectText`, used by Script Generation only):
strip a code fence (closed or unclosed), take the outermost `{...}`, escape raw newlines, tabs and other
control characters inside strings. No quote-guessing: a stray quote still fails and goes to the R3 retry.

### R4 approach: repair, not structured output

The installed SDK (`ai` 7.0.93, `@ai-sdk/anthropic` 4.0.49) does list `claude-sonnet-5` as supporting native
structured output, and `generateText` can use it. I did not choose it because: (1) usage accounting is not
clean through our `llm/client.ts` wrapper. A schema failure surfaces as `NoObjectGeneratedError`, which the
wrapper turns into an "unrecognized error" with zero usage, which is the R2 bug again unless the wrapper is
reworked; (2) whether the provider accepts this schema (`min(1)`, string arrays) cannot be confirmed
without a paid live call, and a wrong guess would turn every script generation into a 400; (3) it is a
cross-cutting change to `callLLM`, much larger than the bug. Recommend it as a follow-up once a founder-run
check exists. Repair plus the R3 retry (which does cover a stray quote) is small and testable offline.

## The founder's working theory (unconfirmed)

Theory: the brief has quoted spans and the model copies them into `scriptText` as unescaped straight quotes.
**I could not confirm or refute it.** There is no "R0" raw reply: the original run stored only the first
200 characters and never logged the position, which is exactly what R1 fixes. A fresh call to reproduce is a
paid live run, which this task forbids. What the evidence does say: the 200 kept characters
(`You've heard Roman soldiers were paid in salt. They weren't. In Roman texts, salarium meant a money
allowance, plain and simple. Pliny linked the word to salt, centuries after the fact.`) contain no
double quote, so the break is after them, where the brief's quoted phrases ("salary", "salt money",
"no ancient source", "never") would fall. That is consistent with the theory and does not prove it.
(The brief has five quoted spans by my count: the first sentence, "salary", "salt money",
"no ancient source" and "never".) Other explanations (truncation, a raw newline) are not excluded; R4 repairs
the latter and R3 recovers from all of them. The next failure will carry the raw reply, `stopReason` and
position, so Retry on the failed run plus the stage row's `output` will settle it.

Regression fixture: `agents/script-generation/regression-248fae8a.test.ts` uses this brief (topic,
constraints, 45s target) with synthetic replies that copy the quoted spans unescaped. It checks that the
break lands at the first stray quote, that one retry with the parse error fed back recovers, and that two
bad replies fail after exactly two booked calls.

## Tests

`studio/`: `npm run build`, `npm run lint`, `npm run typecheck` clean; `npx vitest run` 294 passed, 49
skipped (the skips are pre-existing). New tests: `agents/script-generation/index.test.ts` (clean reply;
unescaped quote; raw newline; code fence; schema failure; truncation with `stopReason: length` and the
larger cap; second failure with exactly two calls; provider error on the retry; diagnostics and logging),
`regression-248fae8a.test.ts`, `llm/extract-json.test.ts`, `run-pipeline/stage-failure.test.ts` and
`stage-failure.usage.test.ts`, and `run-pipeline/state-machine.script-generation.test.ts` (the failure-path
usage event, raw reply on the failed stage row, both calls booked on success and failure).

## What I could not verify

- **Live behaviour.** No paid run, no connection to `sevenai_preview`. Everything is mocked at the `callLLM` boundary. Whether the real model obeys the retry feedback is unproven.
- **The root-cause reply** (above).
- **Flaky full-suite run.** In two of four full `vitest` runs, one test failed; the rerun passed 294/294. I did not capture which test failed on the failing runs. It was not one of the new tests in isolation. Worth a look if CI shows it.
- **Founder SQL result** (below) has not been run.

## Founder actions

1. Merge, deploy the backend (no OTA, no app build).
2. Run on the VPS and paste the result:
   ```sql
   SELECT "createdAt", model, provider, "costUsd", metadata FROM usage_events WHERE provider = 'unknown' OR "costUsd" = 0 ORDER BY "createdAt" DESC LIMIT 20;
   ```
   Expectation: closureTask F10 listed 33 `unknown/unknown` rows (video-generation and intake) and 6
   `gpt-image-1.5` rows at $0. This task explains the **intake** `unknown/unknown` rows only where the cause was a
   rejected reply (a real call booked as `unknown`/$0). It does **not** explain `video-generation`
   `unknown/unknown` rows (TTS/image failures, see above) or the `gpt-image-1.5` $0 rows, which are a separate
   pricing/stub question. **Result: pending, to be recorded here once pasted.**
3. Press Retry on run `248fae8a`. Expected: succeeds on the first or second call. If it fails, the failed
   `script_generation` row's `output` now holds the raw reply and parse position.
