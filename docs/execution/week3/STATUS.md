# Week 3 Status: Video Side

**Week status**: Tasks 1-2 complete against `MEDIA_STUB=1` (per explicit founder instruction, no `OPENAI_API_KEY` yet). A real (stubbed-audio) video was produced and sent to the founder for visual confirmation.
**Last updated**: 2026-09-08 (after Task 2)

| Task | Name | Status | Owner | Notes |
|---|---|---|---|---|
| 1 | Media Generation Capability Layer | Done — action needed | **Founder (OpenAI key)** | Real OpenAI implementation built (`tts-1-hd` + `whisper-1`, word-level timestamps). Stub path added (`MEDIA_STUB=1`) per explicit instruction, fully verified: real placeholder audio, plausible costs, word segments spaced over the audio's actual duration. Real client's error boundary verified against a genuine OpenAI 401. The "real smoke call succeeds" criterion is **not** closed — needs a real key. Also: FFmpeg wasn't installed on this machine, installed via winget, `FFMPEG_PATH`/`FFPROBE_PATH` added to `.env.local` since a fresh install doesn't update `PATH` for already-running shells. See `reports/task1.md`. |
| 2 | Video Generation Agent | Done — action needed | **Founder (OpenAI key)** | `usage_events` extended per `SCHEMA.md`. Real end-to-end video produced (stubbed audio): 1080×1920, real H.264+AAC streams, burned word-level captions, correct aggregated `UsageEvent` (one row, TTS+transcription summed). Sent to founder for visual confirmation. Budget-gate path verified. Real OpenAI voiceover/transcription still pending a key. See `reports/task2.md`. |

## Full detail
Per-task reports: `reports/task1.md` onward. Full narrative (once written): `reports/week3-summary.md`.
