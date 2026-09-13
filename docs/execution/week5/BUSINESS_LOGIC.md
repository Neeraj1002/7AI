# Week 5 Business Logic Delta

**Status**: Task 1 verifies Week 1-4's existing transition table against real credentials — no new
states, no new transitions. Task 2 adds real control-flow changes: a new automatic-resume decision
(stale vs. resumable), and stage-completion writes that are now atomic rather than two independent
writes. Task 3 adds a new automatic-resume behavior for `paused_gate1`/`paused_gate2` (previously
untouched by `resumeOnStartup()` at all) and a new, independent notification-only check — no new
`PipelineRun`/`PipelineStage` states either. Task 4 adds no new states/transitions either — it
changes what a budget check considers (per-channel, not just pooled) and what Script Review's output
carries (`factualConcerns`), plus a model-tier fix and a test harness that touch no control flow at
all. Task 5 also adds no new states/transitions: D1 only adds a metering side-effect to an existing
stage; D2 changes what data flows from Gate 2's `approve` outcome into Publishing (a real
`privacyStatus`, not a hardcoded constant), not which transitions fire.

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

## Task 4 — Fact-check flagging, fair budget allocation, model-tier cleanup, a real test harness

No transition-table changes at all. Four independent deltas:

### C1 — Intake-parsing's model tier
`resolvePurpose('intake-parsing')` now resolves to `claude-haiku-4-5` instead of `claude-sonnet-5` —
a cost/quality change, not a control-flow one. `runIntakeStage`'s transitions are unchanged.

**Real finding surfaced while verifying this, out of scope to fix here**: `runIntakeStage` never
calls `insertUsageEvent` — Intake's real spend has never been recorded in `UsageEvent`, unlike every
other stage. This means the pool-level budget check (`sumUsageCostForTenantPlatform`, used by C2's
`isBudgetAvailable` below) has always undercounted real spend by however much Intake actually costs.
Flagged as a new tech-debt item in `KNOWN_ISSUES_AND_BLOCKERS.md` Section 3, not fixed in this task.

