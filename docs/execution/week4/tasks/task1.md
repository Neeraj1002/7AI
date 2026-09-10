# Week 4 Task 1: Video Generation — Close the Review Loop + Stock Footage (Path A)

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** It defines the Git Workflow (branch/commit/PR steps for this task), the `STATUS.md` update this task must make, and the section structure this file follows. This file states only this task's specifics — the template governs everything else, so don't skip it.

**Objective**: Give `video_generation` an actual decision-making step so a `video_review` rejection changes the next attempt instead of re-running an identical pipeline — and replace the placeholder solid-color background with real stock footage (Path A of the two-path visual strategy).
**Duration**: 3–4 hours
**Depends On**: Week 3 complete (all done). Real `OPENAI_API_KEY` for real TTS testing — if still absent when this task starts, use the existing `MEDIA_STUB=1` path, same as Week 3. New `PEXELS_API_KEY` for real stock footage — if absent, stub it (same convention, see Additional Notes).
**Owning Component**: Video Generation agent, extended per `docs/decisions/VIDEO_GENERATION_LOOP_AND_VISUAL_STRATEGY.md` — read that decision doc in full before starting, it's this task's actual spec.
**Success Criteria**: A `video_review` rejection with `fixNotes` produces a *materially different* regen attempt — verified by deliberately reproducing Week 3 Task 3's real flashing-caption failure and confirming attempt 2 is visibly different, not identical. The rendered video uses real stock footage, not a solid-color background.

## Task Requirement

Two things, both already decided in `docs/decisions/VIDEO_GENERATION_LOOP_AND_VISUAL_STRATEGY.md` — this task is the implementation, not a fresh design pass:

1. **A production-planning step** ahead of the deterministic TTS+FFmpeg assembly: a new `purpose: 'video-production-planning'` LLM call (`studio/src/llm/`, never a provider SDK directly) that takes the sanctioned script and, on a retry, the prior attempt's `fixNotes`, and outputs concrete choices — stock-footage search terms/selection, caption style, pacing. Attempt 1 gets no notes and decides on its own; attempt 2+ must actually respond to what failed.
2. **A stock-footage capability layer** (`studio/src/stock-footage/`), same boundary pattern as `llm/` and `media/` — only `client.ts` imports the Pexels SDK/fetch calls. Used by the production-planning step (or by the assembly step directly, using the plan's search terms) to fetch a real clip instead of defaulting to a solid-color background.

This task implements **Path A only** (stock footage). Path B (generative/character-consistent video) is explicitly out of scope — see the decision doc's Section 3, not designed yet.

### Context
`docs/decisions/VIDEO_GENERATION_LOOP_AND_VISUAL_STRATEGY.md` (the full spec for this task). `docs/execution/week3/reports/task2.md` (current Video Generation implementation — solid-color background, `MEDIA_STUB=1` path). `docs/execution/week3/reports/task3.md` (the real 3x-identical-failure evidence this task exists to fix). `AGENT_FLEET_DESIGN.md` Section 4.6 (updated 2026-09-09 with a pointer to the decision doc).

### Acceptance Criteria
- [ ] `studio/src/llm/{types,registry}.ts` gains a `video-production-planning` purpose. State your tier choice (cheap/fast vs. mid-tier) and reasoning in the report — not obviously classification-shaped like Script Review, so don't default without thinking about it.
- [ ] New `studio/src/stock-footage/{types,registry,client,index}.ts`, mirroring `media/`'s exact shape (public surface exports only this project's own types; only `client.ts` touches the Pexels API). Add a `stub.ts` + env flag (e.g. `STOCK_FOOTAGE_STUB=1`) up front, same convention as `MEDIA_STUB` — don't wait to be told twice.
- [ ] `runVideoGenerationStage` calls the production-planning step before assembly, passing the prior attempt's `fixNotes` when this is a regen (reuse the existing fix-notes lookup Week 3 Task 4 already fixed for Gate 2's `revise` verdict).
- [ ] FFmpeg assembly uses the planned stock-footage clip(s), not a solid-color background.
- [ ] **The actual regression test**: reproduce Week 3 Task 3's real failure scenario (flashing-word captions + midpoint-frame sampling reads as a partial word) and confirm attempt 2's plan is visibly different — different caption style and/or different frame-sampling-friendly footage choice — and that Video Intelligence's own-draft check can now pass it. This is the acceptance criterion that actually matters; don't substitute a synthetic/simplified version of it.
- [ ] One `UsageEvent` row per production-planning call, same per-attempt metering convention as every other stage (a retried attempt logs its own row).
- [ ] `docs/execution/week4/SCHEMA.md`/`BUSINESS_LOGIC.md` reconciled if implementation reveals anything the decision doc didn't anticipate (it states no schema change is expected — confirm that holds, don't assume).

