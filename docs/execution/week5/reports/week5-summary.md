# Week 5 Summary: The First Genuinely Real End-to-End Run — Sprint 1 Closes

**Dates**: Week 5 (executed 2026-09-13 to 2026-09-14)
**Status**: All 5 tasks complete. **Sprint 1 (the original Oct 15 MVP) is now genuinely closed.**
Real credentials, real approval gates, real spend metering, and — as of this week's last task — one
real, live, public Short on the founder's real YouTube channel. Nothing in
`KNOWN_ISSUES_AND_BLOCKERS.md` §1 (founder-blocking) or the in-scope part of §3 remains open.

## What Got Built

- **Task 1 — The first genuinely real end-to-end dry run.** Real YouTube OAuth, real
  `OPENAI_API_KEY`/`PEXELS_API_KEY`, both approval gates answered live over real Telegram for the
  first time. `PipelineRun.status='completed'` reached for real, `youtubeVideoId` confirmed
  `private` via a direct YouTube Data API call. Found and fixed a real gap in `runPeriodicPoll` (one
  bad historic stub target was silently aborting the whole poll tick).
- **Task 2 — Bug-fix & hardening pass.** Five real, previously-open code-level issues closed: atomic
  stage-completion writes (B1), a resume-staleness window sized from real observed durations (B2),
  Video Intelligence's missing retry-with-backoff (B3), Publishing's double-upload risk narrowed to
  only provably-safe retries (B4), and captions made genuinely optional per channel plus a real fix
  to the caption-style/frame-sampling conflict (B5).
- **Task 3 — Restart-safe approval gates.** B6: a restart while a run sat at `paused_gate1`/
  `paused_gate2` used to strand it forever; `resumeOnStartup()` now re-opens every pending gate on
  boot, plus a "you haven't answered in a while" nudge independent of any restart. A real, honest
  side effect: the very first live test re-sent real Telegram messages for ~8 genuine leftover
  paused-gate runs from Weeks 2-3, cleaned up immediately.
- **Task 4 — Fact-check flagging, fair budget allocation, model-tier cleanup, a real test harness.**
  Intake's model tier fixed (`claude-haiku-4-5`, was inherited premium `claude-sonnet-5`); a real,
  founder-directed fair per-channel budget-allocation system (`Channel.budgetOverrideUsd`, a real
  Prisma migration, equal-split-by-default with per-channel override); Script Review's
  `factualConcerns` plausibility-check flag; and the project's first real automated test harness
  (`vitest`, 27 assertions across 4 pure-logic functions). Surfaced, but explicitly didn't fix, a
  real gap: Intake wrote no `UsageEvent` at all.
- **Task 5 — Meter Intake spend, go public for real.** Closed that exact gap (D1) — Intake now
  writes a real `UsageEvent` on every call, verified by a real intake run and a direct DB query.
  Then closed the last item from the original MVP roadmap (D2): privacy status became a real,
  per-run Gate 2 choice (`"approve public"`/`"approve unlisted"`/bare `"approve"` → private
  default) instead of a hardcoded constant, and one real Short about GPT-6 Astra went live —
  **https://youtu.be/Tju034tqrrY** — confirmed `public` via a direct YouTube Data API call, both
  gates answered live over real Telegram.

## What Deviated from the Docs, and Why

1. **Task 5's real test needed two live attempts, not one.** The first real run's video generation
   exhausted its entire regen budget (3 attempts, 68.2s/68.6s/67.8s — all over the 60s Shorts limit)
   without ever fitting, because the automatic regen loop can adjust pacing/caption style but has no
   mechanism to actually shorten the narration itself (duration is fixed by `sanctionedScriptText`'s
   word count at Gate 1 approval time). Worked around by resubmitting the same brief with an
   explicit length constraint, which rendered at 42.4s on the first attempt. A real, previously
   undiscovered gap — logged in `KNOWN_ISSUES_AND_BLOCKERS.md` §3, not fixed this week (out of D1/D2's
   scope).
2. **D2's fourth verification (bare-approve-still-private) used a fresh, tiny local fixture video,
   not the abandoned first run's real 45MB render** — reusing the large file made `dry-run.ts`'s own
   simulated-reply polling window time out (a testing-harness limitation, not a code bug). A 2-second
   local test clip resolved this cleanly while still exercising the real `runGate2Stage`/
   `runPublishingStage` wiring end-to-end.
3. **`YOUTUBE_STUB=1` was used for that one confirmatory publish**, deliberately, to avoid creating a
   second real, searchable YouTube artifact for a test whose only purpose was confirming a default
   didn't change — the task explicitly allowed "real or fixture" for this check.
4. **Script Review's `factualConcerns` (Task 4) did exactly what it was built to do, live** — both
   real script-review calls for the GPT-6 Astra brief flagged that the model can't confirm "GPT-6
   Astra" is real (a genuine knowledge-cutoff limitation, not a false alarm), and the founder made an
   informed, deliberate call to approve anyway at Gate 1. Not a deviation from spec, but the first
   time this plausibility check actually surfaced something real at a live gate rather than in a
   contrived test script.

None of these deviations required changing `SCHEMA.md`'s or `BUSINESS_LOGIC.md`'s fundamental shape
— both were updated in place, per-task, to record the real deltas as they landed.

## Deliverables Checklist (Sprint 1's own closing bar, per `docs/roadmap/SPRINT_ROADMAP.md`)

- [x] Week 5 Task 4 implemented (was still "spec written, not implemented" when this sprint's
      roadmap review was written)
- [x] A genuinely public test video — real, live, confirmed via direct API call, not inferred
- [x] Channel #2/#3 expansion — deliberately deferred to Sprint 3 (not a gap; multi-channel becomes
      central there anyway)
- [x] `week5-summary.md` — this document
- [x] `docs/execution/KNOWN_ISSUES_AND_BLOCKERS.md` §1/§3 confirmed clear of anything Sprint-1-scoped

## What Should Feed Into Sprint 2 Planning

Per `docs/roadmap/SPRINT_ROADMAP.md`, Sprint 2 is Content Quality: flexible creation (voice
selection, a second visual-source backend), the audio layer, synthetic-content disclosure, and
Track C (retention-curve capture, hook-first script rubric, custom cover frame, title/description
A/B testing, a founder daily digest, post-hoc "why didn't it work" tagging). Two real findings from
this week are directly relevant there:

- **Script length awareness belongs earlier in the pipeline, not just in the regen loop.** Since
  Sprint 2 touches Script Generation directly (hook-first rubric, A/B testing), that's a natural
  place to also add an estimated-narration-duration budget check up front (word count ÷ speaking
  rate), rather than relying on video-gen regen attempts to catch an overlong script after the fact.
- **The founder now has a real, working per-run privacy lever** — worth keeping in mind for Sprint
  2's retention/tagging capture work, since a `public` video is the first one that will accumulate
  real, publicly-visible watch-time data worth tagging.

## Cost Summary

Real money spent this week, across all five tasks' verification (still no production use — there
isn't any yet): **Task 1 alone was ~$0.09** (per its own report). **Task 5's verification alone was
~$0.17** across 18 real usage events — Intake/Script Generation/Script Review calls for both the
abandoned and successful GPT-6 Astra runs, real TTS/transcription/stock-footage for 4 total video
renders (3 failed on duration, 1 succeeded), and the fixture confirmation run. Tasks 2-4 spent
comparatively little (mostly cheap-tier LLM calls against fixture data). All trivial in absolute
terms; tracked here for the same reason `UsageEvent` exists at all, and because Task 5 is the first
week where that tracking is finally complete — Intake's own spend included.
