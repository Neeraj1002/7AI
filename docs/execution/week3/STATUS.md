# Week 3 Status: Video Side

**Week status**: Task 1 complete. Tasks 2-5 in progress, built and tested against `MEDIA_STUB=1` per explicit founder instruction (no `OPENAI_API_KEY` yet).
**Last updated**: 2026-09-08 (after Task 1)

| Task | Name | Status | Owner | Notes |
|---|---|---|---|---|
| 1 | Media Generation Capability Layer | Done — action needed | **Founder (OpenAI key)** | Real OpenAI implementation built (`tts-1-hd` + `whisper-1`, word-level timestamps). Stub path added (`MEDIA_STUB=1`) per explicit instruction, fully verified: real placeholder audio, plausible costs, word segments spaced over the audio's actual duration. Real client's error boundary verified against a genuine OpenAI 401. The "real smoke call succeeds" criterion is **not** closed — needs a real key. Also: FFmpeg wasn't installed on this machine, installed via winget, `FFMPEG_PATH`/`FFPROBE_PATH` added to `.env.local` since a fresh install doesn't update `PATH` for already-running shells. See `reports/task1.md`. |

## Full detail
Per-task reports: `reports/task1.md` onward. Full narrative (once written): `reports/week3-summary.md`.
