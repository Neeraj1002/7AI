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
