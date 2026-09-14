# Sprint 2 Task 1: Voice Selection & Structured Creation Choices

**Date**: 2026-09-14
**Status**: Complete
**Files Created**: 6 (`docs/execution/sprint2/tasks/task1.md`, `SCHEMA.md`, `BUSINESS_LOGIC.md`,
`STATUS.md`, `scripts/set-channel-default-voice.ts`, `studio/src/media/registry.test.ts`,
`studio/src/media/client.test.ts` — 7 total, see full list below)
**Files Modified**: 10
**Tests**: All Passing (`npm run build && npm run lint && npm run typecheck && npm test` clean, 44
tests; D1/D2 additionally verified live — three real full video-generation runs, each confirmed
against the actual OpenAI TTS request payload)

## What Was Done

### D1 — A real `voice` concept

`media/registry.ts` gained `TTS_VOICES` — the 13 preset voices OpenAI's TTS endpoint currently
documents (`alloy`, `ash`, `ballad`, `coral`, `echo`, `fable`, `onyx`, `nova`, `sage`, `shimmer`,
`verse`, `marin`, `cedar`), sourced directly from the installed `openai` SDK's
`SpeechCreateParams.voice` doc comment (`node_modules/openai/resources/audio/speech.d.ts`), not a
guessed list, each with a short label. `DEFAULT_TTS_VOICE = 'alloy'` names what was previously an
inline `?? 'alloy'` literal buried in `client.ts` — now one source of truth, matching the
`DEFAULT_PRIVACY_STATUS` convention Week 5 Task 5 already established.

`synthesizeSpeech`'s public signature (`media/index.ts`) already accepted an optional
`voiceConfig: VoiceConfig` — that plumbing existed before this task, but no call site ever used it:
`video-generation/index.ts` called `synthesizeSpeech(params.scriptText, {})`, always taking the
hardcoded default. `generateVideo` gained a `voice?: string` parameter, threaded straight into
`synthesizeSpeech(params.scriptText, { voice: params.voice })` — the real gap this task closed.

### D2 — Per-channel default, per-brief override

**Schema**: a real migration (`prisma migrate dev --name sprint2_voice_selection`) — see
`sprint2/SCHEMA.md` for the full field/type detail. `Channel.defaultVoice String? @db.VarChar(50)`
and `PipelineRun.creationOptions Json?`, both additive and nullable, no backfill.

**The structural point**: `CreationOptions` (`types/pipeline.types.ts`) is a genuinely separate
concept from `IntakeParsed` — `{ voice?: string, visualSource?: string, audioLayer?: string }`, this
task only ever setting `voice`. `api/routers/runs.ts`'s `create` mutation gained an optional `voice`
field, validated with `z.enum(TTS_VOICE_KEYS)` (rejects an unknown voice at the API edge, before a
`PipelineRun` row even exists), stored straight into `creationOptions` — never touching
`parse-brief.ts`'s LLM call at all.

**Resolution**: `media/registry.ts`'s new `resolveVoice` is the pure, three-step rule (override →
channel default → hardcoded fallback), documented once in `sprint2/BUSINESS_LOGIC.md` as the general
pattern Task 2/3 will reuse. `state-machine.ts`'s `runVideoGenerationStage` calls it once, resolving
to a concrete `resolvedVoice` before `generateVideo` is invoked, and records it into the
`video_generation` stage's `input` for observability (mirroring Week 5 Task 5's `editedOutput`
audit-trail reasoning).

**A small addition beyond the literal spec, for consistency**: `scripts/set-channel-default-voice.ts`
— the task doesn't explicitly ask for this, but there was otherwise no way to actually set
`Channel.defaultVoice` at all (no in-app settings UI exists yet, same posture as every other
channel-level MVP setting). Mirrors `scripts/set-channel-budget-override.ts`'s exact convention
(same validation-against-known-keys, same `clear` semantics).

## Real, live verification

**D1's request-payload check** (Verify item 1 — the task explicitly allows either a real request
inspection or "a mocked client call, same rigor as Week 2's LLM-layer tests"): wrote
`media/client.test.ts`, mocking the `openai` SDK's `audio.speech.create` and asserting the exact
object passed to it — one test confirms an explicit `voice: 'onyx'` reaches the real request
unchanged, one confirms an omitted voice still resolves to `DEFAULT_TTS_VOICE`. This is the layer
where an unresolved/dropped voice would actually manifest, not just where our own wrapper returns
without throwing.

**D2's three-way resolution, real and live, not just unit-tested**: ran three real, full
`video_generation` stage executions (real TTS, real stock footage, real ffmpeg assembly) against a
fixture `PipelineRun` at each of the three resolution states, temporarily instrumenting
`synthesizeSpeechViaProvider` with a one-line debug log printing the real `audio.speech.create`
request body (added, observed, then reverted immediately after — this codebase has no existing
precedent for logging outgoing provider requests, so this stayed a verification-only, non-persisted
change):

1. **Override wins** — `creationOptions: { voice: 'nova' }`, channel `defaultVoice: null` — real
   request: `{"model":"tts-1-hd","voice":"nova",...}`. Stage `input.resolvedVoice` also recorded
   `"nova"`.
2. **Channel default, no override** — `creationOptions: undefined`, channel `defaultVoice: 'shimmer'`
   (set via the new script) — real request: `{"model":"tts-1-hd","voice":"shimmer",...}`.
3. **Neither — the regression check that matters most** — `creationOptions: undefined`, channel
   `defaultVoice: null` (cleared back before this run) — real request:
   `{"model":"tts-1-hd","voice":"alloy",...}`, exactly `DEFAULT_TTS_VOICE`, matching every pre-Sprint-2
   run's actual behavior.

