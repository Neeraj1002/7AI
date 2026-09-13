# Week 5 Business Logic Delta

**Status**: Task 1 verifies Week 1-4's existing transition table against real credentials — no new
states, no new transitions. Task 2 adds real control-flow changes: a new automatic-resume decision
(stale vs. resumable), and stage-completion writes that are now atomic rather than two independent
writes. Task 3 adds a new automatic-resume behavior for `paused_gate1`/`paused_gate2` (previously
untouched by `resumeOnStartup()` at all) and a new, independent notification-only check — no new
`PipelineRun`/`PipelineStage` states either.

## Implementation Reconciliation (added by Task 1)

- **A real, live end-to-end run reached `completed` for the first time**: real Anthropic calls
  (intake, script generation, script review, production planning, video review, metadata
  generation), real OpenAI TTS/transcription, real Pexels stock footage, both approval gates
  answered live by the founder over real Telegram, and a real private YouTube upload — confirmed
  directly via the YouTube Data API (`privacyStatus: "private"`), not inferred from a DB row. See
  `reports/task1.md` for the full evidence trail.
- **A real gap found in `runPeriodicPoll` (Week 4 Task 3)**: it iterated every "completed run with
  a published video" target without a per-target try/catch, so the first old run whose
  `youtubeVideoId` was a Week 4 stub value (`stub-...`, no longer a valid video once real
  credentials are in use) threw and aborted the entire poll tick — silently starving every other,
  genuinely real video of its snapshot. Fixed: each target's `recordSnapshot` call is now
  individually caught and logged, so one bad historic target no longer blocks the rest. This is
  exactly the kind of gap that only shows up once stub-completed data and real polling coexist —
  never hit in Week 4's testing since everything there was uniformly stubbed.
- **A real process-contention finding**: a persistent `npm run dev` instance (the actual
  orchestrator, already running with its own Telegram long-polling loop) conflicts with
  `dry-run.ts`'s one-off gate commands, which start a second competing long-poll for the same bot
  token — Telegram allows only one active `getUpdates` poller per token. Not a code bug (both are
  legitimate ways to run the app); a testing-methodology note: `dry-run.ts`'s live gate commands
  and a persistent `npm run dev` instance cannot coexist against the same bot token. Worth deciding
  later whether `dry-run.ts` should detect and defer to an already-running instance rather than
  requiring it to be stopped first.

## Task 2 — Bug-fix & hardening pass (B1-B5)

Real control-flow deltas against `week4/BUSINESS_LOGIC.md`'s transition table:

### B1 — Atomic stage-completion writes
Every stage function's "mark this stage complete, advance (or escalate) the run" pair now commits
as one Prisma interactive transaction (`prisma.$transaction`), not two independent `await`s. Where
a `ReviewLog` insert sits between them (script_review, gate1, video_review, gate2), it's included
in the same transaction — the whole "this stage's outcome is now durable" unit commits or rolls
back together. No transition table entry changes; this only removes a window where `currentStage`
could lag what `pipeline_stages` shows after a crash.

### B2 — Resume staleness gate (new decision point)
`resumeOnStartup()` gains a real branch, evaluated before the existing running/completed dispatch:
a `PipelineRun` whose latest stage hasn't changed in longer than `RESUME_STALE_WINDOW_MS` (default
30 minutes) is **not** auto-resumed. Instead:

| From | Event | To |
|---|---|---|
| `running` (any stage, latest-stage age > `RESUME_STALE_WINDOW_MS`) | Process restart / `resumeOnStartup()` | `needs_attention`, `lastError` prefixed `[stale-resume-skip]` |

This is a new, distinctly-tagged escalation reason — deliberately not reusing the budget-gate or
circuit-breaker `lastError` shapes, so a human (or a future dashboard) can tell "this looked
abandoned" apart from "this genuinely failed."

### B3 — No transition change
Retry-wrapping Video Intelligence's multimodal call doesn't change `video_review`'s pass/fail/regen
transitions — a transient failure now retries before those transitions are even reached; the
transitions themselves (pass → `paused_gate2`, fail-under-cap → regen, fail-over-cap →
`needs_attention`) are unchanged.

### B4 — No transition change, narrower failure classification
`publishing`'s "upload fails (non-transient)" row in `week4/BUSINESS_LOGIC.md` Section 1 now covers
a wider set of real-world failures (any ambiguous upload error, not just a clean 4xx) — the
transition itself (→ `needs_attention`) is unchanged; only which failures land there changed.

### B5 — No transition change, new per-channel behavior
`captionsEnabled: false` changes what Video Generation *renders*, not the state machine — same
`video_generation → video_review` transition either way. Video Intelligence's multi-frame sampling
changes how a `pass`/`fail` verdict gets decided, not the transition table itself.

## Task 3 — Restart-safe approval gates (B6)

### What this task implements
`resumeOnStartup()` gains a second pass (`reopenPausedGates`), independent of the existing
running-run pass: for every `PipelineRun` at `paused_gate1`/`paused_gate2`, it re-invokes
`runGate1Stage`/`runGate2Stage` respectively. This doesn't change the transition table — `paused_gate1
→ running` (via approve/edit) or `paused_gate1 → failed` (via reject) still happen exactly as
`week2/BUSINESS_LOGIC.md`/`week3/BUSINESS_LOGIC.md` already document — it only re-establishes the
in-memory pending-reply state (`pendingByThreadKey`, `telegram-channel.ts`) that makes those
transitions reachable again after a crash.

### Preconditions
A `PipelineRun` whose `status` is `paused_gate1`/`paused_gate2` — durable from whenever
`script_review`/`video_review` set it, regardless of how many process restarts happen while it
waits.

### Postconditions
Exactly one `running`-status `gate1`/`gate2` `PipelineStage` attempt exists per gate opening, no
matter how many restarts occur while it's pending — `runGate1Stage`/`runGate2Stage` reuse the
existing attempt (`isRestartReopen` check against `findLatestAttempt`) rather than creating a new
one each time. A fresh Telegram message is sent on each reopen (prefixed to say so), and
`pendingByThreadKey` always reflects the *latest* reopen — an older, still-in-flight
`runGate1Stage`/`runGate2Stage` call from a prior reopen (same process) has its promise superseded,
not resolved, if a second reopen races it; see Deviations in `reports/task3.md`.

### Failure Modes & Handling
An error inside a re-invoked `runGate1Stage`/`runGate2Stage` call (fire-and-forget from
`resumeOnStartup()`) is caught and logged, not thrown — it must never crash `resumeOnStartup()`
itself, since that call also gates the rest of `main()`'s boot sequence (Telegram receive loop, API
server). The gate-reminder nudge (`gate-reminder.ts`) is notification-only and never touches
`PipelineRun`/`PipelineStage` state — a failed `notify()` call is caught and logged per-run, never
fatal to the check tick.

### Reference
Full state machine and control-flow rules live in `week2/BUSINESS_LOGIC.md` (gate1),
`week3/BUSINESS_LOGIC.md` (gate2) — this task only restores reachability, not the rules themselves.

## Reference
- `docs/execution/week4/BUSINESS_LOGIC.md` — the transition table this week verifies and extends
