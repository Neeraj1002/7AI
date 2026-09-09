# Week 3 Task 2: Video Generation Agent

**Date**: 2026-09-08
**Status**: Complete against `MEDIA_STUB=1` (per explicit founder instruction — no `OPENAI_API_KEY` yet). Real output verified: a genuine, playable MP4 produced and sent to the founder for visual confirmation.
**Files Created**: `studio/src/agents/video-generation/index.ts`
**Files Modified**: `schema.prisma` + migration (`usage_events` extension), `usage-event.types.ts`, `usage-event.repository.ts`, `state-machine.ts`, `scripts/dry-run.ts`
**Tests**: `npm run typecheck`/`build`/`lint` clean; real (stubbed-media) end-to-end video produced and verified via `ffprobe`; budget-gate path verified

## Schema: `usage_events` extended per `docs/execution/week3/SCHEMA.md`

Applied exactly as specified: `inputTokens`/`outputTokens` now nullable (LLM-shaped calls only), added `characterCount` (nullable int), `audioDurationSeconds` (nullable numeric), `metadata` (nullable JSONB). Migration confirmed idempotent.

## Path convention — stated plainly, per this task's own instruction

Rendered files land at **`studio/data/videos/{pipelineRunId}/{attemptNumber}.mp4`**, exactly as proposed in the task file. Caption files (`{attemptNumber}.srt`) sit alongside them in the same directory — not a separate location — since FFmpeg's `subtitles` filter is invoked with that directory as its working directory (see "A Windows-specific wrinkle" below).

## What Was Done

- **`agents/video-generation/index.ts`**: `generateVideo({ pipelineRunId, attemptNumber, scriptText, brandAssets, fixNotes })` — calls `studio/src/media/`'s `synthesizeSpeech` then `transcribe` (never the OpenAI SDK directly), builds a **word-level SRT** (one caption cue per word, matching the timestamps `transcribe` returns — a "flashing word" style, simplest possible burn-in that still uses word-level precision), and assembles via FFmpeg: a solid-color 1080×1920 background (no real stock-visual library configured yet — a legitimate simple default, not a shortcut around a real asset that was available), the synthesized audio, burned captions, and an optional watermark overlay if `Channel.brandAssets.watermarkUrl` points at an existing local file (untested this session — no channel in the dev DB has one configured).
- **One aggregated `UsageEvent` row per invocation**, per `SCHEMA.md`'s "one row per agent invocation, not three" design: `costUsd` is TTS + transcription summed (FFmpeg cost `$0`), with the full breakdown in `metadata`. **A design decision worth flagging**: the aggregated row's top-level `provider`/`model` columns can't cleanly represent two different (provider, model) pairs from one row, so `provider` is set to `'openai'` (true for both sub-calls today) and `model` is a composite string (`"tts-1-hd+whisper-1"`) — the individual models are also broken out in `metadata.ttsModel`/`metadata.transcriptionModel` for anything that needs them individually.
- **`state-machine.ts`'s `runVideoGenerationStage`**: same budget-gate-before-a-real-attempt-exists pattern as Script Generation (Week 2 Task 4) — a refusal is `skipped`, not `failed`, zero `UsageEvent` rows. Same per-attempt metering pattern (a retried attempt writes its own row, not just the final outcome). Reads the sanctioned script from Gate 1's completed output (not the original AI draft) and — forward-compatible with Tasks 3/4, which don't exist yet — checks for a prior failed `video_review`'s fix notes to forward into a regen attempt.
- **A Windows-specific wrinkle handled up front**: FFmpeg's `subtitles` filter famously mishandles Windows absolute paths (the drive-letter colon collides with the filter's own option-separator syntax). Avoided entirely by running FFmpeg with `cwd` set to the run's own output directory and referencing the caption file by its bare filename — no path escaping needed at all, not just escaped correctly.

## Real (stubbed-media) verification

Ran the full sequence (`intake → script_generation → script_review → gate1(approve) → video_generation`) via `scripts/dry-run.ts` with `MEDIA_STUB=1`. Result: a genuine 1.28MB MP4, confirmed via `ffprobe` to have a real H.264 video stream at exactly 1080×1920 and a real AAC audio stream, duration 46.3s matching the stub's character-count-derived estimate exactly. **Sent the actual video file to the founder** for direct visual/audio confirmation (captions, audio, brand overlay), per this task's own "actually watch the produced video" verification step — the placeholder voiceover is an audible tone (expected, `MEDIA_STUB=1`), not real speech, but the assembly itself (background, burned word-level captions, audio muxing) is genuine FFmpeg output, not a mock.

`UsageEvent` row confirmed correct: `characterCount: 579`, `audioDurationSeconds: "46.3"`, `costUsd: "0.022"` (= `0.017370` TTS + `0.004630` transcription, exactly), full `metadata` breakdown present.

**Budget-gate path**: exhausted the ceiling (`$0.001`, below prior spend), confirmed `video_generation` refused before any TTS call — stage `skipped`, run `needs_attention`, zero `UsageEvent` rows — then restored to `$2.00`.

## What's still open (per explicit founder instruction — not marked closed)

Everything above ran against `MEDIA_STUB=1`. No real OpenAI TTS/transcription call has been made through this agent — the placeholder audio is a synthesized tone, not real speech, and the burned captions are fabricated from a text sidecar, not a genuine ASR pass. Re-run the same `scripts/dry-run.ts` sequence without `MEDIA_STUB=1` once a real `OPENAI_API_KEY` exists, and actually listen to the result.

## Deviations from Spec

- Watermark overlay code path exists and is wired into the FFmpeg filter graph, but untested — no channel in the dev database has `brandAssets.watermarkUrl` set to a real local file. Flagging rather than silently claiming full coverage.
- The aggregated row's `provider`/`model` composite-string convention (see above) is a judgment call not explicitly specified by `SCHEMA.md` — flagged for confirmation the same way `AgentQuota`'s ceiling and the file-path convention were in prior weeks.

## Sign-Off

- Task Objective: Met (against stubbed media — see "What's still open")
- Schema Impact: `usage_events` extended exactly per `docs/execution/week3/SCHEMA.md`; migration idempotent
- Business Logic: Matches `docs/execution/week3/BUSINESS_LOGIC.md` Sections 1-2 — budget-gate branch and `video_generation → video_review` transition both verified live
- Tests: Passing (stubbed media); real OpenAI call still pending an API key (tracked, not silently skipped)
- Ready for Integration: Yes — Task 3 (Video Intelligence) consumes this stage's output directly
