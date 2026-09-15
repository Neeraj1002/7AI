# Sprint 2 Task 3: Royalty-Free Audio Layer + Licensing Risk Check

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.**

**Objective**: Add a music/sound bed to Video Generation's output, plus a lightweight licensing
check gate before anything newly-sourced reaches a monetized upload.
**Duration**: 4-6 hours
**Depends On**: Task 1 (`creationOptions`/production-plan pattern). Task 2 is not a functional
dependency, but this task is sequenced after it so both aren't editing `generateVideo`'s filter
graph at the same time.
**Owning Component**: new `audio-bed/` module, Video Generation, Shared Schema (none).
**Success Criteria**: (1) A run with a mood-matched bed produces a render whose audio genuinely
mixes voiceover and bed. (2) A track missing license metadata is refused at pick time, never
silently used. (3) `audioLayer: 'none'` remains a fully valid, unpenalized choice.

## Task Requirement

`MVP_PART3_CONTENT_QUALITY_AND_GROWTH_LOOP.md` §1: no music/sound bed anywhere in Video Generation
today — confirmed reading `video-generation/index.ts`'s FFmpeg args, which mux only the TTS track
(`-map 1:a`) over the visual stream. Add an `audioLayer` concept "right alongside the second
visual-source backend... same production-planning step, same `ProductionPlan` object" — this task
follows that framing directly.

### F1 — `audioLayer` as a real production-plan field
Fix, deliberately the smallest real version — a curated local library, not a paid API: new
`audio-bed/` module: a `manifest.ts` listing a handful of royalty-free tracks checked into the repo
under `data/audio-beds/`, tagged by mood, plus a trivial `client.ts` that picks one by mood match —
no external API, no per-run cost, avoiding exactly the kind of new-vendor decision Task 2's
`ai-visuals` provider choice is already carrying for this sprint. `ProductionPlanSchema` gains
`audioLayer: z.enum([...moodTags, 'none'])`, with the planning LLM steered toward whichever mood tag
best matches the script — `'none'` is a valid, sensible choice (a quiet fact-explainer Short may
genuinely want no bed), never treated as an incomplete plan. `generateVideo`'s FFmpeg filter graph
gains a second audio input (the picked track, looped/trimmed to the TTS duration) mixed under the
voiceover — `amix` with an explicit low weight on the bed input, not equal-weighted, so narration
stays intelligible — only when `audioLayer !== 'none'`.

### F2 — Licensing / Content-ID risk check
**Where**: nothing today checks that anything pulled into a render is actually licensed for
monetized use — not urgent with zero non-Pexels sources, real the moment F1 (or Task 2's
`ai-visuals`) adds one. **Fix**, deliberately lightweight per the design doc's own framing ("a
lightweight check"): every `audio-bed/manifest.ts` entry carries an explicit `license` field (e.g.
`'CC0'` / `'royalty-free-cleared'`), filled in by hand when a track is added to the library.
`client.ts` refuses to pick a track missing this field — throws a `NonTransientStageError`, the same
pattern the rest of this pipeline already uses for a bad/incomplete input — rather than silently
shipping an unlicensed asset. Explicit scope boundary, state this in the report: this is a
manifest-integrity check, not a live Content-ID API call — no such public API exists to call
synchronously at generation time. Don't let the report imply more than this actually covers.

## Schema Impact
No schema changes this task — `audioLayer` is stored inside the existing `PipelineStage.output` Json
and `PipelineRun.creationOptions` Json (Task 1's column).

## Business Logic / State Transition

### What this task implements
`audioLayer` resolution follows Task 1's same three-step order (explicit override → channel
default, if one is ever added later → planning-LLM choice), and F2's license gate runs at
track-pick time, before any FFmpeg work starts — a bad manifest entry fails fast, not mid-render.

### Failure Modes & Handling
A manifest entry missing `license` is a `NonTransientStageError` at pick time — never auto-retried,
surfaces to `needs_attention` like any other non-transient input problem.

## Testing
```bash
npm run build && npm run lint && npm run typecheck && npm test
```
Plus: a real run with a mood-matched track produces a render whose audio track audibly carries both
voiceover and bed (spot-check via `ffprobe`'s stream/duration output, same technique already used
elsewhere in this project); a deliberately incomplete manifest entry (missing `license`) is refused
at pick time.

### Documentation reconciliation
- `docs/execution/sprint2/SCHEMA.md` ("no schema changes this task"), `BUSINESS_LOGIC.md`
  (`audioLayer` resolution + the license gate), `STATUS.md`.
- `docs/execution/KNOWN_ISSUES_AND_BLOCKERS.md` §6 ("Not yet built") gains a line for a real
  Content-ID-risk API check, if/when a non-curated audio or visual source is ever added.

## Report Template
`execution/sprint2/reports/task3.md`, standard shape.
