# Week 3 Status: Video Side

**Week status**: Tasks 1-3 complete. Task 3 (Video Intelligence) needed no media stubbing — it only calls the already-real `studio/src/llm/` — and its real multimodal check surfaced a genuine finding: Task 2's flashing-word captions make midpoint frame extraction show partial words, not representative content. The regen circuit breaker tripped for real at the proposed cap of 3 total attempts.
**Last updated**: 2026-09-08 (after Task 3)

| Task | Name | Status | Owner | Notes |
|---|---|---|---|---|
| 1 | Media Generation Capability Layer | Done — action needed | **Founder (OpenAI key)** | Real OpenAI implementation built (`tts-1-hd` + `whisper-1`, word-level timestamps). Stub path added (`MEDIA_STUB=1`) per explicit instruction, fully verified: real placeholder audio, plausible costs, word segments spaced over the audio's actual duration. Real client's error boundary verified against a genuine OpenAI 401. The "real smoke call succeeds" criterion is **not** closed — needs a real key. Also: FFmpeg wasn't installed on this machine, installed via winget, `FFMPEG_PATH`/`FFPROBE_PATH` added to `.env.local` since a fresh install doesn't update `PATH` for already-running shells. See `reports/task1.md`. |
| 2 | Video Generation Agent | Done — action needed | **Founder (OpenAI key)** | `usage_events` extended per `SCHEMA.md`. Real end-to-end video produced (stubbed audio): 1080×1920, real H.264+AAC streams, burned word-level captions, correct aggregated `UsageEvent` (one row, TTS+transcription summed). Sent to founder for visual confirmation. Budget-gate path verified. Real OpenAI voiceover/transcription still pending a key. See `reports/task2.md`. |
| 3 | Video Intelligence Agent (Own-Draft) | Done | Claude Code | `studio/src/llm/` extended with a multimodal attachment field (no second layer built). Deterministic checks verified to block bad video before any LLM cost; a real multimodal Claude Haiku pass correctly caught a genuine defect (flashing-caption frame extraction); regen circuit breaker tripped for real at exactly `MAX_VIDEO_REGEN_ATTEMPTS=2` (3 total attempts). No `OPENAI_API_KEY` needed for this task. See `reports/task3.md`. |

## Full detail
Per-task reports: `reports/task1.md` onward. Full narrative (once written): `reports/week3-summary.md`.
