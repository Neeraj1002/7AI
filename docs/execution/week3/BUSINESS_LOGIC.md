# Week 3 Business Logic Delta

**Status**: Real new control flow — the pipeline advances past `paused_gate1` for the first time, `PipelineRun.status = 'paused_gate2'` (defined in Week 1's enum, unused until now) becomes real, and the video-generation → video-review regeneration loop (scaffolded conceptually in Week 1, `docs/execution/week1/BUSINESS_LOGIC.md` Section 4, with no loop to exercise yet) becomes real for the first time.

## 1. Stage sequence (Week 3 subset)

Extends Week 2's transition table (`docs/execution/week2/BUSINESS_LOGIC.md` Section 1):

| From | Event | To |
|---|---|---|
| `paused_gate1` | Founder approves/edits (Week 2 Task 6) | `running`, `currentStage = video_generation` |
| `running` (video_generation) | Budget check fails — `AgentQuota.budgetCeilingUsd` would be exceeded | `needs_attention` — same soft-ceiling pattern as Week 2 Task 4, now also gating Video Generation per `MVP_ROADMAP_OCT15.md` Section 5.6 (which names this stage explicitly) |
| `running` (video_generation) | Video Generation succeeds | `running`, `currentStage = video_review` |
| `running` (video_review) | Video Intelligence (own-draft) passes | `paused_gate2` |
| `running` (video_review) | Video Intelligence (own-draft) fails, and `pipeline_stages` has fewer than `MAX_VIDEO_REGEN_ATTEMPTS` prior `video_generation` attempts for this run | `running`, `currentStage = video_generation` (new attempt, `attemptNumber` incremented per Week 1's existing `pipeline_stages` shape — no new counter field needed), fix notes from the fail verdict passed as extra input |
| `running` (video_review) | Video Intelligence (own-draft) fails, and the attempt cap is reached | `needs_attention` — circuit breaker per `AGENT_FLEET_DESIGN.md` Section 8.6 |
| `paused_gate2` | Founder replies `approve` | `running`, `currentStage = publishing` (unreachable this week — Week 4 builds Publishing; a Week 3 test run stops here deliberately, same pattern as Weeks 1–2) |
| `paused_gate2` | Founder replies `reject [reason]` | `failed` |
| `paused_gate2` | Founder sends revision notes (anything not matching `approve`/`reject [reason]`) | `running`, `currentStage = video_generation` — a bounded regen loop, using the same attempt cap as the automatic video_review→video_generation loop above (a human-requested revision counts against the same `MAX_VIDEO_REGEN_ATTEMPTS`, not a separate unlimited allowance) |

**`MAX_VIDEO_REGEN_ATTEMPTS` — proposed value: 2** (i.e. up to 3 total `video_generation` attempts per run before escalating). Flagged for confirmation, same as Week 2's `AgentQuota` ceiling — this is a real cost/patience tradeoff (each loop re-triggers the most expensive stage in the pipeline, per `AGENT_FLEET_DESIGN.md` Section 4 "Highest cost/uncertainty: Video Generation"), not a technical constant with an obviously correct default.

## 2. Video Generation

**Owner**: Video Generation agent, per `AGENT_FLEET_DESIGN.md` 4.6.

### Input
`{ tenantId, channelId, pipelineRunId, scriptText, captions, brandAssets }` — `scriptText`/`captions` from the sanctioned Gate 1 output (approved or edited), `brandAssets` from `Channel.brandAssets`. On a regen attempt, also carries the prior attempt's fix notes (from Video Intelligence or the founder).

### Output
`{ videoPath, durationSeconds, aspectRatio }` written to `pipeline_stages.output` (`stageName = 'video_generation'`) — `videoPath` is a local file path string (see `docs/execution/week3/SCHEMA.md`'s storage note), not the binary itself.

### Cost gate and metering
Same pattern as Week 2 Task 4's Script Generation gate, reused here per `MVP_ROADMAP_OCT15.md` Section 5.6. One aggregated `UsageEvent` row per invocation (TTS + transcription cost summed, FFmpeg cost `0`), per `docs/execution/week3/SCHEMA.md`.

## 3. Video Intelligence (own-draft mode)

**Owner**: Video Intelligence agent, `content_source: 'own_draft'`, per `AGENT_FLEET_DESIGN.md` 4.2.

### Input
`{ videoPath, durationSeconds, aspectRatio }` (Video Generation's output) plus `Channel`'s rubric config.

### Logic
Deterministic checks first — duration vs. the platform's Shorts length limit, aspect ratio (9:16), silence detection — all zero-LLM-cost, via `ffprobe`/FFmpeg filters. Only if those pass does a lightweight multimodal LLM pass run, per `AGENT_FLEET_DESIGN.md` 4.2's open question ("how much of the own-draft rubric can be deterministic... for MVP cost and speed") resolved here: deterministic first, multimodal only when worth the cost.

### Output
A `ReviewLog` row (`agent = 'video-intelligence-own-draft'`, `verdict` = `pass`/`fail`, `rationale` = fix notes on fail), mirrored into `pipeline_stages.output` (`stageName = 'video_review'`).

## 4. Approval Gate 2

**Owner**: the Orchestrator, via the same `studio/src/notify-founder/` interface Gate 1 uses (Week 2 Task 2/6) — no new notification code, just a second call site.

### Mechanics
Same one-thread-per-run pattern as Gate 1. Message includes: channel name, the video file (or a link, if it exceeds Telegram's bot-upload size limit — Week 3 Task 4 confirms against real render sizes), and Video Intelligence's verdict + fix notes.

### Reply grammar (per roadmap Section 17)
- `approve` → publishes (unreachable this week).
- `reject [reason]` → stops the run.
- Revision notes (anything else) → triggers a bounded regen loop back to `video_generation`, per Section 1's transition table — **not** a raw content edit the way Gate 1's edited-script reply is, since a video can't be hand-edited as text; the notes become the next `video_generation` attempt's extra input instead.

### Logging
Every gate decision writes a `ReviewLog` row (`agent = 'human'`), same convention as Gate 1.

## Reference
- `MVP_ROADMAP_OCT15.md` Sections 5.6, 6, 12, 13, 17
- `AGENT_FLEET_DESIGN.md` Sections 4.2, 4.6, 8.6
- `docs/execution/week2/BUSINESS_LOGIC.md` (the pattern this extends)
- `docs/execution/week1/BUSINESS_LOGIC.md` Section 4 (circuit breaker, scaffolded not yet exercised)

## Implementation Reconciliation (added by Week 3 Task 5)

The transition table and Sections 2-4 above were confirmed accurate against what was actually
built, end-to-end, with real (not simulated-transport) calls — see `docs/execution/week3/
reports/task1.md` through `task5.md` for the verification detail. Deltas and confirmations
worth recording here, since this doc is meant to describe reality, not just the plan:

- **`MAX_VIDEO_REGEN_ATTEMPTS`**: proposed value **2** confirmed as-implemented (Task 3), and
  tripped for real twice this week — once by three genuine automatic `video_review` fails in a
  row (Task 3, run `b3109735-…`), once by a founder-requested `revise` arriving on an already
  attempt-3 run (Task 4, same run) — confirming the shared cap applies identically to both the
  automatic and human-triggered regen paths, per this doc's own Section 1 note.
- **Gate 2 threading**: confirmed to reuse Gate 1's `threadKey` (the `PipelineRun.id`)
  unchanged — no second-thread concept was needed or built, exactly as this doc's Section 4
  anticipated.
- **A real bug found while wiring Gate 2** (Task 4): `runVideoGenerationStage`'s fix-notes
  lookup originally only matched a `video_review` `fail` verdict, silently missing Gate 2's own
  `revise` verdict — a founder-requested revision's notes would never have reached the next
  `video_generation` attempt. Fixed; see `reports/task4.md`.
- **Idempotent resume extended to the Week 3 stages** (Task 5, same method as Week 2 Task 7):
  `resume-on-startup.ts`'s `STAGE_RESUMERS` map now also dispatches `video_generation`,
  `video_review`, and `gate2` (previously only `intake`/`script_generation`/`script_review`/
  `gate1`). Verified live: a real mid-`video_generation` process kill (the actual OS process
  tree, not just its shell wrapper — a first kill attempt that only stopped the wrapper let the
  underlying render finish in the background undetected, a real finding in its own right) left
  a stage row stuck at `status: 'running'` with no `UsageEvent` row; a subsequent `resume()`
  call correctly started a fresh attempt (not a duplicate) and completed cleanly, with exactly
  one `UsageEvent` row for the successful attempt. The failed attempt's own artifacts (a
  truncated `.mp4`, a complete-but-orphaned `.srt`) were left in place as harmless debris — the
  pipeline's own output pointer moves on to the new attempt's files and never reads the old
  ones again — same accepted-debris posture as an orphaned `pipeline_stages` row elsewhere in
  this system, not something new cleanup logic was written for.
- **A real, wider-blast-radius recurrence of Week 2 Task 7's known finding**: `resume()`'s
  sweep (`listRunsByStatus('running')`) picks up *every* stale running run, not just an
  intended target — now with a larger surface, since Task 5 wired three more resumable stages.
  Running it unscoped against a dev database with several old test fixtures still sitting at
  `status: 'running'` re-triggered real Anthropic `video_review` calls on runs that had nothing
  to do with the test at hand. Worked around for this task's own verification by explicitly
  closing out unrelated stale runs first (see `scripts/close-stale-test-runs.ts`) rather than
  changing `resume()`'s scope — the sweep-everything behavior is arguably correct for
  production (a real crash should resume every affected run), the risk is specific to a dev
  database accumulating manual test runs across many sessions.
- **A related design note for whoever builds Week 4's Publishing stage**: `resume()`'s sweep
  query (`status = 'running'`) cannot distinguish a run genuinely stuck mid-stage from one that
  is deliberately, successfully waiting at an unbuilt frontier stage — e.g. a Gate-2-approved
  run sitting at `currentStage = 'publishing'` with nothing to resume yet also reads as
  `status: 'running'`. Currently harmless (no `publishing` resumer exists, so `resume()` just
  logs and moves on for that run), but once one is added, every already-approved run will fire
  it automatically on the next resume — likely the desired behavior, but worth a deliberate
  decision rather than an accidental one.
- **Video Intelligence's real verdict is not always a fail**: an organic (non-fixture) real
  `video_review` pass was observed this task (run `c88772a8-…`, midpoint frame landed on the
  word "feels," judged as a reasonable MVP visual for that run's topic) — confirming Task 3's
  flashing-caption finding is a real, frequent risk, not a guaranteed failure on every run.
