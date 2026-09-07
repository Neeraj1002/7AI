# Week 1 Status: Foundation

**Week status**: Core deliverables complete. 2 items pending founder action. 1 item (real-LLM verification) deliberately deferred, tracked separately — not blocking.
**Last updated**: 2026-09-07 (after Task 8 + repo restructure)

| Task | Name | Status | Owner | Notes |
|---|---|---|---|---|
| 1 | Repo Scaffolding | Done | Claude Code | TypeScript + Prisma + Postgres, fresh repo, no code reused from `yt_shorts`. `npm run build`/`lint` clean. |
| 2 | Postgres Setup | Done | Claude Code | Dedicated `sevenai_app` role + `sevenai_dev` database. Two `.env` files (CLI + app) hold `DATABASE_URL` — minor duplication, not fixed silently, see `reports/task2.md`. |
| 3 | Foundation Schema Migration | Done | Claude Code | All 5 tables (`tenants`, `channels`, `pipeline_runs`, `pipeline_stages`, `review_logs`) + 5 `CHECK` constraints migrated per `SCHEMA.md`. Migration confirmed idempotent. |
| 4 | Orchestrator State Machine | Done | Claude Code | Resumability proven with a real kill-and-restart test — no duplicate runs, no lost work. Real-LLM verification deferred, see below. |
| 5 | Intake Parsing | Done | Claude Code | Real Anthropic call, Zod-validated output, transient/non-transient error split. Verified against a stub; real-LLM verification deferred, see below. |
| 6 | Telegram Bot Scaffold | Done — action needed | **Founder** | Code complete (`grammy` send/receive loop), not run against a live bot. Get a bot token via @BotFather — steps in `reports/task6.md`, under 5 minutes. |
| 7 | YouTube API Quota + OAuth | Done — action needed | **Founder** | OAuth script + checklist ready. Google Cloud project, OAuth consent screen, and quota increase submission are founder-only steps — `reports/task7.md`. Quota approval has historically taken 1–2 weeks — worth starting soon. |
| 8 | TTS/Video Toolchain Spike | Done | Claude Code | Recommended: OpenAI TTS + hosted word-level-timestamp transcription + FFmpeg assembly (no paid rendering SaaS); ElevenLabs deferred to a later per-channel voice upgrade. |

## Deferred, not blocking

Real-LLM verification for Task 4 (resumability) and Task 5 (Intake parsing) is intentionally on hold pending the LLM abstraction layer (`docs/decisions/LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md`) — stub tests already proved the state-machine mechanics, schema validation, and both success/failure paths end-to-end. Re-run `scripts/dry-run.ts` without the stub flag (`INTAKE_STAGE_STUB=1`) once that layer lands or a real key is supplied.

## Full detail

Per-task reports: `reports/task1.md` through `reports/task8.md`. Full narrative: `reports/week1-summary.md`.
