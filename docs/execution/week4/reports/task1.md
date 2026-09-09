# Week 4 Task 1: Video Generation — Close the Review Loop + Stock Footage (Path A)

**Date**: 2026-09-09
**Status**: Complete
**Files Created**: 6
**Files Modified**: 6
**Tests**: All Passing (build/lint/typecheck clean; real regression test executed and evidence reviewed)

## What Was Done

Implemented both pieces of `docs/decisions/VIDEO_GENERATION_LOOP_AND_VISUAL_STRATEGY.md`:

1. **Production-planning step** (`studio/src/agents/video-generation/plan.ts`) — a new `purpose:
   'video-production-planning'` LLM call that runs before assembly. Attempt 1 decides
   independently (stock-footage search terms, caption style, pacing); a regen attempt (2+) is
   given the prior `video_review`/Gate 2 `fixNotes` and must concretely change whatever they
   implicate. The system prompt explicitly names word-flash's known failure mode (a
   midpoint-sampled review frame landing mid-word) and steers attempt 1 away from it as a
   *default*, while still allowing it as a deliberate choice.
2. **Stock-footage capability layer** (`studio/src/stock-footage/`) — mirrors `media/`'s exact
   shape: only `client.ts` touches the Pexels REST API (no SDK exists for it; plain `fetch`
   against the documented endpoint). `STOCK_FOOTAGE_STUB=1` swaps in a generated moving test
   pattern (not a flat color) via `stub.ts`, same convention as `MEDIA_STUB`.

`runVideoGenerationStage` (state-machine.ts) now runs two metered sub-steps per attempt: the
planning call (its own `UsageEvent` row, `agent: 'video-production-planning'`) and the
TTS+transcription+footage assembly (the existing aggregated row, `agent: 'video-generation'`,
now also carrying footage/caption-style metadata). FFmpeg assembly was rewritten to scale/crop a
looped stock-footage clip to exactly 1080×1920 (replacing the solid-color `lavfi` background) and
to burn captions grouped per the plan's `captionStyle` (`word-flash` / `phrase-grouped` /
`sentence-grouped`), not always one word per cue.

**Tier choice for `video-production-planning`**: `claude-haiku-4-5` (cheap/fast), not
`claude-sonnet-5`. Per `AGENT_FLEET_DESIGN.md` 8.1 this is nominally "reasoning/explanation"
(mid-tier), but 8.1's own mid-tier example — "Script Review's revision notes" — already resolves
to `claude-haiku-4-5` in this registry; no distinct mid-tier model has ever actually been added.
Rather than introduce a third pricing tier unprompted, this follows that existing precedent.
Flagged here as a judgment call, same treatment as `intake-parsing`'s tier before it
(`docs/execution/KNOWN_ISSUES_AND_BLOCKERS.md` §2).

## Files Created/Modified

- Created:
  - `studio/src/stock-footage/types.ts`, `registry.ts`, `client.ts`, `stub.ts`, `index.ts`
  - `studio/src/agents/video-generation/plan.ts`
