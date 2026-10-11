# Bugs Task 11: Script-Generation JSON Failure + Failure-Path Usage Accounting

**Date**: 2026-10-08
**Status**: Done, action needed (founder deploys, runs the usage SQL, presses Retry on the failed run)
**Branch**: `BUGS_TASK11_SCRIPT_JSON` (PR [#55](https://github.com/Neeraj1002/7AI/pull/55))
**Roles**: all items BE. Backend deploy only. No OTA, no app change, no schema change.

## Background and confirmed cause

Run `248fae8a-93e8-4e88-a8aa-f80014a1befa` (the founder's own test brief; `creationOptions`
`{"audioLayer":"none","visualSource":"ai-stills","targetDurationSec":45}`) failed at `script_generation`
attempt 1. `JSON.parse` rejected the model reply in `generateScript`, which threw a
`NonTransientStageError`, so the run went to `needs_attention` after one call. The error kept 200
characters of the reply, the parser position (on `cause`) was never logged, and the failure-path usage
event booked tokens 0, cost $0, provider/model `unknown` for a real Sonnet call.

**Cause, confirmed by the founder** (not by me: I made no live call): the same brief with straight double
quotes failed twice at script generation; with curly quotes it passed. Straight quotes inside the model's
JSON reply break `JSON.parse`. R0 (fetch the raw reply) was dropped.

## Numbering

The founder's list is authoritative: **R1** diagnostics, **R2** accounting, **R3** structured output (the
primary fix), **R4** output cap + `stopReason` + curly-quote prompt line, **R5** fallback (one retry with
the error fed back, plus mechanical repair). The git history predates that list: commits
`BUGS_TASK11_R3` (retry) and `BUGS_TASK11_R4` (repair) on the branch are **R5's** two halves, and the
structured-output + cap work is committed as `BUGS_TASK11_R3_R4` (one commit; both touch
`agents/script-generation/index.ts` and cannot be split without rewriting history, which I did not do).

## Status of each item

| Item | Status |
|---|---|
| R1 diagnostics | **Done** |
| R2 accounting | **Done** |
| R3 structured output | **Done**, verified on mocks only |
| R4 cap, stopReason, prompt | **Done** |
| R5 fallback (retry + repair) | **Done** |

### R1: self-explanatory failure
`agents/script-generation/index.ts`, `run-pipeline/stage-failure.ts`, `pipeline-stage.repository.ts`
(`failStage`), `state-machine.ts` (`failStageAndEscalate`). The error carries the parser message (which names
the position), `stopReason` and reply length. The first and last 300 characters of the reply are logged. The
failed stage row's `output` keeps `rawReply` (capped at 8000, with `rawReplyTruncated`), `stopReason`,
`replyLength`, `parseError` and, if it retried, `attempts`, `firstParseError`, `firstStopReason`,
`firstRawReply`. Only failures with a raw reply write `output`; every other failed row is unchanged.

### R2: accounting
`stage-failure.ts` (`llmUsageContext`, `failureUsageFields`, `failureUsageEvents`) and every agent that
parses a model reply. A thrower attaches the finished call's provider, model, tokens and cost to the error;
the catch paths book them instead of `unknown`/0/$0. Audit of the other stages' catch paths:

- Had the same pattern (a real call completed, the reply was rejected, the catch wrote `unknown`/0/$0), all
  **fixed**: intake (`parse-brief.ts`), script_generation, script_review, video-production-planning (`plan.ts`,
  including its visualSource-override throw), metadata-generation (`publishing/index.ts`).
- Variant, **fixed**: video_review (`video-intelligence`). A rejected multimodal reply wrote no usage event at
  all; its catch now books the attached usage.
- **Not fixed**: video_generation (TTS, Whisper, image calls). Its catch has the same `unknown` shape, but
  `generateVideo` throws without per-call usage, so a real call cannot be attributed.
- A provider call that itself failed (no reply) bills nothing, so provider/model with zero usage stays correct.

### R3: structured output (primary fix)
`llm/types.ts`, `llm/index.ts`, `llm/client.ts`, `agents/script-generation/index.ts`. `callLLM` takes an
optional `outputSchema`; the client passes it to the SDK as `Output.object({ schema })`, so the provider's
decoder produces schema-valid JSON and escapes quotes and newlines itself. The SDK sanitizes constraints the
provider's schema dialect lacks (e.g. `minLength`) into the schema description (`@ai-sdk/anthropic`
`sanitizeJsonSchema`), and lists `claude-sonnet-5` as supporting structured output.