## Schema Impact
None expected — the production plan is written into the `video_generation` stage's existing `pipeline_stages.output`, per the decision doc. Confirm during implementation rather than assuming.

## Business Logic / State Transition
No new states. `video_generation`'s internal shape changes (plan-then-assemble instead of assemble-only); `video_review`'s `fixNotes` output is consumed meaningfully for the first time since it was added in Week 3.

### Reference
`docs/decisions/VIDEO_GENERATION_LOOP_AND_VISUAL_STRATEGY.md` (full spec), `docs/execution/week3/BUSINESS_LOGIC.md`.

## Implementation

### Files to Create
- `studio/src/stock-footage/types.ts`, `registry.ts`, `client.ts`, `stub.ts`, `index.ts`.
- Production-planning logic — either inside `agents/video-generation/index.ts` or a new `agents/video-generation/plan.ts`, your call, state which and why.

### Files to Modify
- `studio/src/llm/{types,registry}.ts` — new purpose.
- `studio/src/run-pipeline/state-machine.ts` — `runVideoGenerationStage`.
- `.env.example` / `.env.local` — `PEXELS_API_KEY`, `STOCK_FOOTAGE_STUB`.
- `scripts/dry-run.ts` — whatever's needed to exercise the regen-with-notes scenario deliberately.

### Detailed Steps
1. Check `.env.local` for `OPENAI_API_KEY`/`PEXELS_API_KEY` — build against real or stub per what's actually there, same as every prior week's convention.
2. Build `studio/src/stock-footage/`.
3. Add the `video-production-planning` LLM purpose.
4. Wire the plan step into `runVideoGenerationStage`, before assembly; pass `fixNotes` on regen attempts.
5. Update FFmpeg assembly to use the planned footage.
6. Deliberately reproduce Week 3 Task 3's failure, confirm the loop now actually closes.

## Testing

### Test Commands
```bash
npm run build
npm run lint
npm run typecheck
npx tsx scripts/dry-run.ts   # extend to exercise a real regen-with-notes cycle
```

### Expected Results
- A first attempt with no notes produces a reasonable plan on its own.
- A second attempt, given real `fixNotes` from a real review failure, produces a visibly different plan and a video that can pass review — not a repeat of the same failure.
- Real stock footage appears in the rendered output, not a solid color.

### How to Verify
1. Run all test commands above.
2. Watch the actual rendered video from both a first attempt and a regen attempt — confirm they're different, not just check timestamps/hashes.
3. Confirm the report states plainly whether `OPENAI_API_KEY`/`PEXELS_API_KEY` were real or stubbed for this task's testing.

## Additional Notes

If either key is still missing when this task starts, stub it and flag it clearly in the report — same posture as every credential gap this project has hit so far. Don't block this task on a founder-side signup; the loop-fix and stock-footage-selection logic can be built and verified with a stub, same as `MEDIA_STUB` proved out Week 3's TTS/transcription code before a key existed.

## Links & References
- [docs/decisions/VIDEO_GENERATION_LOOP_AND_VISUAL_STRATEGY.md](../../decisions/VIDEO_GENERATION_LOOP_AND_VISUAL_STRATEGY.md) — this task's actual spec
- [docs/execution/week3/reports/task2.md](../../week3/reports/task2.md), [task3.md](../../week3/reports/task3.md)
- [docs/execution/KNOWN_ISSUES_AND_BLOCKERS.md](../../KNOWN_ISSUES_AND_BLOCKERS.md) §3
- [docs/execution/week4/tasks/task2.md](task2.md) — Publishing, next in sequence
