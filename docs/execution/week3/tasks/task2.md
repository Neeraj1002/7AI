# Week 3 Task 2: Video Generation Agent

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** It defines the Git Workflow (branch/commit/PR steps for this task), the `STATUS.md` update this task must make, and the section structure this file follows. This file states only this task's specifics — the template governs everything else, so don't skip it.

**Objective**: Build the Video Generation agent — TTS voiceover, word-level captions, and FFmpeg assembly into a finished vertical video — using Task 1's media layer.
**Duration**: 3–4 hours
**Depends On**: Task 1 (media layer). Also needs Week 2's `AgentQuota`/budget-check pattern (Task 4) to reuse for this stage's own cost gate.
**Owning Component**: Video Generation agent, per `AGENT_FLEET_DESIGN.md` 4.6.
**Success Criteria**: Given a Gate-1-approved script, produces a real vertical video file (voiceover + burned captions + brand overlay), gated by the same soft budget check as Script Generation, metered with one aggregated `UsageEvent` row.

## Task Requirement

Deliberately the simplified approach Section 14 of the roadmap calls for — TTS + captions + template/stock visuals, not generative AI video. Don't scope-creep toward fancier visuals this task; the goal is proving the pipeline produces something watchable end-to-end, not maximizing visual polish.

### Context
`AGENT_FLEET_DESIGN.md` Section 4.6. `docs/execution/week1/reports/task8.md` — the exact toolchain and composite approach (background clip + burned captions via FFmpeg's `subtitles` filter + brand overlay from `Channel.brandAssets`). `docs/execution/week3/BUSINESS_LOGIC.md` Section 2.

### Acceptance Criteria
- [ ] Calls `studio/src/media/`'s `synthesizeSpeech`/`transcribe` — never the OpenAI SDK directly.
- [ ] Assembles background/template visual + burned word-level captions + brand overlay (intro/outro/watermark from `Channel.brandAssets`) via FFmpeg, scripted directly (no rendering SaaS), per Task 8.
- [ ] Before running, the same budget-gate check as Week 2 Task 4 (sum `UsageEvent.costUsd` for tenant+platform vs. `AgentQuota.budgetCeilingUsd`) — this stage is explicitly named in `MVP_ROADMAP_OCT15.md` Section 5.6 as needing its own gate, not assumed covered by Script Generation's.
- [ ] Writes exactly one `UsageEvent` row per invocation, aggregating TTS + transcription cost (FFmpeg cost `0`), with a `metadata` breakdown, per `docs/execution/week3/SCHEMA.md`.
- [ ] Output (`videoPath`, `durationSeconds`, `aspectRatio`) written to `pipeline_stages.output` (`stageName = 'video_generation'`) as a file path string, not binary.
- [ ] On a regen attempt (from a failed Video Intelligence pass or founder revision notes at Gate 2), incorporates the prior attempt's fix notes into the generation input — re-running isn't identical to the first attempt.
- [ ] Rendered files are written to a local project data directory (proposed: `studio/data/videos/{pipelineRunId}/{attemptNumber}.mp4`) — state whatever path convention you actually used in the report, flagged for confirmation the same way `AgentQuota`'s ceiling was.

## Schema Impact

Writes to `usage_events` (extended shape, `docs/execution/week3/SCHEMA.md`) and `pipeline_stages`. No new tables.

## Business Logic / State Transition

`paused_gate1 → video_generation` (on approve/edit) and the budget-gate branch to `needs_attention`, per `docs/execution/week3/BUSINESS_LOGIC.md` Section 1. `video_generation → video_review` on success.

### Reference
`docs/execution/week3/BUSINESS_LOGIC.md` Sections 1–2.

## Implementation

### Files to Create
- `studio/src/agents/video-generation/index.ts` (or equivalent, matching Week 2's module convention).

### Files to Modify
- Orchestrator's stage-runner — wire `paused_gate1 → video_generation` and the budget-gate branch.

### Detailed Steps
1. Confirm Task 1 is complete.
2. Implement the budget-gate check (near-identical to Week 2 Task 4's, same `AgentQuota` row, now checked before this stage too).
3. Call `synthesizeSpeech` on the sanctioned script text.
4. Call `transcribe` on the synthesized audio for word-level caption timing (re-transcribe rather than reuse the script's own caption text/timing estimate, per Task 8's reasoning on timestamp accuracy).
5. Assemble via FFmpeg: background/template visual + burned captions + brand overlay.
6. Write the aggregated `UsageEvent` row and the stage output.

### Integration Points
Depends on Task 1's `studio/src/media/` and Week 2's `AgentQuota`/`UsageEvent` pattern. Feeds Task 3 (Video Intelligence).

## Testing

### Test Commands
```bash
npm run build
npm run lint
npm run typecheck
npx tsx scripts/dry-run.ts   # extend the Week 2 fixture through video_generation
```

### Expected Results
- TypeScript compilation: No errors
- ESLint: No warnings
- A dry run produces a real, playable vertical video file with audible voiceover and burned captions.
- The budget-gate path (zeroed/exhausted `AgentQuota`) routes to `needs_attention` before any TTS call happens — verify this explicitly, same reasoning as Week 2 Task 4.

### How to Verify
1. Run all test commands above.
2. Actually watch the produced video — confirm captions are synced, audio is audible, brand overlay appears.
3. Query `usage_events` and confirm one aggregated row with a sane `costUsd` and a `metadata` breakdown.

## Additional Notes

Real money again (OpenAI this time, not Anthropic) — prefer a small number of full real runs over repeated iteration; iterate the FFmpeg assembly logic against a previously-generated audio file/transcript rather than re-calling TTS every time you tweak the video layer.

## Links & References
- [AGENT_FLEET_DESIGN.md](../../design_doc/agents/all_agents/AGENT_FLEET_DESIGN.md) — Section 4.6
- [docs/execution/week1/reports/task8.md](../../week1/reports/task8.md)
- [docs/execution/week3/SCHEMA.md](../SCHEMA.md), [BUSINESS_LOGIC.md](../BUSINESS_LOGIC.md)
- [docs/execution/week3/tasks/task1.md](task1.md)
