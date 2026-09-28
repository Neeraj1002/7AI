# Sprint 3 Backend Task 11: UI Enhancement 3 — Backend Requirements (Run Lifecycle: Publish-on-Approval, Gate Decision Fields, Cancel Running, Run Again)

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.**

Condensed copy of the task as issued (2026-09-28). Branch: `UIENHANCEMENT3_BE` (own branch). Depends on Tasks 8/9
merged (confirmed). Source spec: the UI/UX track's `tasks/task6.md` (uncommitted, in the `D:\Study Material\7AI-UI`
worktree at the time this task started — its own Task 6 row states the exact B11–B14 items below).

Four run-lifecycle backend gaps: (1) a Gate 2 approval actually publishes without a server restart, (2) the app can
reliably tell what happened at a gate and why a run ended, (3) a running run can be cancelled, (4) a dead-end run
(rejected/cancelled/failed) can be re-run.

Owning Component: `studio/src/api/routers/runs.ts`, `studio/src/run-pipeline/pipeline-runner.ts`. `state-machine.ts`
is read-only reference (gate1/gate2 output shapes read, not changed).

## R1 (B14) — make a Gate 2 approval actually publish, no restart needed
- `pipeline-runner.ts`'s `driveFromCurrentStage` switch gains `case 'publishing'`/`case 'analytics'` — the loop
  previously stopped dead at `'publishing'` (confirmed: only `resume-on-startup.ts`'s `STAGE_RESUMERS` map ever
  called `runPublishingStage`/`runAnalyticsStage`, only once, at the next process boot). Also closes Task 9/R2's
  Gate-2-off auto-approve path (same loop) — no second fix needed.
- A 10-minute stall guard on `runPublishingStage` specifically (races the real call against a timer; doesn't cancel
  it — `runPublishingStage` already checkpoints `youtubeVideoId` before any re-upload, so a stalled-then-late call
  is safe to leave running).
- Verify: live, no restart — approve Gate 2 for a real run, confirm it reaches `publishing` → `analytics`/`completed`
  with a real `youtubeVideoId`. Re-confirm the existing resume-on-restart path is unchanged.

## R2 (B13) — `lastGateDecision` + `endReason` on `runs.get`
- `lastGateDecision: { gate, outcome, privacyStatus?, reason?, notes?, decidedAt } | null` — normalizes gate1/gate2's
  three different raw field names (`reason`/`privacyStatus`/`notes`) into one consistent shape, from the latest
  completed gate1/gate2 stage row.
- `endReason: 'rejected' | 'cancelled' | 'failed' | 'channel_deleted' | null` — derived from `run.status`/`lastError`
  string-matching (`"Rejected at Gate 1"`/`"Rejected at Gate 2"` prefix → `'rejected'`; `'Cancelled by user'` exact →
  `'cancelled'`; `'Channel deleted'` exact → `'channel_deleted'`; any other `'failed'` → `'failed'`; else `null`).
  Known fragility: a future change to any of those exact strings silently breaks this — stated plainly, not hidden.
- Verify: rejected at Gate 1, rejected at Gate 2, cancelled, archived mid-run, genuine regen-cap `needs_attention` —
  confirm `runs.get`'s two new fields for each, cross-checked against Postgres.

## R3 (B11) — cancel a run that's currently running
- `runs.cancel` also accepts `'running'`.
- A cancellation-request registry — none exists today. In-memory (same "in-process state" precedent
  `notifications/pending-approvals.ts` already uses), a cancel request lost on restart is acceptable (the run just
  resumes normally; the founder can cancel again).
- `runs.cancel` on `'running'`: records the request, returns `{ cancelled: true }` immediately, doesn't block on the
  loop actually stopping.
- `pipeline-runner.ts`'s loop checks the registry once per iteration (same point `failRunIfChannelArchived` already
  checks). A pending cancel: stop the loop, `status: 'failed', lastError: 'Cancelled by user'` (same exact string
  R2/B13's `endReason` derivation matches on).
- A stage already mid-flight when the cancel lands is allowed to finish and persist its own stage-row history; the
  loop just doesn't act on it to advance further.
- Verify: cancel a run genuinely mid-`video_generation`; confirm it lands on `failed`/`'Cancelled by user'` without
  ever reaching `video_review`, no further spend after the cancel is recorded.

## R4 (B12) — `runs.rerun`
- `runs.rerun({ runId })`: same ownership check as `retry`/`cancel`. Looks up the source run's
  `channelId`/`briefText`/`creationOptions`, calls the exact same `createRun` + `startPipelineInBackground` path
  `create` uses. Reuses `create`'s own channel checks (archived, not connected to YouTube) rather than
  re-implementing them.
- `creationOptions` added to `runs.get`'s response (same `getRunDetail` function R2/B13 also touches — coordinate).
- Verify: rerun a completed/rejected/cancelled run; confirm the new run's `briefText`/`creationOptions` match the
  source exactly (Postgres cross-check). Confirm rerunning against an archived/disconnected channel is rejected
  with the same messages `runs.create` already gives.

## R5 (optional) — light `runs.progress`
`runs.progress({ runId })` → `{ stage, attemptNo, pct? }`. Build only if time remains; note in the report either way.

## Schema Impact
None expected — `lastGateDecision`/`endReason`/`creationOptions` computed at read time; the cancellation registry
(if in-memory) needs no migration.

## Report
`docs/execution/sprint3/reports/task11.md`; state per item which app flag it unblocks (`cancelRunning` for
R3/B11, `runAgain` for R4/B12, `gateOutcomeFields` for R2/B13 — R1/B14 unblocks no flag directly, it's the
"Uploading to YouTube" screen's own correctness).

## Links & References
- `docs/execution/ui-ux/STATUS.md` (Task 6 row), `docs/execution/ui-ux/tasks/task6.md` — the source UI spec
- `docs/execution/sprint3/tasks/task8.md`, `tasks/task9.md` — the prior UI-Enhancement-driven backend tasks
- `docs/execution/bugs/tasks/task8.md` (R1) — the "not connected to YouTube" channel check R4/B12 reuses
