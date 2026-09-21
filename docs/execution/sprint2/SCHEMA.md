# Sprint 2 Schema Delta

**Status**: One real migration (Task 1 — `Channel.defaultVoice`, `PipelineRun.creationOptions`),
first schema change of Sprint 2. Task 2 introduces no schema changes at all — `visualSource` lives
entirely inside existing Json columns (Task 1's `creationOptions`, and `PipelineStage.output`, which
already carried the video-generation stage's `plan`). Incremental against `AGENT_FLEET_DESIGN.md`
Section 6's cumulative reference and `week5/SCHEMA.md`'s state at Sprint 1's close, same convention
every prior week/sprint's `SCHEMA.md` uses.

## Task 1 — `Channel.defaultVoice`, `PipelineRun.creationOptions` (D1/D2)

A real Prisma migration (`prisma migrate dev --name sprint2_voice_selection`), two additive,
nullable columns:

```prisma
model Channel {
  // ...existing fields...
  defaultVoice String? @db.VarChar(50)
  // null = use media/registry.ts's hardcoded DEFAULT_TTS_VOICE fallback;
  // a set value (one of TTS_VOICES's keys) is this channel's own default.
}

model PipelineRun {
  // ...existing fields...
  creationOptions Json?
  // Deliberately a separate column from intakeParsed, not a merge into it:
  // intakeParsed is what parse-brief.ts's LLM call *inferred* from
  // free-text prose; creationOptions is what the user *explicitly picked*
  // via structured API fields. Shape: { voice?, visualSource?, audioLayer? }.
}
```

```sql
ALTER TABLE "channels" ADD COLUMN "defaultVoice" VARCHAR(50);
ALTER TABLE "pipeline_runs" ADD COLUMN "creationOptions" JSONB;
```

No backfill for either — every existing `Channel` row is `defaultVoice = null` (today's hardcoded
fallback, unchanged) and every existing `PipelineRun` row is `creationOptions = null` (no creation
options were ever recorded before this task, correctly represented as "none," not an empty object).

`Channel` (domain type, `types/channel.types.ts`) gained `defaultVoice: string | null`.
`PipelineRun` (domain type, `types/pipeline.types.ts`) gained `creationOptions: CreationOptions |
null`, where:

```typescript
export const CreationOptionsSchema = z.object({
  voice: z.string().optional(),
  visualSource: z.string().optional(),
  audioLayer: z.string().optional(),
});
export type CreationOptions = z.infer<typeof CreationOptionsSchema>;
```

`voice` is the only field this task ever sets — `visualSource`/`audioLayer` exist in the shape now
so Sprint 2 Task 2/3 extend this one object instead of adding parallel `pipeline_runs` columns each
time. `CreatePipelineRunInput` (used by `createRun`/the API layer) gained an optional
`creationOptions` field, persisted straight into the new column at creation time — never mutated
afterward, and never passed through `parse-brief.ts`'s LLM call.

### `media/registry.ts` — `TTS_VOICES` (not a DB table, but the source of truth for valid voice keys)

```typescript
export const TTS_VOICES = {
  alloy: { label: 'Alloy' }, ash: { label: 'Ash' }, ballad: { label: 'Ballad' },
  coral: { label: 'Coral' }, echo: { label: 'Echo' }, fable: { label: 'Fable' },
  onyx: { label: 'Onyx' }, nova: { label: 'Nova' }, sage: { label: 'Sage' },
  shimmer: { label: 'Shimmer' }, verse: { label: 'Verse' }, marin: { label: 'Marin' },
  cedar: { label: 'Cedar' },
} as const;
export const DEFAULT_TTS_VOICE: TtsVoice = 'alloy'; // today's previously-hardcoded value, named
```

Sourced from the installed `openai` SDK's `SpeechCreateParams.voice` doc comment
(`node_modules/openai/resources/audio/speech.d.ts`), not a guessed list — the 13 preset voices
OpenAI's TTS endpoint documents as of this task. Both `Channel.defaultVoice` and
`PipelineRun.creationOptions.voice` are expected to hold one of these keys — enforced at the API
edge (`runs.ts`'s `z.enum(TTS_VOICE_KEYS)`) and at the one write path for the channel column
(`scripts/set-channel-default-voice.ts`), not by a DB `CHECK` constraint (same posture every other
free-text-ish nullable column in this schema already has, e.g. `postingCadence`).

## Task 2 — No schema changes (E2/E4)

`ProductionPlanSchema` (`agents/video-generation/plan.ts`, not a DB table) gained
`visualSource: z.enum(['stock-footage', 'ai-stills'])` and `stillScenePrompts: z.array(z.string().min(1)).optional()`
— stored exactly where the rest of the plan already lives: `PipelineStage.output` (the
`video_generation` stage's existing Json column). `Gate2`/`Publishing`'s new
`containsSyntheticMedia: boolean` (E4) is likewise stored in the `publishing` stage's existing
`output` Json — no migration for either. `api/routers/runs.ts`'s brief-submission input gained an
optional `visualSource` field, validated against `plan.ts`'s own `VISUAL_SOURCES` and stored into
Task 1's `creationOptions` column, the exact "extend an existing object" pattern Task 1's own
`SCHEMA.md` note anticipated.

## Task 3 — No schema changes (F1/F2)

`ProductionPlanSchema` gained `audioLayer: z.enum([...MOOD_TAGS, 'none'])` — stored the same place
`visualSource` is (`PipelineStage.output`'s existing `plan` field), and `creationOptions`'s
`audioLayer` field the same place `voice`/`visualSource` are (Task 1's `creationOptions` column) —
no migration. The curated audio-bed library itself
(`studio/src/audio-bed/manifest.ts` + `data/audio-beds/*.mp3`) is a checked-in local asset set, not
a database concept at all — a deliberate carve-out in `.gitignore` (`!**/data/audio-beds/`) is the
only "schema-adjacent" change this task makes, and it's a repo-config change, not a Postgres one.

## Task 4 — `PerformanceSnapshot.retentionCurve` (G2), a real migration

A real Prisma migration (`prisma migrate dev --name sprint2_retention_curve`), one additive,
nullable column:

```prisma
model PerformanceSnapshot {
  // ...existing fields...
  retentionCurve Json?
  // Array of { elapsedVideoTimeRatio: number, audienceWatchRatio: number }
  // points — the real dimension/metric pair the YouTube Analytics API's
  // audience-retention report returns. null until G1's founder action(s)
  // close (see KNOWN_ISSUES_AND_BLOCKERS.md §1) or YOUTUBE_ANALYTICS_STUB=1.
}
```

```sql
ALTER TABLE "performance_snapshots" ADD COLUMN "retentionCurve" JSONB;
```

No backfill — every existing row is correctly `null` (recorded before this field existed, and no
way to reconstruct a historical retention curve after the fact — exactly the "cheap now, expensive
to reconstruct later" reasoning `MVP_PART3_CONTENT_QUALITY_AND_GROWTH_LOOP.md` §2 cites for adding
this capture *now*, even though nothing reads it yet).

`PerformanceSnapshot` (domain type, `types/performance-snapshot.types.ts`) gained
`retentionCurve: RetentionCurvePoint[] | null`, where:

```typescript
export type RetentionCurvePoint = { elapsedVideoTimeRatio: number; audienceWatchRatio: number };
```

`CreatePerformanceSnapshotInput` gained an optional `retentionCurve` field, threaded through from
`recordSnapshot` — see `BUSINESS_LOGIC.md` for the real fetch-and-fail-safe logic around it.

## Task 4 — No schema changes (G3)

`ScriptReviewOutputSchema` (`agents/script-review/index.ts`, not a DB table) gained
`hookScore: z.number().min(0).max(10)` and `hookNotes: z.string().min(1)` — stored exactly where the
rest of Script Review's output already lives: `PipelineStage.output` and the `ReviewLog.rationale`
text Gate 1 reads (Week 2 Task 5's existing convention, same pattern Week 5 Task 4's C3
`factualConcerns` used). No migration.

## Task 5 — No schema changes (H1/H2)

`PublishingMetadataSchema` (`agents/publishing/types.ts`, not a DB table) gained
`coverFrameTimestampRatio: z.number().min(0).max(1)` — stored exactly where the rest of Publishing's
metadata already lives: `PipelineStage.output`'s existing `metadata` field (the `publishing` stage's
existing Json column). The stage output also gained a plain `coverFrameSet: boolean` audit field in
the same Json, no migration. H2 (A/B testing) was investigated and closed without writing any code
against it — see `docs/execution/KNOWN_ISSUES_AND_BLOCKERS.md` §4 — so there is no schema surface
for it at all.

## Task 6 — `Tenant.lastFounderDigestSentAt` (I1), a real migration

A real Prisma migration (`prisma migrate dev --name sprint2_founder_digest`), one additive, nullable
column: `Tenant.lastFounderDigestSentAt DateTime?`. `null` for every existing tenant (no digest has
ever been sent). Deliberately persisted rather than judging "is a digest due" purely from process
uptime — this dev process has restarted far more often than once a day throughout this project, so a
plain `setInterval(fn, 24h)` would likely never actually fire in practice; a real, durable timestamp
survives a restart correctly. See `run-pipeline/founder-digest.ts`.

I2 (post-hoc tagging) needed **no schema change at all** — it writes a new `ReviewLog` row via the
existing `insertReviewLog` repository function, the same table Gate 1/Gate 2 verdicts already use,
distinguished only by a new `agent: 'founder-post-hoc'` value (every column ReviewLog already has —
`agent`/`verdict`/`rationale`, with `stageId` already nullable — was enough).

## Reference
- `docs/execution/week5/SCHEMA.md` — the schema this sprint's first task extends
- `AGENT_FLEET_DESIGN.md` Section 6 — the cumulative schema reference
