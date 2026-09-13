# Week 5 Status: The First Genuinely Real End-to-End Run

**Week status**: Tasks 1-4 done. Task 1 reached the project's actual stated milestone for real (see below). Task 2 closed five real, previously-open code-level issues. Task 3 closed a sixth: a restart while a run sat at `paused_gate1`/`paused_gate2` used to strand it forever — now it's automatically re-prompted on boot, plus a "you haven't answered in a while" nudge independent of any restart. Task 4 closed four more: Intake's model-tier fixed, a real fair per-channel budget-allocation system (schema migration included), a factual-concerns flag on Script Review, and the project's first real automated test harness (vitest, 27 assertions). All ten verified with real evidence, not just code review.
**Last updated**: 2026-09-13 (after Task 4)

| Task | Name | Status | Owner | Notes |
|---|---|---|---|---|
| 1 | The First Genuinely Real End-to-End Dry Run | Done | Claude Code | Real run: `runId=50198c2a-...`, video "Why the Sky Glows: Aurora Borealis Explained," `youtubeVideoId=7KEF84iiApE`, confirmed `private` directly via the YouTube API. Both gates answered live ("Approve" from the founder in real time) — also closes Week 2 Task 6's long-open live-human-reply item. Found and fixed a real gap in `runPeriodicPoll` (one bad historic stub target was aborting the whole poll tick). Real mid-publishing kill/resume re-proven with a real second upload (`nnY46b0vOCw`, a throwaway scaffolding video, left in place — can't be deleted with the current OAuth scope, harmless/private). Total real spend across this task: ~$0.09. See `reports/task1.md`. |
| 2 | Bug-Fix & Hardening Pass | Done | Claude Code | B1 (atomic stage-completion writes, proven via a real forced-rollback test), B2 (resume staleness window, sized from real observed data, proven with real fixture runs), B3 (Video Intelligence retry-wrapped), B4 (Publishing upload retry narrowed to only-provably-safe cases), B5 (captions now optional per channel + Video Intelligence samples 3 frames instead of 1 — a real forced-`word-flash` regression run showed 2 of 3 frames with a genuine partial word, correctly not failing the video). All five verified with real or realistic-shape evidence, not just code review. See `reports/task2.md`. |
| 3 | Make Approval Gates Restart-Safe | Done | Claude Code | B6: `resumeOnStartup()` now re-opens every `paused_gate1`/`paused_gate2` run on boot (re-sends the Telegram prompt, re-registers the pending reply); `runGate1Stage`/`runGate2Stage` reuse the existing stage attempt rather than creating a new one. Verified live end-to-end: real fixture runs at each gate, a real restart re-established the pending state, and the app's `resolvePendingApproval` path resolved it (run correctly advanced) — a second immediate restart created no duplicate attempt. Added a "you haven't answered in a while" nudge (`GATE_REMINDER_THRESHOLD_MS`, default 4h), verified to fire past-threshold and not fire for a prompt reply. **Real finding along the way**: the very first live test also picked up ~8 genuine leftover paused-gate runs from Weeks 2-3 and correctly (if noisily) re-sent real Telegram messages for all of them — cleaned up immediately; flagged as a real, undecided tradeoff (deliberately no staleness filter for gates, since a legitimate human reply can take hours). See `reports/task3.md`. |
| 4 | Fact-Check Flagging, Fair Budget Allocation, Model-Tier Cleanup, and a Real Test Harness | Done | Claude Code | C1: `intake-parsing` moved to `claude-haiku-4-5` (was inherited premium `claude-sonnet-5`), verified via a direct `callLLM` call and a real intake run. C2: real per-channel budget fairness — `Channel.budgetOverrideUsd` (real Prisma migration), equal-split-by-default allocation (`computeChannelBudgetCeilings`), `isBudgetAvailable` now channel-aware, new `set-channel-budget-override.ts` script — verified with real fixture channels across equal-split/override/exceeding-override/pathological-overshoot scenarios. C3: Script Review's `factualConcerns: string[]` (plausibility check only, no grounding — `llm/client.ts` has no tool use), verified with a planted-error script vs. a clean one. C4: `vitest` adopted, 4 test files, 27 real assertions covering `parseGateReply`, `mapGoogleError`, `resolvePurpose`/`resolvePricing` (incl. a C1 regression test), and `computeChannelBudgetCeilings`; a real `dist/`-pollution build/test-config bug found and fixed along the way. **Real finding, not fixed here**: `runIntakeStage` writes no `UsageEvent` at all — Intake's real spend has never been metered, discovered while verifying C1. See `reports/task4.md`. |

## Full detail
Per-task reports: `reports/task1.md`, `reports/task2.md`, `reports/task3.md`, `reports/task4.md`.

## Open items closed by Task 1
- Week 1 Task 7's YouTube OAuth — **closed**, confirmed working with a real upload and a real API-verified privacy check.
- Real `OPENAI_API_KEY`/`PEXELS_API_KEY` — **closed**, both used for real (real TTS, real transcription, real matching stock footage).
- Week 2 Task 6's live-human-reply round trip — **closed**, both Gate 1 and Gate 2 answered live over real Telegram.
- "The first genuinely real end-to-end dry run" (`KNOWN_ISSUES_AND_BLOCKERS.md` §1) — **closed**.

## Open items closed by Task 2
- B1-B5, all five — see `KNOWN_ISSUES_AND_BLOCKERS.md` §2 ("Fixed in Week 5") for the full detail moved out of §3.

## Open items closed by Task 3
- B6 — a restart no longer strands a paused gate forever. See `KNOWN_ISSUES_AND_BLOCKERS.md` §2.

## Open items closed by Task 4
- C1-C4, all four — see `KNOWN_ISSUES_AND_BLOCKERS.md` §2 ("Fixed in Week 5") for the full detail moved out of §3/§4.

## Open items carried out of Week 5
- **`videos.delete` scope missing** — the OAuth token only has `youtube.upload`/`youtube.readonly`; one throwaway private test video from Task 1 (`nnY46b0vOCw`) can't be cleaned up programmatically. Low priority (private and harmless) — a manual YouTube Studio delete, or a future OAuth re-scope, closes it whenever convenient.
- **`dry-run.ts`'s live gate commands can't coexist with a persistent `npm run dev` instance** on the same Telegram bot token (both long-poll) — a testing-methodology note, not a code bug; worth a real fix (detect-and-defer) if live-gate testing becomes routine.
- **The narrowest possible publishing in-flight-crash window** (process dies while the upload HTTP request is literally in transit, before any error is even classified) — distinct from B4, still open; see `KNOWN_ISSUES_AND_BLOCKERS.md` §3.
- **Restart-safe gate reopening has no staleness filter** (unlike B2) — a real, deliberate tradeoff, not an oversight; see `KNOWN_ISSUES_AND_BLOCKERS.md` §3 for the reasoning and the real incident that surfaced it.
- **Intake's LLM call writes no `UsageEvent`** — real spend from every Intake call across all five weeks is unmetered; found while verifying Task 4's C1, not fixed (out of scope). See `KNOWN_ISSUES_AND_BLOCKERS.md` §3.
- **A real search-grounded fact-check pass and DB-backed integration tests** — both deliberately deferred by Task 4 (C3/C4); see `KNOWN_ISSUES_AND_BLOCKERS.md` §6.
