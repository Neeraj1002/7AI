# Sprint 2 Task 1: Voice Selection & Structured Creation Choices

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.**

**Objective**: Give a per-brief creator a real choice of TTS voice, and replace "creation choices
inferred from free-text prose" with explicit structured fields — the foundation Task 2 (visual
style) and Task 3 (audio layer) both build on.
**Duration**: 4-6 hours
**Depends On**: Sprint 1 (Week 1-5) — closed. Nothing else.
**Owning Component**: API layer (`api/routers/runs.ts`), Orchestrator (`run-pipeline/parse-brief.ts`,
`state-machine.ts`), Video Generation (`agents/video-generation/plan.ts`), `media/registry.ts`,
Shared Schema.
**Success Criteria**: (1) A channel has a real, persisted default voice. (2) A brief submission can
override it per-run with an explicit `voice` field — never inferred from prose. (3) A real run with
an explicit voice override produces a TTS render using that voice, confirmed by inspecting the
actual OpenAI TTS request. (4) A run with no override uses the channel's default, and a channel with
no default uses today's hardcoded fallback — nothing regresses for every existing channel.

## Task Requirement

`MVP_PART2_MULTI_USER_AND_FLEXIBLE_CREATION.md` Section 2 splits "more creation options" into two
different kinds of request: voice is a parameter within the pipeline that already exists (TTS
already happens — this just lets a choice through instead of always defaulting); visual style is a
different content-generation path entirely (Task 2). This task is the first half, plus the
structural point Section 2 makes explicitly: these should be explicit fields a user picks when
submitting a brief, not something `parse-brief.ts`'s LLM call infers from free text. That matters
beyond just voice — it's the plumbing Task 2's `visualSource` field and Task 3's `audioLayer` field
both reuse, worth getting right once here rather than three times.

### D1 — A real `voice` concept, not "whatever `media/registry.ts` happens to resolve"
**Where**: `media/registry.ts`'s `resolveMediaPurpose('tts')` today resolves one hardcoded OpenAI
TTS voice for the `tts` purpose — confirmed by `video-generation/index.ts`'s
`synthesizeSpeech(params.scriptText, {})`, which passes no voice option at all.
**Fix**: `media/registry.ts` gains a `TTS_VOICES` map — start with whatever preset voices OpenAI's
TTS endpoint currently offers (check the installed `openai` SDK's speech-create voice type rather
than hardcoding a guessed list), each with a short human-readable label for the app to show.
`synthesizeSpeech` gains an optional `voice` parameter, defaulting to today's hardcoded voice when
omitted, so every existing call site that doesn't pass one is unaffected.

### D2 — Per-channel default, per-brief override
**Schema**: `Channel.defaultVoice String? @db.VarChar(50)` (nullable — `null` means "use today's
hardcoded fallback," same "existing rows unaffected" posture Week 5 Task 4's `budgetOverrideUsd`
used). A real Prisma migration, no backfill needed.

**Where a per-brief override lives** — the structural decision this task actually turns on: not a
new free-text instruction for `parse-brief.ts` to guess at. Add `PipelineRun.creationOptions Json?`
(nullable, next to `intakeParsed` but a distinct column — `intakeParsed` is what the LLM extracted
from prose, `creationOptions` is what the user explicitly picked; keeping them separate is the
point, not an accident). Shape: `{ voice?: string, visualSource?: string, audioLayer?: string }` —
this task only ever sets `voice`, but the shape is written to hold Task 2/3's fields too so those
tasks extend an existing object instead of adding parallel columns.

**API**: `api/routers/runs.ts`'s brief-submission input gains an optional `voice` field (validated
against `TTS_VOICES`'s known keys), stored straight into the new `creationOptions` column — never
passed through `parse-brief.ts`'s LLM call.

**Resolution order at generation time** (`state-machine.ts`'s `runVideoGenerationStage`, or wherever
it assembles `generateVideo`'s params): explicit `PipelineRun.creationOptions.voice` → else the
run's `Channel.defaultVoice` → else `media/registry.ts`'s existing hardcoded fallback. Thread the
resolved voice into `generateVideo`'s params and on into `synthesizeSpeech`.

**Verify**: (1) a fixture run with `creationOptions.voice` set produces a `synthesizeSpeech` call
carrying that exact voice — confirm by inspecting the real request payload (or a mocked client call,
same rigor as Week 2's LLM-layer tests), not just by reading the code. (2) A fixture run with no
override on a channel with `defaultVoice` set resolves to the channel default. (3) A fixture run
with neither resolves to today's unchanged hardcoded fallback — the regression check that matters
most, since every existing channel has `defaultVoice = null`.

## Schema Impact

### Tables Modified
- `channels` — new `defaultVoice` column (nullable, no backfill).
- `pipeline_runs` — new `creationOptions` Json column (nullable, no backfill).

### Migration File
A real Prisma migration (`prisma migrate dev`) — two additive, nullable columns.

## Business Logic / State Transition

### What this task implements
The three-step voice-resolution order in D2 — this is the pattern Task 2 (`visualSource`) and Task 3
(`audioLayer`) extend verbatim, so document it once here as the sprint's general "creation option
resolution" rule, not just a voice-specific note.

### Preconditions
A `PipelineRun` row exists with `creationOptions` set or unset before `runVideoGenerationStage` runs.

### Postconditions
`generateVideo` always receives a concrete, resolved voice — never an unresolved override or a null.

### Failure Modes & Handling
An override naming an unknown voice key fails at API-input validation (`runs.ts`), not deep in the
pipeline — the same "reject bad structured input at the edge" posture the rest of the API layer
already uses.

## Testing
```bash
npm run build && npm run lint && npm run typecheck && npm test
```
Plus D1/D2's real fixture-run verification above.

### Documentation reconciliation
- `docs/execution/sprint2/SCHEMA.md` (create — first task of the sprint): `Channel.defaultVoice`,
  `PipelineRun.creationOptions`, the migration.
- `docs/execution/sprint2/BUSINESS_LOGIC.md` (create): the three-step voice-resolution order above.
- `docs/execution/sprint2/STATUS.md` (create): Task 1's row.
- `docs/design_doc/MVP_PART2_MULTI_USER_AND_FLEXIBLE_CREATION.md`: note Section 2's voice item as
  picked up by this task (the doc itself stays a capture doc, not a tracker, but worth a pointer so
  a future reader doesn't re-scope it from scratch).

## Report Template
`execution/sprint2/reports/task1.md`, standard shape — see `TASK_TEMPLATE.md`.
