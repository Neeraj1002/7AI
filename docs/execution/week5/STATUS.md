# Week 5 Status: The First Genuinely Real End-to-End Run

**Week status**: Tasks 1-2 done. Task 1 reached the project's actual stated milestone for real (see below). Task 2 closed five real, previously-open code-level issues (`completeStage`/`currentStage` atomicity, the `resume()` stale-sweep risk, Video Intelligence's missing retry, Publishing's double-upload risk, and the captions-optional + frame-sampling fix) — all verified with real evidence, not just code review.
**Last updated**: 2026-09-11 (after Task 2)

| Task | Name | Status | Owner | Notes |
|---|---|---|---|---|
| 1 | The First Genuinely Real End-to-End Dry Run | Done | Claude Code | Real run: `runId=50198c2a-...`, video "Why the Sky Glows: Aurora Borealis Explained," `youtubeVideoId=7KEF84iiApE`, confirmed `private` directly via the YouTube API. Both gates answered live ("Approve" from the founder in real time) — also closes Week 2 Task 6's long-open live-human-reply item. Found and fixed a real gap in `runPeriodicPoll` (one bad historic stub target was aborting the whole poll tick). Real mid-publishing kill/resume re-proven with a real second upload (`nnY46b0vOCw`, a throwaway scaffolding video, left in place — can't be deleted with the current OAuth scope, harmless/private). Total real spend across this task: ~$0.09. See `reports/task1.md`. |
| 2 | Bug-Fix & Hardening Pass | Done | Claude Code | B1 (atomic stage-completion writes, proven via a real forced-rollback test), B2 (resume staleness window, sized from real observed data, proven with real fixture runs), B3 (Video Intelligence retry-wrapped), B4 (Publishing upload retry narrowed to only-provably-safe cases), B5 (captions now optional per channel + Video Intelligence samples 3 frames instead of 1 — a real forced-`word-flash` regression run showed 2 of 3 frames with a genuine partial word, correctly not failing the video). All five verified with real or realistic-shape evidence, not just code review. See `reports/task2.md`. |

## Full detail
Per-task reports: `reports/task1.md`, `reports/task2.md`.

## Open items closed by Task 1
- Week 1 Task 7's YouTube OAuth — **closed**, confirmed working with a real upload and a real API-verified privacy check.
- Real `OPENAI_API_KEY`/`PEXELS_API_KEY` — **closed**, both used for real (real TTS, real transcription, real matching stock footage).
- Week 2 Task 6's live-human-reply round trip — **closed**, both Gate 1 and Gate 2 answered live over real Telegram.
- "The first genuinely real end-to-end dry run" (`KNOWN_ISSUES_AND_BLOCKERS.md` §1) — **closed**.

## Open items closed by Task 2
- B1-B5, all five — see `KNOWN_ISSUES_AND_BLOCKERS.md` §2 ("Fixed in Week 5 Task 2") for the full detail moved out of §3.

## Open items carried out of Week 5
- **`videos.delete` scope missing** — the OAuth token only has `youtube.upload`/`youtube.readonly`; one throwaway private test video from Task 1 (`nnY46b0vOCw`) can't be cleaned up programmatically — Task 2 didn't upload any further real videos (its verification runs stopped before `publishing`). Low priority (private and harmless) — a manual YouTube Studio delete, or a future OAuth re-scope, closes it whenever convenient.
- **`dry-run.ts`'s live gate commands can't coexist with a persistent `npm run dev` instance** on the same Telegram bot token (both long-poll) — a testing-methodology note, not a code bug; worth a real fix (detect-and-defer) if live-gate testing becomes routine.
- **The narrowest possible publishing in-flight-crash window** (process dies while the upload HTTP request is literally in transit, before any error is even classified) — distinct from B4, still open; see `KNOWN_ISSUES_AND_BLOCKERS.md` §3.