All three fixture runs completed their real `video_generation` stage successfully (each advanced to
`video_review`); closed out afterward (`close-stale-test-runs.ts`) as one-off verification fixtures,
not left dangling. The channel's `defaultVoice` was left `null` (cleared) after verification — the
"Dry-run test channel" is unchanged from before this task, matching the "nothing regresses for every
existing channel" success criterion directly, not just in principle.

## Files Created/Modified

- Created:
  - `docs/execution/sprint2/tasks/task1.md`
  - `docs/execution/sprint2/SCHEMA.md`
  - `docs/execution/sprint2/BUSINESS_LOGIC.md`
  - `docs/execution/sprint2/STATUS.md`
  - `docs/execution/sprint2/reports/task1.md`
  - `studio/scripts/set-channel-default-voice.ts`
  - `studio/src/media/registry.test.ts`
  - `studio/src/media/client.test.ts`
  - `studio/src/models/migrations/20260914134219_sprint2_voice_selection/migration.sql`
- Modified:
  - `studio/src/media/registry.ts` — `TTS_VOICES`, `TTS_VOICE_KEYS`, `DEFAULT_TTS_VOICE`, `resolveVoice`
  - `studio/src/media/client.ts` — uses `DEFAULT_TTS_VOICE` instead of an inline literal
  - `studio/src/media/index.ts` — re-exports the new registry symbols
  - `studio/src/agents/video-generation/index.ts` — `generateVideo` gains `voice?: string`
  - `studio/src/models/schema.prisma` — `Channel.defaultVoice`, `PipelineRun.creationOptions`
  - `studio/src/types/channel.types.ts` — `Channel.defaultVoice`
  - `studio/src/types/pipeline.types.ts` — `CreationOptionsSchema`/`CreationOptions`, `PipelineRun.creationOptions`, `CreatePipelineRunInput.creationOptions`
  - `studio/src/models/repositories/channel.repository.ts` — `toDomainChannel` maps `defaultVoice`
  - `studio/src/models/repositories/pipeline-run.repository.ts` — `toDomainRun` maps `creationOptions`; `createPipelineRun` persists it
  - `studio/src/api/routers/runs.ts` — `create`'s `voice` input field
  - `studio/src/run-pipeline/state-machine.ts` — the three-step resolution + threading into `generateVideo`
  - `studio/scripts/dry-run.ts` — `setup`'s optional third arg for a voice override
  - `docs/design_doc/MVP_PART2_MULTI_USER_AND_FLEXIBLE_CREATION.md` — Section 2's voice item noted as picked up

## Schema Changes Applied

`Channel.defaultVoice VARCHAR(50)` (nullable), `PipelineRun.creationOptions JSONB` (nullable) — real
migration, applied via `prisma migrate dev`. See `sprint2/SCHEMA.md` for the full field detail and
`TTS_VOICES`'s source.

## Test Results

```
npm run build       -> clean
npm run lint         -> clean
npm run typecheck    -> clean
npm test             -> 7 test files passed (7), 44 tests passed (44)
```

Plus the three real, live full-pipeline verification runs described above — no automated test
substitutes for confirming the real OpenAI request payload on a real run, per the task's own success
criterion #3.

## Deviations from Spec

- **Added `scripts/set-channel-default-voice.ts`**, not explicitly asked for by the task text, but
  necessary in practice — there is otherwise no way to set `Channel.defaultVoice` at all (no
  in-app settings UI exists yet), and this exact one-off-script convention is already established
  for the equivalent per-channel setting (`budgetOverrideUsd`). Reasonable and consistent, not a
  scope expansion.
- **Extended `scripts/dry-run.ts`'s `setup` command with an optional third arg** (a voice override),
  used for this task's own verification. A small, backward-compatible addition (existing two-arg
  calls are unaffected) to the shared test harness, not new production code.
- **`DEFAULT_TTS_VOICE` moved from an inline `client.ts` literal into `registry.ts`** — the task's D1
  text says `synthesizeSpeech` should default "to today's hardcoded voice when omitted," which was
  already true before this task (the inline `?? 'alloy'`); naming it as a real exported constant in
  `registry.ts` (alongside `TTS_VOICES`) isn't strictly required by the letter of D1, but keeps the
  "one source of truth for the default" property `resolveVoice`'s own postcondition depends on —
  without it, the fallback value would exist in two places (registry.ts's own resolution logic and
  client.ts's inline literal) that could silently drift apart.
- **A temporary debug log was added to and then removed from `client.ts`** during verification, to
  observe the real OpenAI request payload for the three live test runs. Not left in the codebase —
  this project has no existing precedent for logging outgoing provider requests (checked `llm/client.ts`
  and `publishing/youtube-client.ts` for one before adding it), so it stayed verification-only.

## Sign-Off

- Task Objective: Met — a channel has a real, persisted `defaultVoice`; a brief submission can
  override it per-run via a real, structured, validated `voice` field (never inferred from prose);
  a real run with an explicit override produces a real TTS render using that voice, confirmed
  against the actual OpenAI request payload three times over (override / channel default / hardcoded
  fallback); nothing regresses for the one existing channel, confirmed live, not just by code review.
- Schema Impact: One real migration — `Channel.defaultVoice`, `PipelineRun.creationOptions`. See
  `sprint2/SCHEMA.md`.
- Business Logic: `sprint2/BUSINESS_LOGIC.md` created, documenting the three-step resolution order
  as the general pattern for Task 2/3 to reuse; no transition-table changes.
- Tests: `npm run build/lint/typecheck/test` all clean (44 tests); D1/D2 additionally verified live
  against the real OpenAI API, three times, per the task's own success criteria.
- Ready for Integration: Yes.
