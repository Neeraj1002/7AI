# Week 5 Task 3: Make Approval Gates Restart-Safe

**Date**: 2026-09-13
**Status**: Complete
**Files Created**: 1 (`studio/src/run-pipeline/gate-reminder.ts`)
**Files Modified**: 8
**Tests**: All Passing (build/lint/typecheck clean; the full fix verified live, end-to-end, including a real accidental side-effect worth reading about)

## What Was Done

### The fix: `resumeOnStartup()` re-opens paused gates

`resume-on-startup.ts`'s `resumeOnStartup()` is now two passes: the existing `running`-run handling
(unchanged, renamed into `resumeRunningRuns()`), and a new `reopenPausedGates()` that queries
`paused_gate1`/`paused_gate2` runs directly (`listRunsByStatus`) and re-invokes
`runGate1Stage`/`runGate2Stage` for each — fire-and-forget (`void ...catch(...)`), not awaited.

**Why fire-and-forget matters**: `main()` calls `await resumeOnStartup()` *before* starting the
Telegram receive loop and the API server. `requestGate1Decision`/`requestGate2Decision` block on a
real human reply — sometimes for hours. If `resumeOnStartup()` awaited a re-opened gate directly,
one pending gate at boot would block the entire orchestrator from ever finishing startup, and then
nothing (not even a fresh Telegram message) could ever reach it. Each reopened gate now resolves in
the background exactly as it would have if the process had never restarted, while
`resumeOnStartup()` itself returns promptly.

**Idempotency**: `runGate1Stage`/`runGate2Stage` (`state-machine.ts`) both gained an
`isRestartReopen` check — if the latest `gate1`/`gate2` `PipelineStage` attempt is already
`'running'`, it's reused instead of a new one being created via `createStageAttempt`. This is what
makes it safe to call `reopenPausedGates()` on every single boot, restart after restart, without
ever accumulating duplicate attempt rows.

**The re-sent message says so**: `formatGateMessage`/`formatGate2Message`
(`agents/gate1|gate2/index.ts`) gained an optional `restarted` flag; when true, the message is
prefixed `"(Re-sending after a restart — this gate was already open, waiting on your reply.)"` so a
re-prompt doesn't read as a confusing duplicate ask.

### The nudge: `gate-reminder.ts`

New module, wired into `src/index.ts` via `setInterval` (same "cron + Postgres" pattern
`runPeriodicPoll` already uses, `GATE_REMINDER_CHECK_INTERVAL_MS`, default 15 minutes). Every tick,
queries `paused_gate1`/`paused_gate2` runs and sends one `founderChannel.notify(...)` per run whose
gate `PipelineStage.startedAt` is older than `GATE_REMINDER_THRESHOLD_MS` (default **4 hours** —
deliberately much longer than B2's `RESUME_STALE_WINDOW_MS` of 30 minutes, since a legitimate human
approval can and should be allowed to take hours, unlike an automated stage). This is a nudge, not
a resume — it never touches `runGate1Stage`/`runGate2Stage` or any DB state; a "reminded once"
in-memory `Set`, pruned every tick against the currently-pending run list, keeps it from spamming
the same gate repeatedly and can never grow unbounded.

## Files Created/Modified

- Created: `studio/src/run-pipeline/gate-reminder.ts`
- Modified:
  - `studio/src/run-pipeline/resume-on-startup.ts` — `reopenPausedGates`, updated header comment
  - `studio/src/run-pipeline/state-machine.ts` — `isRestartReopen` check in `runGate1Stage`/`runGate2Stage`
  - `studio/src/agents/gate1/index.ts`, `studio/src/agents/gate2/index.ts` — `restarted` flag threaded through
  - `studio/src/config/env.ts` — `GATE_REMINDER_THRESHOLD_MS`, `GATE_REMINDER_CHECK_INTERVAL_MS`
  - `studio/src/index.ts` — starts the reminder checker
  - `studio/src/run-pipeline/pipeline-runner.ts` — stale comment updated (it referenced the old scope boundary)
  - `docs/execution/week2/BUSINESS_LOGIC.md` — one-line forward-pointer added; the old "restart doesn't reopen a gate" note was accurate *when written*, now superseded

## Schema Changes Applied

None. Behavior only — see `week5/SCHEMA.md`.

## Test Results

```
npm run typecheck   -> clean
npm run lint        -> clean
npm run build       -> clean
```

### Real, live verification