- Modified:
  - `studio/src/llm/types.ts`, `studio/src/llm/registry.ts` — new `video-production-planning`
    purpose (`metadata-generation` also added here, for Task 2 — see that task's report)
  - `studio/src/config/env.ts` — `PEXELS_API_KEY`, `STOCK_FOOTAGE_STUB` (plus Task 2/3's
    `YOUTUBE_*`/`YOUTUBE_STUB`/`ANALYTICS_POLL_INTERVAL_MS`, added in the same pass since they're
    all one schema — see those tasks' reports)
  - `studio/src/agents/video-generation/index.ts` — plan-driven assembly (stock footage,
    grouped captions), dropped the old `fixNotes`-is-inert parameter
  - `studio/src/agents/video-intelligence/index.ts` — system prompt updated to describe the
    background as real stock footage, not a solid-color placeholder
  - `studio/src/run-pipeline/state-machine.ts` — `runVideoGenerationStage` now plans before
    assembling, with a `testOverrides.forcedPlan` escape hatch used only by the dry-run
    regression-test command (never by production code paths)
  - `studio/scripts/dry-run.ts` — new `video-gen-regression` command; `gate1`'s `edit` reply can
    now take a custom script text (needed to keep the regression test's stub-TTS duration under
    the 60s Shorts limit)
  - `studio/.env.example` — `PEXELS_API_KEY`, `STOCK_FOOTAGE_STUB`

Also carried forward into this first Week 4 commit: pre-existing uncommitted prep work already
present in the working tree at session start — the decision doc itself, `KNOWN_ISSUES_AND_BLOCKERS.md`,
`docs/design_doc/frontend/MOBILE_APP_DESIGN.md`, `AGENT_FLEET_DESIGN.md`'s pointer to the decision
doc, and a `gate1-live` dry-run command (Week 3's still-open live-human-reply item). None of these
are this task's own work product; bundled here rather than split into a separate no-op commit.

## Schema Changes Applied

None. Confirmed during implementation: the production plan is written into `pipeline_stages.output`
for the `video_generation` stage (an existing `Json` column) alongside `videoPath`/`durationSeconds`/
`aspectRatio` — no migration needed, matching the decision doc's expectation.

## Test Results

```
npm run typecheck   -> clean
npm run lint        -> clean
npm run build       -> clean
```

Import-boundary grep (`pexels` outside `stock-footage/`): only a string literal
(`stockFootageProvider: 'pexels'`) in `video-generation/index.ts`'s metadata — no actual API call
outside `stock-footage/client.ts`.

### The actual regression test (real evidence, not synthetic)

Ran via `MEDIA_STUB=1 STOCK_FOOTAGE_STUB=1 npx tsx scripts/dry-run.ts video-gen-regression <runId>`
against a real `PipelineRun` (real Anthropic calls for intake/script-generation/script-review/
production-planning; `OPENAI_API_KEY`/`PEXELS_API_KEY` both still absent, so TTS/transcription and
stock footage ran under their stubs).

Attempt 1's plan was **forced** (test-only override, not a real LLM call — see "Deviations" below)
to `captionStyle: 'word-flash'`, deliberately reproducing Week 3 Task 3's known failure shape.
Attempt 2 was **not** forced — a fully real planning call, driven by real `fixNotes` from the real
`video_review` failure attempt 1 produced.

Real Video Intelligence rationale, attempt 1 (verbatim):
> "This frame shows a generic colorful test pattern/placeholder background with large text saying
> **'ackbor'** (appears to be corrupted or partial text)... replace with actual cat footage..."

Real Video Intelligence rationale, attempt 2 (verbatim):
> "The frame shows a generic colorful striped background with text reading **'backbone lets the'**
> - this appears to be a template or placeholder graphic with no connection to the cat landing
> topic... For a video about cats landing on their feet, the frame should feature actual cat
> footage..."

The extracted review frames (`data/videos/<runId>/1.mp4.frame.jpg` vs `2.mp4.frame.jpg`) were
inspected directly and confirm this: attempt 1's frame shows the word "backbone" cut off mid-word
("ackbon" visible, cropped) — the exact Week 3 Task 3 artifact. Attempt 2's frame shows the
complete phrase "backbone lets the" cleanly, no partial word. Attempt 2's plan also picked a
different stock-footage query (`"cat falling landing righting reflex slow motion"` vs attempt 1's
forced `"cats always land"`).

**The specific bug this task exists to fix — a partial word from mid-cue frame sampling — is
demonstrably gone in attempt 2.** Attempt 2 still failed review, but for an unrelated, expected
reason: `STOCK_FOOTAGE_STUB`'s generated color-bar pattern has no actual cat content, and the real
multimodal reviewer correctly flagged that as topically irrelevant — a stub-testing artifact, not a
defect in the loop-closing fix (real Pexels footage would return actual matching video). Ran a
third, fully real attempt to see the loop through: attempt 3's plan again responded to attempt 2's
new fixNotes (different rationale, still blocked by the same stub-footage limitation), and the
circuit breaker tripped at `MAX_VIDEO_REGEN_ATTEMPTS=2` exactly as designed, routing the run to
`needs_attention` — the same realistic behavior Week 3 Task 3 already established, now for a
different underlying reason (stub footage relevance, not caption artifacts).

All three attempts' `.mp4` files are distinct, real, differently-sized renders (confirmed via
`md5sum`: `af8ff951...`, `9698fcb7...`, `c0e642d8...`); the `.srt` files also differ sharply in
size (2172 bytes for attempt 1's word-flash vs 778 bytes for attempts 2/3's phrase-grouped),
consistent with genuinely different caption grouping, not a cosmetic relabeling.

Five real `UsageEvent` rows were written across the three attempts: one `video-generation`
(aggregated TTS+transcription+footage) row per attempt (3 total, all real, non-zero cost), and one
`video-production-planning` row for each *real* planning call (attempts 2 and 3 — attempt 1's was
skipped by the test override, by design, and wrote no row).

## Deviations from Spec

- **Test-only forced-plan override.** The task's acceptance criterion requires reproducing Week 3
  Task 3's exact failure and proving the real regen loop fixes it. The new planning prompt is
  designed to steer attempt 1 *away* from word-flash by default (per the decision doc's own
  Section 5 instruction), so an unbiased real attempt 1 is unlikely to organically reproduce the
  old bug anymore — which is the point of the fix, but makes the specific regression hard to
  demonstrate without deliberately constructing it. Added `runVideoGenerationStage`'s optional
  `testOverrides.forcedPlan` parameter (default `undefined`, only ever passed by
  `dry-run.ts`'s `video-gen-regression` command) to force attempt 1 into the known-bad shape,
  while attempt 2+ always goes through the real, unforced LLM call. This is test scaffolding, not
  a production code path — flagging it plainly rather than letting it look like an unforced
  organic reproduction.
- **`fixNotes` moved off `generateVideo`'s signature.** Week 3's `generateVideo` accepted
  `fixNotes` but only recorded it for traceability (it had nothing to act on). Now that
  `plan.ts` is the thing that actually consumes `fixNotes`, `generateVideo` no longer takes it —
  the state machine passes `fixNotes` to `planVideoProduction` instead, and the resulting `plan`
  (not raw notes) flows into `generateVideo`.
- **`video-intelligence-own-draft`'s system prompt updated.** Its rubric text explicitly praised
  "a solid-color template background" as acceptable — stale now that Task 1 replaces that
  background with real stock footage. Updated the wording to match what the pipeline now actually
  produces; not a rubric behavior change beyond that.

## Sign-Off

- Task Objective: Met — a `video_review` rejection with `fixNotes` now produces a materially
  different regen attempt (different caption grouping, different footage search terms), verified
  against a real reproduction of Week 3 Task 3's exact failure mode.
- Schema Impact: Matches `SCHEMA.md`/decision doc — no changes needed, confirmed during
  implementation.
- Business Logic: Matches `BUSINESS_LOGIC.md` — no new states; `video_generation`'s internal shape
  changed as documented.
- Tests: Passing (build/lint/typecheck clean; real regression test run and reviewed above).
- Ready for Integration: Yes.
- **Still stubbed, pending tonight's keys**: real `OPENAI_API_KEY` (TTS/transcription) and real
  `PEXELS_API_KEY` (actual matching stock footage, not a synthetic test pattern) — both flagged
  per this task's own Additional Notes. The loop-closing fix itself is proven independent of
  either; the remaining stub-footage-relevance failure above should resolve once `PEXELS_API_KEY`
  lands and real, topic-matched footage is returned.