- If the SDK still cannot build the object (`NoObjectGeneratedError`: cut off, or failing the schema), the
  client returns the text and **real usage** as an ordinary result. The caller's own parse, fallback and
  accounting then handle it. (My first assessment rejected structured output partly because this case lost
  usage; handling it in the client removes that objection.)
- A **400 or 422** from the first call (the one that sent `outputSchema`; nothing billed) falls back **once** to
  plain text and logs `provider returned <status> for the structured-output request`. The decision is on the
  HTTP status the client now attaches to the error (`statusCode` in the error context), not on message text.
  No fallback on any other status (401, 429, 500, 529 ...), on an error with no status, or on a second 400.
- Usage from a structured call reaches `usage_events`: `state-machine.structured-usage.test.ts` runs the real
  `generateScript` + client with only the SDK's `generateText` and the repositories mocked, and asserts the
  inserted event has the call's tokens, a positive cost, provider `anthropic` and model `claude-sonnet-5`, for
  both a good reply and a cut-off one.

### R4: cap, stopReason, curly-quote instruction
`SCRIPT_MAX_TOKENS` raised 2048 to 4096. A reply with `stopReason: length` now fails immediately with
"Script Generation reply was cut off at the output cap (stopReason=length, maxTokens=…, outputTokens=…)…"
and never reaches the parser or a retry; its real usage is still booked and the raw reply is kept (R1/R2).
The system prompt now says never to use the straight double-quote character inside `scriptText`, `captions`
or a hashtag, and to use curly quotes (or single quotes) for a quoted phrase; apostrophes are fine. This
replaces my earlier "retry once with a larger cap on length" behaviour, per the founder's list.

### R5: fallback
`generateScript` and `llm/extract-json.ts` (`extractJsonObjectText`). When a reply is not valid JSON or fails
the schema, and did not stop for length: mechanical repair first (strip a code fence, closed or unclosed;
take the outermost `{...}`; escape raw newlines, tabs and control characters inside strings; no
quote-guessing), then one more call that includes the original request, the bad reply and the exact parse
error. A second failure raises the existing non-transient error. Every call is booked as its own usage event
(the error lists them all), so the retry counts against the budget. The budget gate still runs once, before
the stage; it does not re-check before the retry.

## Regression fixture

`agents/script-generation/regression-248fae8a.test.ts` uses the founder's brief (topic, constraints, 45 s
target) with SYNTHETIC replies (the real one was never stored):
- **Straight quotes (regression):** the synthetic reply copies the quoted spans unescaped and is
  unparseable; the break lands at the first stray quote; with structured output requested, the escaped reply
  passes in one call.
- **Curly quotes (control):** passes in one call and keeps the curly characters.
- Fallback paths: provider rejecting the schema falls back once and the retry/repair path recovers straight
  quotes; an unrelated provider error does not fall back; two bad replies fail after exactly two booked calls.

## Tests

`studio/`: `npm run build`, `npm run lint`, `npm run typecheck` clean; `npx vitest run` 330 passed, 49
skipped (pre-existing skips), five consecutive full runs, all green. New or changed: `agents/script-generation/index.test.ts`,
`regression-248fae8a.test.ts`, `llm/client.test.ts`, `llm/extract-json.test.ts`,
`run-pipeline/stage-failure.test.ts`, `stage-failure.usage.test.ts`,
`state-machine.script-generation.test.ts`, `state-machine.structured-usage.test.ts`, `llm/client.status.test.ts`,
`llm/describe-json-error.test.ts`, `agents/script-generation/no-reply-text.test.ts`,
`api/routers/admin/runs.failed-content.test.ts`.

## What I could not verify

- **Live behaviour.** No paid run, no connection to `sevenai_preview`. Everything is mocked at `callLLM` or
  the SDK's `generateText`. In particular, **whether Anthropic accepts this schema for `claude-sonnet-5`, and
  whether the model's output stays within the 4096 cap, is unproven.** If the provider rejects the schema,
  the one-time fallback to plain text (with the curly-quote prompt, repair and retry) keeps script
  generation working if the provider answers 400 or 422, and the log line
  `provider returned <status> for the structured-output request` says so. If Anthropic rejected the schema
  with some other status, the run would fail with that error instead.
- **The earlier intermittent failure** is named in the next section. I could not reproduce it in five
  sequential full runs; I reproduced the same class of failure only under deliberate CPU contention.
- **Founder SQL result** (below) has not been run.

## Review changes on PR #55