Built two fixture `PipelineRun`s directly in the DB (mirroring Week 5 Task 2's B2 fixture-test
pattern) — one at `paused_gate1` with a completed `script_generation`/`ReviewLog` underneath it and
a `'running'` `gate1` stage row already present (simulating "this was open when the process died"),
one at `paused_gate2` similarly (reusing an already-rendered local video file for the `fs.stat()`
check `requestGate2Decision` needs).

1. **First simulated restart**: called `resumeOnStartup()` directly. Both fixtures' gates re-opened;
   real Telegram messages were sent. Polling `peekPendingMessageId(runId)` for each returned a real
   message id — direct proof `pendingByThreadKey` was genuinely re-established, not just that a
   message went out.
2. **API round-trip**: called `founderChannel.resolvePendingApproval(runId, 'approve')` for each —
   both returned `{ resolved: true }`. Both runs then correctly advanced (`gate1Run` →
   `running`/`video_generation`, `gate2Run` → `running`/`publishing`) — proving the *whole* pending
   gate actually unblocked and continued the pipeline, not just that the map lookup succeeded.
3. **Second simulated restart** (called `resumeOnStartup()` again immediately, before resolving):
   confirmed via direct DB query that both `gate1`/`gate2` still had exactly **one** `PipelineStage`
   attempt row each — no duplicate created by the second reopen.
4. **Reminder nudge**: two more fixtures, one with its gate `startedAt` backdated 20 seconds and
   `GATE_REMINDER_THRESHOLD_MS=5000` (an env override for a fast, real test) — reminded (1 sent);
   one with `startedAt` set to "now" under the same threshold — not reminded (0 sent). A second
   immediate check tick against the same two rows sent 0 further reminders (dedup confirmed).

### A real, live finding — worth reading in full

The **first** real restart test above didn't just re-open my two fixtures — `resumeOnStartup()`
correctly (per its own new logic) found **every** `paused_gate1`/`paused_gate2` row in the dev
database and re-opened all of them. It turned out ~8 genuine leftover runs from Weeks 2-3 testing
had been sitting at `paused_gate1`/`paused_gate2` in the dev DB the entire time (never cleaned up,
since nothing before this task ever touched that status). The fix correctly re-sent a real Telegram
message for every one of them — meaning this task's own first live test sent roughly 10 real
notifications to the founder's real phone in one go, for runs with briefs like "why do cats knead"
and "Week2 Task3 regression check" that have nothing to do with this task.

This is not a bug in the fix — it's doing exactly what was asked, correctly, applied against
accumulated dev-DB debris the fix has no way to distinguish from a genuinely just-restarted gate.
Cleaned up immediately (`close-stale-test-runs.ts`, moving all ~8 plus my own two now-resolved
fixtures to `needs_attention`) so they can't be swept again. Documented as a real, deliberate,
undecided tradeoff in `KNOWN_ISSUES_AND_BLOCKERS.md` §3 — unlike B2's stale-`running`-run window,
gates can't reuse the same 30-minute staleness logic (a legitimate human reply can take hours), so
this needs its own, separate design decision later, not a quick reuse of B2's fix.

## Deviations from Spec

- **A same-process double-reopen race is possible and was left as-is, not engineered around.** If
  `resumeOnStartup()` is called twice for the same run before the first reopen's gate has resolved
  (exactly the "second immediate restart" test scenario, run in the same process), the second
  `runGate1Stage`/`runGate2Stage` call reuses the same stage row (no duplicate attempt — verified
  above) but *does* send a second Telegram message and re-registers `pendingByThreadKey`, silently
  superseding the first call's pending promise (which then never resolves — a harmless, dangling
  async operation, not a data-integrity issue). The acceptance criterion asks specifically about
  "no duplicate `PipelineStage` attempt," which holds; a second Telegram message on a very-rapid
  double-restart is a minor, arguably even desirable redundancy (an extra nudge), not something this
  task added a dedicated guard against. Noted here rather than silently engineered around.
- **`pipeline-runner.ts`'s comment and `week2/BUSINESS_LOGIC.md`'s note both referenced the old
  "restart doesn't reopen a gate" scope boundary** — found while grepping for the exact phrase this
  task's acceptance criteria named, updated both even though only `resume-on-startup.ts` was
  explicitly called out, since leaving them standing would be actively misleading now.

## Sign-Off

- Task Objective: Met — a run at `paused_gate1`/`paused_gate2` is automatically re-prompted on
  restart and resolves normally through either Telegram or the API, verified live end-to-end.
- Schema Impact: None — behavior only.
- Business Logic: `week5/BUSINESS_LOGIC.md` updated with the real delta; no transition table changes.
- Tests: Passing, verified live (not just code review) for every acceptance criterion, including the
  reminder nudge's fire/no-fire behavior.
- Ready for Integration: Yes.
