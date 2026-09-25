# Sprint 2 Task 3: Royalty-Free Audio Layer + Licensing Risk Check

**Date**: 2026-09-15
**Status**: Complete
**Files Created**: 8 (`studio/src/audio-bed/{types,manifest,client,index,client.test}.ts`, `studio/scripts/generate-audio-beds.ts`, `studio/data/audio-beds/{upbeat,calm,mysterious,inspirational,tense}.mp3`)
**Files Modified**: 6
**Tests**: All Passing (`npm run build && npm run lint && npm run typecheck && npm test` — 60 tests,
all clean)

## What Was Done

### F1 — `audioLayer` as a real production-plan field

New `audio-bed/` module — deliberately just `manifest.ts` + `client.ts` (+ `types.ts`/`index.ts` for
the boundary), not the full `registry.ts`/`stub.ts` split `ai-visuals`/`stock-footage` use, since
there's no external API here to stub or resolve a provider for; the "curated local library" *is*
the whole implementation:

- `manifest.ts` lists 5 tracks, one per mood tag (`upbeat`, `calm`, `mysterious`, `inspirational`,
  `tense`), each with a real `license: 'CC0'`.
- The 5 tracks (`data/audio-beds/*.mp3`, 24s each) are **not sourced from any external rights
  holder** — every one was synthesized locally with FFmpeg's own signal generators (layered `sine`
  tones, `amix`, `tremolo` for a slow wobble) via a new `scripts/generate-audio-beds.ts`. This makes
  `license: 'CC0'` a real, accurate, defensible claim this project can make outright, not a guess or
  a placeholder pending real sourcing.
- `.gitignore` gained a carve-out (`**/data/*` + `!**/data/audio-beds/`) so these curated assets are
  actually checked into the repo, unlike every other `data/` subdirectory (runtime-generated scratch,
  never committed). Finding the correct gitignore pattern took two real iterations — see Deviations.

`ProductionPlanSchema` gained `audioLayer: z.enum([...MOOD_TAGS, 'none'])`. The planning prompt
steers the LLM toward a genuine mood match or `'none'` (framed explicitly as "a fully valid,
equally-good choice, not a fallback for indecision"), with the same deterministic override
enforcement Task 2 established for `visualSource` (lighter here — no compliance flag rides on this
field, but the resolution-order guarantee stays consistent). `generateVideo` picks a track via
`pickAudioBedTrack` when `audioLayer !== 'none'`, adds it as a looped audio input, and mixes it
under the TTS track via `amix=inputs=2:duration=first:weights='1 0.18'` — the bed capped at 0.18
relative to the voiceover's implicit 1, `duration=first` (the TTS input, listed first) so the mix
never runs longer than the real narration regardless of how long the looped bed track plays.

### F2 — Licensing / Content-ID risk check

`audio-bed/client.ts`'s `pickTrackByMood` (pure, manifest-injectable) refuses a track missing
`license` — throws `NonTransientStageError` before any FFmpeg work starts. Explicitly, and stated
plainly per the task's own instruction: this is a **manifest-integrity check** (does the entry this
project curated carry the field it's required to have), not a live Content-ID API call — no such
public API exists to call synchronously at generation time. `KNOWN_ISSUES_AND_BLOCKERS.md` §6 now
carries the real, still-open version of this idea for whenever a non-curated source is added.

## Verification — real, live, per the task's own bar

1. **A mood-matched bed genuinely mixes into the audio, not just theoretically.** A real
   `video_generation` run (`audioLayer: 'calm'`, stub TTS/footage to keep it fast — the amix logic
   itself is provider-agnostic) rendered in 44 seconds. Verified via spectral band-pass analysis of
   the **actual rendered output file** (not the ffmpeg command, not the code): the bed's own
   frequency band (~207-237Hz) showed real, non-silent energy (**-49.9dB mean**, -42.8dB max) —
   genuinely present — and distinctly *quieter* than the voiceover's own band (~425-455Hz,
   **-43.0dB mean**), confirming both that the mix is real and that the weighting (0.18 vs. 1) is
   actually working, not equal-volume or silently dropped.
