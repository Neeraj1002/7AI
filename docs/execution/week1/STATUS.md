# Week 1 Status: Foundation

**Week status**: Core deliverables complete. 1 item pending founder action (YouTube quota/OAuth — historically 1–2 week lead time, worth starting now). Real-LLM verification, previously deferred, is now unblocked — Anthropic key added 2026-09-07 — tracked under Week 2 Task 3, not a Week 1 blocker.
**Last updated**: 2026-09-07 (Anthropic API key + Telegram bot token added to `.env.local`)

| Task | Name | Status | Owner | Notes |
|---|---|---|---|---|
| 1 | Repo Scaffolding | Done | Claude Code | TypeScript + Prisma + Postgres, fresh repo, no code reused from `yt_shorts`. `npm run build`/`lint` clean. |
| 2 | Postgres Setup | Done | Claude Code | Dedicated `sevenai_app` role + `sevenai_dev` database. Two `.env` files (CLI + app) hold `DATABASE_URL` — minor duplication, not fixed silently, see `reports/task2.md`. |
| 3 | Foundation Schema Migration | Done | Claude Code | All 5 tables (`tenants`, `channels`, `pipeline_runs`, `pipeline_stages`, `review_logs`) + 5 `CHECK` constraints migrated per `SCHEMA.md`. Migration confirmed idempotent. |
| 4 | Orchestrator State Machine | Done | Claude Code | Resumability proven with a real kill-and-restart test — no duplicate runs, no lost work. Real-LLM verification was deferred, now unblocked — see below. |
| 5 | Intake Parsing | Done | Claude Code | Real Anthropic call, Zod-validated output, transient/non-transient error split. Verified against a stub; real-LLM verification was deferred, now unblocked — see below. |
| 6 | Telegram Bot Scaffold | Done | Claude Code | Bot token obtained and added to `.env.local` (2026-09-07). Code complete; live send/receive verification now tracked under Week 2 Task 2 (`docs/execution/week2/tasks/task2.md`), not a separate founder blocker. |
| 7 | YouTube API Quota + OAuth | Done — action needed | **Founder** | OAuth script + checklist ready. Google Cloud project, OAuth consent screen, and quota increase submission are founder-only steps — `reports/task7.md`. Quota approval has historically taken 1–2 weeks — worth starting soon. |
| 8 | TTS/Video Toolchain Spike | Done | Claude Code | Recommended: OpenAI TTS + hosted word-level-timestamp transcription + FFmpeg assembly (no paid rendering SaaS); ElevenLabs deferred to a later per-channel voice upgrade. |

## Deferred, not blocking

Real-LLM verification for Task 4 (resumability) and Task 5 (Intake parsing) was deliberately deferred pending two things: the LLM abstraction layer (`docs/decisions/LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md`) and a real Anthropic API key. Both are now in place — the key was added to `.env.local` on 2026-09-07 (a workspace-scoped key, per the spend-limit setup done the same day), and the layer is scoped as Week 2 Task 1. The actual verification run (`scripts/dry-run.ts` without `INTAKE_STAGE_STUB=1`) is tracked as part of Week 2 Task 3 (`docs/execution/week2/tasks/task3.md`), which migrates `parse-brief.ts` onto the new layer first and re-attempts verification against that — not the old direct-SDK code.

## Full detail

Per-task reports: `reports/task1.md` through `reports/task8.md`. Full narrative: `reports/week1-summary.md`.
