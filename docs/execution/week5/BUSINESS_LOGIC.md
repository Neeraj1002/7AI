# Week 5 Business Logic Delta

**Status**: Task 1 verifies Week 1-4's existing transition table against real credentials — no new
states, no new transitions. Task 2 adds real control-flow changes: a new automatic-resume decision
(stale vs. resumable), and stage-completion writes that are now atomic rather than two independent
writes.

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

## Reference
- `docs/execution/week4/BUSINESS_LOGIC.md` — the transition table this week verifies and extends