2. **A deliberately incomplete manifest entry is refused at pick time.** `client.test.ts` exercises
   `pickTrackByMood` against a synthetic fixture manifest entry with no `license` field — throws
   with a clear message, before touching any file. (The real, shipped manifest never has a broken
   entry — a separate test asserts every real track carries a license, so this isn't a hypothetical
   gap in the actual library.)
3. **`audioLayer: 'none'` remains fully valid.** A second real render (same script,
   `audioLayer: 'none'`) completed in 56 seconds with a normal, valid single-audio-stream output —
   no crash, no special-casing needed downstream, no `-map [outa]`/amix path touched at all (the
   original `-map 1:a` direct-passthrough is unchanged when there's no bed).

## Files Created/Modified

- Created:
  - `studio/src/audio-bed/types.ts`, `manifest.ts`, `client.ts`, `index.ts`
  - `studio/src/audio-bed/client.test.ts`
  - `studio/scripts/generate-audio-beds.ts`
  - `studio/data/audio-beds/{upbeat,calm,mysterious,inspirational,tense}.mp3`
- Modified:
  - `.gitignore` — carve-out for `data/audio-beds/`
  - `studio/src/agents/video-generation/plan.ts` — `AUDIO_LAYERS`/`audioLayer`, prompt steering, override enforcement
  - `studio/src/agents/video-generation/index.ts` — the `amix` audio-bed branch, metadata
  - `studio/src/run-pipeline/state-machine.ts` — `audioLayerOverride` resolution (narrowed, not cast)
  - `studio/src/api/routers/runs.ts` — `audioLayer` input field
  - `studio/scripts/dry-run.ts` — `setup`'s optional 5th arg, `forcedPlan`'s `audioLayer` field

## Schema Changes Applied

None — see `sprint2/SCHEMA.md`.

## Test Results

```
npm run build       -> clean
npm run lint         -> clean
npm run typecheck    -> clean
npm test             -> 10 test files passed (10), 60 tests passed (60)
```

## Deviations from Spec

- **The `.gitignore` carve-out took two real iterations to get right**, both genuine gitignore
  footguns worth recording: (1) a bare `data/` pattern (no "middle" slash) fully excludes the
  directory from traversal, so a subsequent `!data/audio-beds/` negation is never even evaluated —
  needed `data/*` instead to keep `data/` itself traversable while still excluding its other
  children; (2) `data/*` (a slash in the *middle* of the pattern) is anchored to the repo root, so
  it only ever matched a root-level `data/` that doesn't exist in this repo (the real one is
  `studio/data/`) — needed `**/data/*` to restore "match at any depth." Diagnosed by testing
  `git check-ignore -v` against directories and files directly rather than assuming the pattern was
  correct, the same "verify against the real, current file" discipline this project's documentation
  work already holds itself to.
- **Verification used stub TTS/stock-footage** (`MEDIA_STUB=1`/`STOCK_FOOTAGE_STUB=1`) for both real
  test renders, deliberately — the audio-mixing logic being verified doesn't depend on whether the
  narration is real speech or a stub tone, and Task 2's own verification already surfaced a real,
  unrelated Pexels-network slowdown, so avoiding another live external dependency here kept this
  task's own verification fast and focused on what it was actually testing.

## Sign-Off

- Task Objective: Met — a real music/sound bed mixes into Video Generation's output at a real,
  low, measured weight; a licensing gate refuses an incomplete manifest entry at pick time, verified
  against a synthetic fixture, not a hypothetical; `'none'` renders cleanly with no penalty.
- Schema Impact: None — see `sprint2/SCHEMA.md`.
- Business Logic: `sprint2/BUSINESS_LOGIC.md` updated with the resolution order, the license-gate
  failure mode, and the real spectral-analysis verification.
- Tests: Passing (60/60), plus real live verification for every F1/F2 item above.
- Ready for Integration: Yes.
