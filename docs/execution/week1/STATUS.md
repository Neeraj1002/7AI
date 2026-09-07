# Week 1 Status: Foundation

**Week status**: Core deliverables complete. 2 items pending founder action. Real-LLM extraction-quality verification, previously deferred, is now closed against a genuine model response (Week 2 Task 3) — though production still needs the founder's own API key, see below.
**Last updated**: 2026-09-07 (addendum after Week 2 Task 3)

| Task | Name | Status | Owner | Notes |
|---|---|---|---|---|
| 1 | Repo Scaffolding | Done | Claude Code | TypeScript + Prisma + Postgres, fresh repo, no code reused from `yt_shorts`. `npm run build`/`lint` clean. |
| 2 | Postgres Setup | Done | Claude Code | Dedicated `sevenai_app` role + `sevenai_dev` database. Two `.env` files (CLI + app) hold `DATABASE_URL` — minor duplication, not fixed silently, see `reports/task2.md`. |
| 3 | Foundation Schema Migration | Done | Claude Code | All 5 tables (`tenants`, `channels`, `pipeline_runs`, `pipeline_stages`, `review_logs`) + 5 `CHECK` constraints migrated per `SCHEMA.md`. Migration confirmed idempotent. |
| 4 | Orchestrator State Machine | Done | Claude Code | Resumability proven with a real kill-and-restart test — no duplicate runs, no lost work. Real-call variant of this specific test remains optional/not done — see `reports/task4.md` addendum. |
| 5 | Intake Parsing | Done | Claude Code | Migrated onto the LLM layer and verified against a genuine Claude response (Week 2 Task 3) — extraction quality confirmed sensible. That verification used this session's sandbox API routing, not a founder-supplied key — `.env.local`'s `ANTHROPIC_API_KEY` is still empty, so production still needs one. See `reports/task5.md` addendum. |
| 6 | Telegram Bot Scaffold | Done — action needed | **Founder** | Code complete (`grammy` send/receive loop), not run against a live bot. Get a bot token via @BotFather — steps in `reports/task6.md`, under 5 minutes. |
| 7 | YouTube API Quota + OAuth | Done — action needed | **Founder** | OAuth script + checklist ready. Google Cloud project, OAuth consent screen, and quota increase submission are founder-only steps — `reports/task7.md`. Quota approval has historically taken 1–2 weeks — worth starting soon. |
| 8 | TTS/Video Toolchain Spike | Done | Claude Code | Recommended: OpenAI TTS + hosted word-level-timestamp transcription + FFmpeg assembly (no paid rendering SaaS); ElevenLabs deferred to a later per-channel voice upgrade. |

## Deferred, not blocking (updated 2026-09-07 after Week 2 Task 3)

The LLM abstraction layer landed and `parse-brief.ts` was migrated onto it (Week 2 Tasks 1 and 3). Its real-call path was exercised against a genuine Claude response and produced sensible output — this closes the "is the extraction code correct against a real model" half of the original deferral. What's still open: that verification happened via this session's sandbox-specific `ANTHROPIC_BASE_URL` routing, not a founder-supplied `ANTHROPIC_API_KEY` — `.env.local`'s key is still empty, so the app's actual deployment still needs one before it can make real calls outside this sandbox. Task 4's literal kill-mid-stage-against-a-real-call re-test also remains optional/not done (see `reports/task4.md`). Full detail: `docs/execution/week2/reports/task3.md`.

## Full detail

Per-task reports: `reports/task1.md` through `reports/task8.md`. Full narrative: `reports/week1-summary.md`.
