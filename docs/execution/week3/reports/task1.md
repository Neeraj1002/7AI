# Week 3 Task 1: Media Generation Capability Layer

**Date**: 2026-09-08
**Status**: Complete — real implementation built and its error boundary verified against a genuine OpenAI failure; **the "real smoke call succeeds" acceptance criterion is not closed** — no `OPENAI_API_KEY` exists in `.env.local` yet. Stub path (added per explicit founder instruction, mirroring Week 1's `INTAKE_STAGE_STUB`) fully verified.
**Files Created**: `studio/src/media/{types,registry,client,stub,index}.ts`
**Tests**: `npm run typecheck`/`build`/`lint` clean; import-boundary grep clean; stub path verified end-to-end; real client's error-mapping boundary verified against a genuine OpenAI 401

## What Was Done

Built `studio/src/media/`, replicating `studio/src/llm/`'s boundary pattern exactly as instructed:

- `types.ts`: this project's own `VoiceConfig`, `SynthesizeSpeechResult` (`audioPath`, `characterCount`, `costUsd`), `TranscriptSegment`/`TranscribeResult` (`segments`, `audioDurationSeconds`, `costUsd`) — never OpenAI's response shapes.
- `registry.ts`: `MEDIA_REGISTRY` maps `tts → { openai, tts-1-hd }` and `transcription → { openai, whisper-1}`, plus a pricing table (`TTS_PRICING`, `TRANSCRIPTION_PRICING`) sourced from OpenAI's current published rates (confirmed via web search: `tts-1-hd` $30/1M characters, `whisper-1` $0.006/minute).
- `client.ts`: the only file importing `openai`. `synthesizeSpeechViaProvider` calls `audio.speech.create`, writes the returned audio to `studio/data/media-tmp/{uuid}.mp3`, computes `costUsd` from character count. `transcribeViaProvider` calls `audio.transcriptions.create` with `response_format: 'verbose_json'` and `timestamp_granularities: ['word']` (confirmed via the SDK's own type definitions that `whisper-1` supports this — the exact word-level granularity Task 8 called for), maps `TranscriptionWord[]` to this project's `TranscriptSegment[]`. Errors map to `TransientStageError`/`NonTransientStageError` via `OpenAI.APIError`'s `.status`, same convention as `studio/src/llm/client.ts`.
- `stub.ts` (per explicit founder instruction this session, not in the task's original file list): `stubSynthesizeSpeech` generates a **real** short tone clip via FFmpeg (`sine` source, scaled to a plausible duration for the input text's length — ~12.5 chars/second, matching natural speech pace) rather than a silent or zero-byte file, plus a plausible fake `characterCount`/`costUsd`. It also writes a sidecar `{audioPath}.stub-text.txt` file carrying the original text, since the real `transcribe(audioPath)` contract only takes a path (matching OpenAI's real audio-in API shape) — the stub's `transcribe` recovers "what was said" from that sidecar to fabricate realistic word segments, rather than changing the real function's signature to smuggle text through it. `stubTranscribe` probes the placeholder audio's **actual** duration via `ffprobe` (not an assumed/estimated one) and spaces the recovered words evenly across it.
- `index.ts`: the public surface — `synthesizeSpeech`/`transcribe`, switching between the real and stub implementations based on `MEDIA_STUB=1`, mirroring `INTAKE_STAGE_STUB`'s pattern but applied at the layer's own boundary (not at each call site) — Task 2 onward call one API regardless of mode, never branching on the flag themselves.

## A real environment gap found and fixed: FFmpeg wasn't installed

Neither `ffmpeg` nor `ffprobe` were present on this machine — a hard requirement for the stub (tone generation, duration probing) and for Task 2/3's real assembly/analysis work regardless of the OpenAI key situation. Installed via `winget install Gyan.FFmpeg`. Since a freshly-installed winget package doesn't update `PATH` for already-running shells (confirmed: a fresh shell still couldn't find `ffmpeg` immediately after install), added `FFMPEG_PATH`/`FFPROBE_PATH` to `env.ts` (defaulting to plain `'ffmpeg'`/`'ffprobe'`, i.e. relying on `PATH`) and set them to the installed binaries' absolute paths in `.env.local`, so the app doesn't depend on this session's shell state. `.env.example` documents the pattern for a future machine where `PATH` just works.

## Test Results

```
npm run typecheck   -> clean
npm run build       -> clean
npm run lint        -> clean

Import-boundary grep (openai across studio/src):
  studio/src/media/client.ts:1: import OpenAI from 'openai';
  -> only client.ts, as required.

Stub path (MEDIA_STUB=1), real verification:
  synthesizeSpeech("The quick brown fox...", {}) -> real 46KB playable MP3 tone clip,
    characterCount=71, costUsd="0.002130" (plausible, matches tts-1-hd's real rate)
  transcribe(that path) -> 14 word segments (matches word count exactly), spaced
    evenly across the audio's real ffprobed duration (5.7s), first segment starts
    at 0ms, last ends at the clip's actual end — costUsd="0.000570" (matches
    whisper-1's real per-second rate)

Real client error-mapping boundary (no real key, syntactically-valid dummy key
  to force an actual round trip rather than the SDK's constructor-level guard
  on a truly empty key):
  A genuine 401 from OpenAI's servers -> mapped to NonTransientStageError, as expected
  for an auth failure. Transient path (rate limit/5xx) not independently exercised —
  same caveat as Week 2 Task 1's equivalent LLM-layer verification.
```

## What's still open (per explicit founder instruction — not marked closed)

**The "manual smoke call succeeds against the real OpenAI key" acceptance criterion is not closed.** No `OPENAI_API_KEY` exists in `.env.local`. What *is* verified: the real implementation is written correctly against the SDK's actual documented shapes (confirmed via the SDK's own type definitions, not guessed), and its error-translation boundary correctly handles a genuine API failure. What's *not* verified: that a real TTS call produces real audio, or that a real transcription call returns accurate word timings against real speech (as opposed to the stub's synthetic tone-and-sidecar approximation). Re-run once a key is added — the natural point to do this is alongside Task 2, since that's the first real consumer.

## Deviations from Spec

- `stub.ts` added, not in the task's original "Files to Create" list — per explicit founder instruction this session, mirroring Week 1's `INTAKE_STAGE_STUB` pattern so Tasks 2-5 can be built and tested end-to-end without a live OpenAI key.
- Installed FFmpeg system-wide (winget) and added `FFMPEG_PATH`/`FFPROBE_PATH` config — not anticipated by the task file, but a hard prerequisite discovered during this task's own work, not deferred.
- `env.ts` gained `OPENAI_API_KEY`, `MEDIA_STUB`, `FFMPEG_PATH`, `FFPROBE_PATH` — small, expected additions for this task's own needs.

## Sign-Off

- Task Objective: Met — `synthesizeSpeech`/`transcribe` are callable by Task 2 without either call site importing `openai` directly, in both real and stub modes
- Schema Impact: None (as specified)
- Business Logic: None (as specified — capability layer, not a pipeline stage)
- Tests: Passing — stub path fully verified; real path's error boundary verified; real successful call still pending an API key (tracked, not silently skipped)
- Ready for Integration: Yes — Task 2 can proceed against `MEDIA_STUB=1`