### C2 — Per-channel budget fairness (new decision inside the existing budget gate)
`isBudgetAvailable` gains a `channelId` parameter and a second condition. Previously: refuse only if
the pool total (`sumUsageCostForTenantPlatform`) meets or exceeds `AgentQuota.budgetCeilingUsd`. Now:
refuse if **either** that pool check fails **or** this channel's own spend
(`sumUsageCostForTenantChannelPlatform`) meets or exceeds its computed effective ceiling
(`computeChannelBudgetCeilings` — equal split by default, `Channel.budgetOverrideUsd` if set). Both
call sites in `state-machine.ts` (video-generation budget gate, per `week2/BUSINESS_LOGIC.md`
Section 2) pass `channel.id` now. The refusal message changed to name both possible causes ("the
pooled budget ceiling or this channel's own effective ceiling would be exceeded") since a caller can
no longer assume pool-exhaustion was the reason. No new `PipelineRun`/`PipelineStage` transition —
this only changes what causes the existing budget-refusal escalation to fire.

### C3 — Script Review's `factualConcerns`
Purely additive to `ScriptReviewOutputSchema`'s output shape and the `ReviewLog.rationale` text
built in `runScriptReviewStage`'s success transaction — no new transition, no new stage, no new
`purpose`. The existing `script_review → paused_gate1` (pass) / `script_review → script_generation`
(fail, regen) transitions are unchanged; only the rationale a human sees at Gate 1 gained an extra,
clearly-labeled ("plausibility check, not verified") sentence when the model flags something.

### C4 — Test harness
No runtime behavior at all — `vitest` and four test files exercise existing pure functions in
isolation. Zero effect on any `PipelineRun`/`PipelineStage` transition.

### Reference
`week2/BUSINESS_LOGIC.md` Section 2 — the existing video-generation budget-gate call site this task
extends, not replaces.

## Task 5 — Meter Intake spend, and privacy as a real per-run choice

No transition-table changes at all. Two independent deltas:

### D1 — Intake metering
`runIntakeStage` gained the same per-attempt metering wrapper every other stage already has: an
`attemptOnce` closure around `intakeProcessor(run.briefText)` that calls `insertUsageEvent` on
success (real `llm.provider`/`llm.model`/`llm.usage`/`llm.costUsd`) and on failure (`getStageErrorContext`
fallback, `costUsd: '0.000000'`, same shape as Script Generation/Review's error path). `parseBrief`
and `stubParseBrief` (`run-pipeline/parse-brief.ts`) both changed their return shape from bare
`IntakeParsed` to `{ output, llm }` to make this possible — `stubParseBrief` fabricates a genuinely
zero-cost `llm` (`model: 'stub'`, 0 tokens, `costUsd: '0.000000'`), not a plausible-looking nonzero
estimate, since `INTAKE_STAGE_STUB=1`'s whole point is a zero-cost dry run. No transition change —
`intake`'s `running → completed`/`needs_attention` outcomes are exactly as before; this only adds a
`UsageEvent` row alongside them.

### D2 — Privacy status as a real per-run Gate 2 choice
`Gate2Outcome`'s `approve` variant gained `privacyStatus?: PrivacyStatus`, resolved by
`parseGate2Reply` itself: `"approve public"`/`"approve unlisted"`/`"approve private"` (exact match,
case-insensitive) resolve to that value; a bare `"approve"` resolves to `DEFAULT_PRIVACY_STATUS`
(`'private'`) — same behavior as before this task for every existing/simple reply. A near-miss like
`"approved public"` does NOT match and falls through to `revise`, same false-positive-avoidance
reasoning as Gate 1's typo'd `"aprove"` — a bad match here would silently publish at an unintended
privacy level.

`runGate2Stage`'s `approve` branch now resolves `privacyStatus` (defaulting if the outcome didn't
set one), stores it in the `gate2` stage's `output` (`{ outcome: 'approve', privacyStatus }`), and —
only when it's not the default — records `{ privacyStatus }` in the `ReviewLog.editedOutput`, same
"audit trail shows what was actually approved, not just approve/reject" pattern Gate 1 already
established for edited scripts. `runPublishingStage` reads `privacyStatus` back off the `gate2`
stage's output (defaulting to `DEFAULT_PRIVACY_STATUS` for any older row that predates this field)
and threads it through `uploadVideo({ ..., privacyStatus })` → `uploadVideoViaProvider`/
`stubUploadVideo`, both of which now honor `params.privacyStatus` instead of a hardcoded constant.

No transition change: `gate2`'s `approve` outcome still leads to `running`/`publishing` exactly as
before — only the data carried alongside that transition (what privacy level Publishing should use)
changed.

**Real, live verification**: a real brief (GPT-6 Astra) went through the entire pipeline for real —
real Intake → Script Generation → Script Review (flagging real, expected factual concerns per C3,
since the model has no way to verify a topic past its training cutoff) → a live Gate 1 approval over
real Telegram → real video generation (hitting a real, unrelated duration-overrun finding — see
`KNOWN_ISSUES_AND_BLOCKERS.md` §3 — resolved by resubmitting with an explicit length constraint) →
real video review (pass) → a live Gate 2 approval (`"Approve public"`, real, over real Telegram,
after actually watching the rendered video) → a real YouTube upload. The resulting video was
confirmed `privacyStatus: 'public'` via a direct YouTube Data API call (not the DB row), with no
burned-in captions (channel's `brandAssets.captionsEnabled` set `false` for this run only, then
restored). A separate fixture run (tiny local test video, `YOUTUBE_STUB=1` for the upload only, to
avoid a second real YouTube artifact) approved with a bare `"approve"` confirmed the default is
still `private` end-to-end, not just in the `parseGate2Reply` unit test.

### Reference
`week5/reports/task5.md` — the full verification trail, including the real `youtubeVideoId`.

## Reference
- `docs/execution/week4/BUSINESS_LOGIC.md` — the transition table this week verifies and extends
