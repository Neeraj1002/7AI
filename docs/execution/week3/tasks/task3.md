# Week 3 Task 3: Video Intelligence Agent (Own-Draft Mode)

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** It defines the Git Workflow (branch/commit/PR steps for this task), the `STATUS.md` update this task must make, and the section structure this file follows. This file states only this task's specifics — the template governs everything else, so don't skip it.

**Objective**: Build Video Intelligence's `own_draft` mode — deterministic checks first, a lightweight multimodal LLM pass only if those pass — gating Gate 2, with a real circuit breaker on the regen loop.
**Duration**: 3–4 hours
**Depends On**: Task 2 (Video Generation — needs a real video to review). The multimodal LLM pass depends on `studio/src/llm/` (Week 2 Task 1) being extended to accept media attachments (see Task Requirement).
**Owning Component**: Video Intelligence agent, `content_source: 'own_draft'`, per `AGENT_FLEET_DESIGN.md` 4.2.
**Success Criteria**: Given a rendered video, runs deterministic checks (duration/aspect-ratio/silence), then a multimodal pass only if those pass; writes a `ReviewLog` verdict; regen loop is capped and actually enforced.

## Task Requirement

**Architecture call, flagged for confirmation**: the original decision doc (`docs/decisions/LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md`) said media *generation* doesn't belong in `studio/src/llm/` — a different contract shape (job/asset vs. chat completion). This task is media *analysis* (frame/audio in, structured judgment out), which is shaped exactly like Script Review's call, not like Video Generation's. Recommendation: extend `studio/src/llm/`'s `LLMMessage` type to support a media attachment (image frame or audio reference) alongside text, and add `video-intelligence-own-draft` as a new `Purpose` (already anticipated in `studio/src/llm/types.ts`'s comments from Week 2 Task 1) — rather than building a second, separate multimodal contract for one call site. If this call needs something the AI SDK's `generateText` genuinely can't express for multimodal input, fall back to a narrowly-scoped exception and document why in the report; don't build a whole parallel layer speculatively.

`AGENT_FLEET_DESIGN.md` 4.2's own open question — "how much of the own-draft rubric can be deterministic... vs. genuinely needs the multimodal LLM pass" — is resolved here: deterministic checks run first and gate the (materially more expensive) multimodal pass, so a video that's obviously wrong (wrong aspect ratio, way too long, dead silent) never reaches the LLM at all.

### Context
`AGENT_FLEET_DESIGN.md` Section 4.2 (mission, cost notes, MVP status, open questions), Section 8.6 (circuit breaker). `docs/execution/week3/BUSINESS_LOGIC.md` Section 3.

### Acceptance Criteria
- [ ] Deterministic checks run first, via `ffprobe`/FFmpeg (duration vs. platform limit, aspect ratio = 9:16, a silence-detection pass) — zero LLM cost, zero `UsageEvent` row for this part.
- [ ] Only if deterministic checks pass does the multimodal LLM pass run, via `studio/src/llm/` with `purpose: 'video-intelligence-own-draft'` — cheap/fast tier per `AGENT_FLEET_DESIGN.md` 8.1.
- [ ] A failing deterministic check produces a `fail` verdict with specific rationale (e.g. "aspect ratio 16:9, expected 9:16") without ever calling the LLM — this is the cost-gate behavior the task exists to prove.
- [ ] Writes a `ReviewLog` row (`agent = 'video-intelligence-own-draft'`, `verdict` = `pass`/`fail`, `rationale` = fix notes), mirrored into `pipeline_stages.output` (`stageName = 'video_review'`).
- [ ] Writes its own `UsageEvent` row only when the multimodal pass actually ran (a deterministic-only fail has no LLM cost to meter).
- [ ] The regen-loop circuit breaker is real: counts prior `video_generation` attempts for the run via `pipeline_stages.attemptNumber` (no new field), caps at `MAX_VIDEO_REGEN_ATTEMPTS` (proposed `2`, per `docs/execution/week3/BUSINESS_LOGIC.md` Section 1 — confirm or adjust in the report), routes to `needs_attention` once hit.

## Schema Impact

None new. Writes to `review_logs`, conditionally to `usage_events`. Possibly extends `studio/src/llm/types.ts`'s `LLMMessage`/`Purpose` (see Task Requirement).

## Business Logic / State Transition

`video_generation → video_review`, then the pass/fail/circuit-breaker branch to `paused_gate2` / `video_generation` (regen) / `needs_attention`, per `docs/execution/week3/BUSINESS_LOGIC.md` Section 1.

### Reference
`docs/execution/week3/BUSINESS_LOGIC.md` Sections 1, 3.

## Implementation

### Files to Create
- `studio/src/agents/video-intelligence/index.ts` (or equivalent).

### Files to Modify
- `studio/src/llm/types.ts`/`registry.ts` — add `video-intelligence-own-draft` purpose and (if needed) a media-attachment field on `LLMMessage`.
- Orchestrator's stage-runner — wire the pass/fail/circuit-breaker branching.

### Detailed Steps
1. Confirm Task 2 is complete and produces a real video to check.
2. Implement deterministic checks (`ffprobe` for duration/aspect-ratio, FFmpeg `silencedetect` for silence).
3. Extend `studio/src/llm/` for the multimodal call if deterministic checks pass.
4. Implement the circuit breaker: count `video_generation` attempts for this run, compare to `MAX_VIDEO_REGEN_ATTEMPTS`.
5. Write `ReviewLog`, conditionally `UsageEvent`, and advance the state per the branch taken.

### Integration Points
Depends on Task 2's output and (for the multimodal pass) Task 1/Week 2 Task 1's `studio/src/llm/`. Feeds Task 4 (Gate 2).

## Testing

### Test Commands
```bash
npm run build
npm run lint
npm run typecheck
npx tsx scripts/dry-run.ts   # extend the fixture through video_review, both pass and fail paths
```

### Expected Results
- TypeScript compilation: No errors
- ESLint: No warnings
- A video failing a deterministic check (e.g. force wrong aspect ratio in a test fixture) fails without any LLM call or `UsageEvent` row.
- A video passing deterministic checks gets a real multimodal pass and a `UsageEvent` row.
- Forcing repeated fails past `MAX_VIDEO_REGEN_ATTEMPTS` routes to `needs_attention`, not an infinite loop — verify this explicitly, it's the actual point of the circuit breaker.

### How to Verify
1. Run all test commands above.
2. Deliberately trigger both a deterministic-only fail and a full pass, confirm `usage_events` reflects the difference correctly (no row vs. a row).
3. Deliberately exceed the regen cap in a test run and confirm `needs_attention`, not a fourth `video_generation` attempt.

## Additional Notes

This task's circuit breaker is the first time Week 1's scaffolded-but-unexercised regen-loop cap (`docs/execution/week1/BUSINESS_LOGIC.md` Section 4) actually runs for real — worth a specific callout in the report confirming it behaves as originally intended, or noting what had to change.

## Links & References
- [AGENT_FLEET_DESIGN.md](../../design_doc/agents/all_agents/AGENT_FLEET_DESIGN.md) — Sections 4.2, 8.1, 8.6
- [docs/execution/week3/BUSINESS_LOGIC.md](../BUSINESS_LOGIC.md) — Sections 1, 3
- [docs/execution/week1/BUSINESS_LOGIC.md](../../week1/BUSINESS_LOGIC.md) — Section 4
- [docs/execution/week3/tasks/task2.md](task2.md)
