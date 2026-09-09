# Week 4 Task 2: Publishing Agent

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** It defines the Git Workflow (branch/commit/PR steps for this task), the `STATUS.md` update this task must make, and the section structure this file follows. This file states only this task's specifics — the template governs everything else, so don't skip it.

**Objective**: Build the Publishing agent — generate optimized title/description/tags, then upload the Gate-2-approved video to YouTube as `private`.
**Duration**: 3–4 hours
**Depends On**: Week 3 complete (a real `videoPath` to publish). **Hard external dependency: Week 1 Task 7's YouTube OAuth setup must be done** — check `docs/execution/week1/STATUS.md` before starting; if it's still `Done — action needed`, this task cannot reach a real upload and should stub that boundary the same way Week 3 stubbed OpenAI (see Additional Notes). Not a hard dependency on Task 1 (video-generation loop fix) — Publishing just needs any `videoPath` — but Task 4's real end-to-end dry run is more meaningful with Task 1 done first, so build in that order if both are ready to start.
**Owning Component**: Publishing agent, per `AGENT_FLEET_DESIGN.md` 4.7.
**Success Criteria**: Given an approved video, produces optimized metadata and uploads it to YouTube as `private`, writing back a real `youtubeVideoId`.

## Task Requirement

**Flagged architecture call**: nothing upstream generates a video title or description — Script Generation only produces script/captions/hashtags. This task adds a small metadata-generation LLM call inside Publishing itself (see `docs/execution/week4/BUSINESS_LOGIC.md` Section 2) rather than pushing that responsibility onto Script Generation — Publishing owns platform-specific optimization per its own mission statement. Confirm this placement makes sense once building it; if it turns out awkward, flag it in the report rather than silently reworking Script Generation's contract.

**Privacy status is hardcoded to `private`** for this task, per the roadmap's explicit instruction to publish unlisted/private first, not public. Don't build a per-channel privacy config this week — a constant is enough, per Principle 10.

### Context
`AGENT_FLEET_DESIGN.md` Section 4.7. `MVP_ROADMAP_OCT15.md` Section 12 (Week 4 target, "publish as unlisted/private first"). `docs/execution/week1/reports/task7.md` (the OAuth setup this depends on). `docs/execution/week4/BUSINESS_LOGIC.md` Section 2.

### Acceptance Criteria
- [ ] Checks `docs/execution/week1/STATUS.md` for Task 7's status before assuming real credentials exist; report honestly if they don't and use the stub path (Additional Notes) instead of blocking.
- [ ] Metadata generation calls `studio/src/llm/` with a new `purpose: 'metadata-generation'` — never a provider SDK directly, same boundary as every other LLM call site.
- [ ] Upload uses the YouTube Data API v3 (`videos.insert`), `privacyStatus: 'private'` hardcoded.
- [ ] Writes `{ youtubeVideoId, privacyStatus }` to `pipeline_stages.output` (`stageName = 'publishing'`).
- [ ] Writes one `UsageEvent` row for the metadata-generation call (existing token-shaped fields, no schema change needed).
- [ ] `PipelineRun.currentStage` advances `publishing → analytics` on success, per `docs/execution/week4/BUSINESS_LOGIC.md` Section 1.
- [ ] Non-transient upload failures (bad credentials, exhausted quota) route to `needs_attention`, not a silent failure or an infinite retry.

## Schema Impact

None directly — writes to `pipeline_stages`/`usage_events` only. Feeds Task 3's `PerformanceSnapshot` via `youtubeVideoId`.

## Business Logic / State Transition

`paused_gate2 → publishing → analytics`, per `docs/execution/week4/BUSINESS_LOGIC.md` Sections 1–2.

### Reference
`docs/execution/week4/BUSINESS_LOGIC.md` Sections 1–2.

## Implementation

### Files to Create
- `studio/src/agents/publishing/index.ts` (or equivalent).

### Files to Modify
- `studio/src/llm/types.ts`/`registry.ts` — add `metadata-generation` purpose.
- Orchestrator's stage-runner — wire `paused_gate2 → publishing` and the transient/non-transient branch.

### Detailed Steps
1. Confirm Week 3 is complete and check Task 7's OAuth status.
2. Add the `metadata-generation` purpose to the LLM registry (mid-tier, per `AGENT_FLEET_DESIGN.md` 8.1).
3. Implement metadata generation: script + hashtags in, `{ title, description, tags }` out.
4. Implement the YouTube upload call, `privacyStatus: 'private'`.
5. Write the `UsageEvent` row and stage output.
6. Wire the transient/non-transient failure branches.

### Integration Points
Depends on `studio/src/llm/` (metadata call) and Week 1 Task 7's OAuth credentials. Feeds Task 3 (Performance Analytics) via `youtubeVideoId`.

## Testing

### Test Commands
```bash
npm run build
npm run lint
npm run typecheck
npx tsx scripts/dry-run.ts   # extend the fixture through publishing
```

### Expected Results
- TypeScript compilation: No errors
- ESLint: No warnings
- A real (or stubbed, per Additional Notes) run produces a `youtubeVideoId` and advances to `analytics`.
- A deliberately invalid-credential test routes to `needs_attention`, not a crash or silent skip.

### How to Verify
1. Run all test commands above.
2. If real credentials are available: check the uploaded video actually appears in YouTube Studio as `private` under the correct channel.
3. If stubbed: confirm the stub path is clearly marked and the report states real upload verification is still pending.

## Additional Notes

**If Week 1 Task 7's OAuth still isn't done**: build this task against a stub upload function (returns a fake `youtubeVideoId`, same env-flag pattern as Week 3's `MEDIA_STUB`) so Task 3/4 aren't blocked by a founder-side Google Cloud step outside Claude Code's control. Flag this clearly in the report — this is exactly the kind of external, non-code blocker Week 1 already flagged as having a 1–2 week lead time, so don't be surprised if it's still open.

## Links & References
- [AGENT_FLEET_DESIGN.md](../../design_doc/agents/all_agents/AGENT_FLEET_DESIGN.md) — Section 4.7
- [docs/execution/week1/reports/task7.md](../../week1/reports/task7.md)
- [docs/execution/week1/STATUS.md](../../week1/STATUS.md)
- [docs/execution/week4/BUSINESS_LOGIC.md](../BUSINESS_LOGIC.md)
- [docs/execution/week4/tasks/task1.md](task1.md) — video-generation loop fix, not a hard dependency but sequenced first if both are ready
