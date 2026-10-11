# Sprint 4 Task 2: Script-Side Pipeline Capabilities

**Date**: 2026-10-06
**Status**: Complete
**Files Created**: 5 (`run-pipeline/resolved-config.ts`, 3 test files, this report)
**Files Modified**: 10
**Tests**: All passing (193 / 193; 19 new)
**Branch**: `sprint4_be`

## What Was Done

- **R4 raw brief**: `generateScript` and `reviewScript` take `briefText`; the state machine always passes
  `run.briefText`. The fact policy (`brief-only` | `brief-plus-common`) comes from the resolved config;
  `brief-only` adds an "authoritative facts" rule to the system prompt, the default leaves it unchanged.
- **R5 sources**: `CreationOptionsSchema.sources` and `runs.create`'s `sources` (max 20 entries, 500
  chars each), folded into `creationOptions`. No migration. Explicit only.
- **R6 length**: the "30-60 seconds" literals are gone from both system prompts. The resolved
  `targetSeconds` (run override `targetDurationSec`, else profile, else 45) goes into the user message with
  its word-count equivalent; the review judges length within about 20% of the target and never over 60 s.
  `resolveChannelConfig` gained `runOverrideTargetSeconds` so Sprint 3's per-run option still wins.
- **R7**: banned openers/endings are added to the generation message only when non-empty.
- **R8**: `ScriptReviewOutput.styleGuideViolations` (defaults to `[]`, so older stored outputs parse);
  the review prompt receives the guide, banned lists and target. `formatGateMessage` renders
  `Factual concerns`, `Style guide violations` and `Sources cited in brief` blocks before the closing
  Reply line, each omitted when empty.
- **For the app (`runs.get`)**: new derived field `scriptReview: { factualConcerns, styleGuideViolations,
  sources } | null` (latest completed review attempt plus the run's `creationOptions.sources`). The raw
  values are also still in `stages[].output` and `run.creationOptions`.
- Stages load the profile through the run's own snapshot (`run-pipeline/resolved-config.ts`), never the
  channel's current active version.

## Schema Changes Applied

None (Json columns only).

## Test Results

```
npx vitest run -> 30 files, 193 tests passed; tsc, lint, build clean
```

New tests: byte-identical `formatGateMessage` against the pre-change literal (also with empty arrays),
block order and omission; prompt builders (no "30-60", fact-policy rule, banned lists only when set,
unchanged message when no new params); `styleGuideViolations` default/type; `deriveScriptReview`.

Live, real Anthropic calls (about $0.2 total, direct agent calls plus one run through the state machine
on a throwaway tenant `ZZ_TASK2_VERIFY`, deleted afterwards, leftovers 0):
- **R4**: brief with 4 specific facts (date, time, 25 seconds of fuel, 238,900 miles): `brief-only` kept
  4/4; the default `brief-plus-common` kept 2/4 in the one sample taken (the model dropped two figures).
- **R6** (estimated seconds at 150 words/minute, 3 calls each): target 30 -> 27, 26, 27; target 45 ->
  42, 43, 43; **old prompt (no target, "30-60 s" range) -> 61, 57, 65**.
- **R7**: banned openers "Did you know / Imagine / What if": 0 violations in 5 calls; the same lists
  through the full stage (state machine) also respected.
- **R8**: a deliberately violating script (two banned openers, a banned ending, hype tone) produced 4
  specific `styleGuideViolations`; a clean script with no guide produced `[]`.
- **State machine**, channel profile `{guide, 2 banned lists, targetSeconds: 30, factPolicy: brief-only}`
  and `creationOptions.sources`: stage input shows the resolved values, the script came out about 30 s with
  4/4 facts, `runs.get` returned `scriptReview` with the sources, and the Gate 1 message built from that
  run renders the Sources block and ends with the Reply line.

## Deviations from Spec

- **Not byte-identical to before for profile-less channels, by design (R6)**: a channel with no profile now
  gets the default 45 s target. Measured: old prompt gave 57-65 s estimated narration (two of three at or
  over the 60 s Shorts ceiling); the new default gives about 43 s. Scripts are shorter and more reliably
  under 60 s. Flagged here as asked; Task 8's pacing is unaffected (it works from the narration it gets).
- **`factualConcerns` gap was partly different from the doc**: it was not completely invisible at Gate 1;
  `state-machine.ts` appended it into the ReviewLog rationale, which Gate 1 shows as "Review notes". To
  avoid showing every concern twice, I removed it from the rationale and now render it as its own block
  (and via `runs.get.scriptReview`). Effect: ReviewLog rationales for new runs no longer carry the
  "Factual concerns" sentence; anything reading that sentence from the log text must use `scriptReview`.
  The Gate 1 message is unchanged when there are no concerns.
- The doc says the new blocks are "appended after" the Reply line stays last, but its own example puts
  them before it; I followed the example (Reply line last).
- **Not done**: the R6 spot-check used word-count estimates, not an `ffprobe` of a rendered audio file
  (no TTS render was run, to keep cost down). `runs.create` itself was not called (it starts the whole paid
  pipeline); `creationOptions.sources` persistence was checked via `createRun`, which it calls, and the
  zod input shape is covered by the type check only.
- `targetSeconds` replaced `targetDurationSec` in `generateScript`'s params and in the stored
  script_generation stage input (the run-level option itself is unchanged).

## Sign-Off

- Task Objective: Met
- Schema Impact: None, matches `SCHEMA.md`
- Business Logic: `BUSINESS_LOGIC.md` updated
- Tests: Passing
- Ready for Integration: Yes
