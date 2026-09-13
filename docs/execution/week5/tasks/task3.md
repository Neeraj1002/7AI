# Week 5 Task 3: Make Approval Gates Restart-Safe

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.**

**Objective**: A restart while a run is waiting at `paused_gate1`/`paused_gate2` currently strands it
forever — the DB status is durable, but nothing re-establishes the in-memory pending-reply state
that lets a Telegram reply or an API call actually resolve it. Fix this before deployment makes
unattended restarts a real, expected occurrence rather than something only you trigger on purpose.
**Duration**: 2-3 hours
**Depends On**: Week 5 Task 2 (bug-fix pass) — done.
**Owning Component**: Orchestrator (`run-pipeline/resume-on-startup.ts`)
**Success Criteria**: A run sitting at `paused_gate1`/`paused_gate2` when the process restarts is
automatically re-prompted on boot, and can then be resolved normally (Telegram reply or the app's
gate1/gate2 API call) — not silently stuck until someone notices and manually intervenes.

## Task Requirement

### Root cause, confirmed against current source
- `state-machine.ts` writes `PipelineRun.status = 'paused_gate1'` the moment `script_review` passes
  (line ~355) and `'paused_gate2'` the moment `video_review` passes — both durable, both correct.
- `runGate1Stage`/`runGate2Stage` are then invoked in the same process run (via
  `pipeline-runner.ts`'s driver loop) and block on `founderChannel.requestApproval(...)`.
- `TelegramFounderChannel.requestApproval` (`telegram-channel.ts`) registers the pending reply in an
  **in-memory** `Map` (`pendingByThreadKey`) keyed by the run id. This map is what both a real
  Telegram reply and the API's `resolvePendingApproval` (`api/routers/runs.ts` `gate1`/`gate2`
  mutations) resolve against.
- `resume-on-startup.ts`'s `resumeOnStartup()` only queries `listRunsByStatus('running')`. A run at
  `paused_gate1`/`paused_gate2` is never touched — its DB status is fine, but `pendingByThreadKey` is
  gone (it was only ever in that process's memory), so neither a Telegram reply nor an app tap on
  "Approve" can resolve it anymore. This is exactly what `resume-on-startup.ts`'s own existing
  comment already flags as a deliberate scope boundary — it's time to close it.

### The fix
In `resumeOnStartup()`, alongside the existing `running`-status handling, add a second pass over
`PipelineRun`s with `status IN ('paused_gate1', 'paused_gate2')`. For each: re-invoke the matching
gate function (`runGate1Stage` for `paused_gate1`, `runGate2Stage` for `paused_gate2`) — this
naturally re-sends the Telegram message (re-populating `pendingByThreadKey`) and resumes blocking on
a real reply, restoring both the Telegram and the API resolution paths. Log clearly that this is a
restart re-prompt, not an accidental duplicate approval request — consider whether the re-sent
message itself should say so (e.g. prefix "Re-sending after a restart — ") so it doesn't read as a
confusing repeat to you.

**Idempotency note**: if the process restarts again while still waiting, this same logic should just
re-run cleanly — re-invoking an already-open gate again is safe (it re-sends and re-registers, no
new `PipelineStage` attempt is created since `createStageAttempt` for this gate attempt already
happened before the first block).

### Secondary, smaller addition: a "you haven't answered in a while" nudge
Independent of a restart — if you're just asleep or away, a gate can sit open for hours with no
reminder. Add a scheduled check (same interval pattern `runPeriodicPoll` already uses) that pings
Telegram if a run has been at `paused_gate1`/`paused_gate2` past a configurable threshold (a new env
var, e.g. `GATE_REMINDER_THRESHOLD_MS` — pick a default meaningfully longer than
`RESUME_STALE_WINDOW_MS`, since a human approval legitimately can take hours, unlike an automated
stage). This is a nudge, not a resume — don't re-invoke the gate function here, just notify.

### Acceptance Criteria
- [ ] A fixture `PipelineRun` created directly at `paused_gate1` (mirroring Week 5 Task 2's B2
      fixture-test pattern), with `resumeOnStartup()` called directly (same technique
      `dry-run.ts resume` already uses) — confirm a new Telegram message is sent and
      `peekPendingMessageId(runId)` now returns a real message id (proving the pending state is
      re-established, not just that a message went out).
- [ ] With that re-established pending state, confirm the app's `gate1` API mutation
      (`founderChannel.resolvePendingApproval`) now returns `{ resolved: true }` — proving the full
      round trip works again, not just the notification half.
- [ ] Same test repeated for `paused_gate2`.
- [ ] A second, immediate `resumeOnStartup()` call (simulating a second restart while still pending)
      doesn't create a duplicate `PipelineStage` attempt or otherwise misbehave.
- [ ] The reminder nudge fires when a gate has been open past its threshold, and does **not** fire
      for a gate answered promptly — verify both.
- [ ] `docs/execution/KNOWN_ISSUES_AND_BLOCKERS.md`: remove or update the "restart doesn't reopen a
      gate" characterization wherever it's implied (check `resume-on-startup.ts`'s own comments too —
      update them to reflect the new behavior, don't leave the old scope-boundary comment standing).
- [ ] `docs/execution/week5/SCHEMA.md`/`BUSINESS_LOGIC.md`/`STATUS.md` updated with this task's row
      and the real delta (no schema migration expected — this is behavior, not data shape).

## Testing
```bash
npm run build && npm run lint && npm run typecheck
```
Plus the manual verification above. Same posture as prior Week 5 tasks: no automated test runner
exists project-wide, real/manual verification is the established bar here.

## Report Template
`execution/week5/reports/task3.md`, standard shape — what was done, how verified, deviations.
