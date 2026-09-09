# Week 4 Task 3: Performance Analytics Agent

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** It defines the Git Workflow (branch/commit/PR steps for this task), the `STATUS.md` update this task must make, and the section structure this file follows. This file states only this task's specifics — the template governs everything else, so don't skip it.

**Objective**: Basic polling/logging of published videos' performance — views/likes/comments always, watch-time/retention if the OAuth scope allows — no dashboard, just the data accumulating from day one.
**Duration**: 2–3 hours
**Depends On**: Task 2 (needs a real `youtubeVideoId` to poll).
**Owning Component**: Performance Analytics agent, per `AGENT_FLEET_DESIGN.md` 4.8.
**Success Criteria**: A `PerformanceSnapshot` row is written immediately after a video publishes, and a periodic poll continues writing snapshots for previously-published videos on a schedule.

## Task Requirement

Explicitly "basic polling/logging only" per 4.8's MVP status — no dashboard, no UI, nothing reading this data back yet (same "written now, consumed later by Continuous Learning" pattern as `ReviewLog`). Don't scope creep toward analytics visualization this task — **note added 2026-09-09**: a real mobile-app dashboard is now being scoped separately (see `docs/design_doc/frontend/` once it exists); this task still only writes the data, it doesn't build anything that reads it.

### Context
`AGENT_FLEET_DESIGN.md` Section 4.8, Section 8.3 ("batch over real-time... Performance Analytics polls on a schedule"). `docs/execution/week4/SCHEMA.md` (the `PerformanceSnapshot` shape, including the nullable watch-time/retention note).

### Acceptance Criteria
- [ ] Migrates `performance_snapshots` per `docs/execution/week4/SCHEMA.md`.
- [ ] Writes one snapshot immediately after Task 2's publish succeeds — this is what advances `PipelineRun.status` to `completed`, per `docs/execution/week4/BUSINESS_LOGIC.md` Section 1.
- [ ] Populates `views`/`likes`/`comments` from the YouTube Data API v3 (`videos.list`, `part=statistics`) — same credentials/scope as Task 2's upload.
- [ ] Attempts `watchTimeMinutes`/`retentionPct` via the YouTube Analytics API only if that scope is already available; leaves them `null` and states so in the report if not — don't block the task on requesting a new scope.
- [ ] A periodic polling mechanism (cron-like, matching the existing "cron + Postgres, no magic" convention — not a new job queue) re-polls every `completed` run's video on a schedule, independent of any single run's state machine.
- [ ] Polling is idempotent and safe to run repeatedly — one new row per poll, no duplicate/overlapping polls for the same video at the same time.

## Schema Impact

New table `performance_snapshots`, per `docs/execution/week4/SCHEMA.md`.

## Business Logic / State Transition

`publishing → analytics → completed` (first snapshot). Ongoing polling afterward is not a state transition — `completed` stays `completed`, per `docs/execution/week4/BUSINESS_LOGIC.md` Section 1.

### Reference
`docs/execution/week4/BUSINESS_LOGIC.md` Sections 1, 3.

## Implementation

### Files to Create
- `studio/src/agents/performance-analytics/index.ts` (or equivalent) — the snapshot logic.
- A scheduled entry point for periodic polling (reuse whatever cron/scheduling convention the Orchestrator already has, don't introduce a new one).
- Migration for `performance_snapshots`.

### Detailed Steps
1. Confirm Task 2 is complete and produces a real `youtubeVideoId`.
2. Migrate `performance_snapshots`.
3. Implement the initial post-publish snapshot, advancing `PipelineRun.status` to `completed`.
4. Implement the periodic poll (Data API always; Analytics API conditionally).
5. Confirm idempotency — running the poll twice in quick succession doesn't double-write or crash.

### Integration Points
Depends on Task 2's `youtubeVideoId`. Nothing downstream consumes `performance_snapshots` yet — same "written now, read later" status as `ReviewLog`.

## Testing

### Test Commands
```bash
npm run build
npm run lint
npm run typecheck
npx tsx scripts/dry-run.ts   # extend the fixture through analytics -> completed
```

### Expected Results
- TypeScript compilation: No errors
- ESLint: No warnings
- A dry run produces a `PerformanceSnapshot` row and `PipelineRun.status = 'completed'`.
- Running the periodic poll twice against the same video doesn't produce inconsistent state.

### How to Verify
1. Run all test commands above.
2. Query `performance_snapshots` and confirm the row's numbers are plausible against the real video's actual YouTube Studio stats (if a real upload happened in Task 2).
3. Confirm the report states clearly whether `watchTimeMinutes`/`retentionPct` were populated or left null, and why.

## Additional Notes

If Task 2 ran against the stub upload path (OAuth still pending), this task's live-polling verification is correspondingly stubbed too — build and test the logic against a fake `youtubeVideoId`, and note both as pending real-credential verification in the report, same as Task 2.

## Links & References
- [AGENT_FLEET_DESIGN.md](../../design_doc/agents/all_agents/AGENT_FLEET_DESIGN.md) — Sections 4.8, 8.3
- [docs/execution/week4/SCHEMA.md](../SCHEMA.md)
- [docs/execution/week4/BUSINESS_LOGIC.md](../BUSINESS_LOGIC.md)
- [docs/execution/week4/tasks/task2.md](task2.md)