**1. Fallback decided on status, not message text.** `llm/client.ts` now puts the HTTP `statusCode` of a
provider error into the error context. `generateScript` falls back once to plain text only when the
structured-output call (nothing completed yet) fails with 400 or 422. Tests: 400 and 422 fall back (and the
retry/repair path then recovers straight quotes); a second 400 is raised, not retried; 500, 529, 401 and 429
do not fall back and are raised after one call; a message that mentions the schema but has no status does
not fall back. `llm/client.status.test.ts` checks the status reaches the context (400/422 non-transient, 500
transient, non-API error none).

**2. Intermittent test failure.** Five sequential full runs: 330 passed, 49 skipped, 0 failed each time. I did
not capture the original failing test, so I cannot say with certainty which one it was. When I forced load
(three full runs at once, twice), the same two files failed every time with `Test timed out in 30000ms`:
`src/storage/attempt-bundle.test.ts` (the ffmpeg-rendered "assembles the bundle for a stills render" and "…for
a stock render") and `src/stock-footage/client.test.ts` ("stub honours excludeSourceIds … assigns a different
sourceId when the first is excluded"). Those are the likely culprits: render-heavy tests with a 30 s timeout,
sensitive to machine load. Both files are on `origin/main`, and I changed nothing under `src/storage` or
`src/stock-footage`, so I did not touch them. A founder-side fix, if wanted, is a longer timeout or running
the suite with fewer workers.

**3. Reply text must not reach `lastError` or an admin response.** Checked by grep (the output is in the
session; the files are `api/routers/admin/*`, `models/repositories/admin-runs.repository.ts`,
`admin-tenants.repository.ts`). What I found and fixed:
- `admin.runs.get` (structure only) returns `outputKeys` (key names), a stage `reason` taken from the stage's
  `error` column (truncated to 300) and `lastError` (truncated to 500). It never returns stage output. But
  those two error strings did carry reply text: script generation appended "Reply starts: <first 200 chars>",
  and the other five parse sites (script review, video planning, metadata, video intelligence, intake)
  appended `llm.text.slice(0, 200)` (existing behaviour). Node's own `JSON.parse` message can also quote the
  text. **Fixed:** all six messages now carry only a sanitized parser description (`describeJsonError`: generic
  wording and position, no quoted text, no offending character). Tests: `describe-json-error.test.ts`,
  `no-reply-text.test.ts`. `admin-tenants`'s truncated `lastError` reads the same column, so it is clean too.
- `admin.runs.content` (`kind: 'stage_output'`, audited) would have returned a failed stage's output, which now
  holds the raw reply. **Fixed:** for a failed stage it returns only diagnostic keys (`stopReason`,
  `replyLength`, `parseError`, `attempts`, ...) via `failedStageDiagnostics`. The raw reply is only readable
  with SQL on the VPS. A completed stage's output is returned as before. Test:
  `admin/runs.failed-content.test.ts`.
- Not an admin router, not changed: the tenant-facing `runs.get` returns `stages` (full rows with `output`) to the
  run's own tenant, so the owner of a failed run can now see the raw reply in that response. It is their own
  content, but flag it if the app should not show it.

**Known gap, stated plainly: video generation still writes an `unknown` usage row.** `generateVideo`
(TTS, Whisper, image calls) throws without per-call usage, so its catch path in `state-machine.ts` still
records provider/model `unknown` with no cost when a render fails. **The Admin alert can therefore still fire
from the video_generation stage until that is fixed.** This task does not fix it.

## Founder actions

1. Merge, deploy the backend (no OTA, no app build).
2. Run on the VPS and paste the result:
   ```sql
   SELECT "createdAt", model, provider, "costUsd", metadata FROM usage_events WHERE provider = 'unknown' OR "costUsd" = 0 ORDER BY "createdAt" DESC LIMIT 20;
   ```
   closureTask F10 listed 33 `unknown/unknown` rows (video-generation and intake) and 6 `gpt-image-1.5` rows
   at $0. This task explains only the **intake** `unknown/unknown` rows whose cause was a rejected reply. It
   does not explain the video-generation rows (see R2) or the `gpt-image-1.5` $0 rows, which are a separate
   pricing/stub question. **Result (founder SQL, 2026-10-11):** 36 `unknown/unknown` $0 rows, all dated 2026-09-28 (31), 09-29, 09-30 and 10-07 (3), and 6 `gpt-image-1.5` $0 rows on 09-28. No such row is dated after this report (2026-10-08), so there is no recurrence since the fix; the video-generation share of these rows is addressed by closure part 2.
3. Press Retry on run `248fae8a` (straight-quote brief). Expected: succeeds on the first call. If it fails, the
   failed `script_generation` row's `output` holds the raw reply and parse position.
4. Once deployed and confirmed, remove the interim "no straight quotes" rule from the playbook.
