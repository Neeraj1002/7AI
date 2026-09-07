# Week 2 Business Logic Delta

**Status**: Real new control flow this week — the pipeline advances past `intake` for the first time, `PipelineRun.status = 'paused_gate1'` (defined in Week 1's enum, unused until now) becomes real, and a soft cost-budget check gates Script Generation for the first time anywhere in the system.

## 1. Stage sequence (Week 2 subset)

Extends Week 1's transition table (`docs/execution/week1/BUSINESS_LOGIC.md` Section 1):

| From | Event | To |
|---|---|---|
| `running` (intake) | Intake succeeds | `running`, `currentStage = script_generation` |
| `running` (script_generation) | Budget check fails — `AgentQuota.budgetCeilingUsd` would be exceeded | `needs_attention` — soft ceiling per `MVP_ROADMAP_OCT15.md` Section 5.6; escalates to the founder rather than silently blocking or failing |
| `running` (script_generation) | Script Generation succeeds | `running`, `currentStage = script_review` |
| `running` (script_review) | Script Review completes (always "succeeds" as a stage — a low score is a review outcome, not a stage failure) | `paused_gate1` |
| `paused_gate1` | Founder replies `approve` | `running`, `currentStage = video_generation` (unreachable this week — Week 3 builds Video Generation; a Week 2 test run stops here deliberately, same pattern as Week 1 stopping at `intake`) |
| `paused_gate1` | Founder replies with edited script text (anything not matching `approve`/`reject [reason]`) | `running`, `currentStage = video_generation`, using the edited text as the sanctioned script (the original AI output stays in `pipeline_stages.output` history, not overwritten) |
| `paused_gate1` | Founder replies `reject [reason]` | `failed` — the run stops. Re-queueing with the reject reason as retry context is a plausible fast-follow, not built this week (Principle 10 — keep the first version simple) |

## 2. Script Generation

**Owner**: Script Generation agent, per `AGENT_FLEET_DESIGN.md` 4.4.

### Input
`{ tenantId, channelId, pipelineRunId, topic, constraints, styleGuide }` — `topic`/`constraints` come from `PipelineRun.intakeParsed` (Intake's output), `styleGuide` from `Channel.styleGuide`. No priors/retrieval this week — nothing to retrieve yet, per 4.4's MVP status.

### Output
`{ scriptText, captions, hashtags }` written to `pipeline_stages.output` (`stageName = 'script_generation'`).

### Cost gate (new this week)
Before calling the LLM, the Orchestrator sums `UsageEvent.costUsd` for `(tenantId, platform)` and compares it against `AgentQuota.budgetCeilingUsd`. If the call would push spend past the ceiling, the stage does not run — the run moves to `needs_attention` instead (see transition table above). This is deliberately the *only* cost gate built this week; a separate one for Video Generation is Week 3's concern, per `MVP_ROADMAP_OCT15.md` Section 5.6.

### Metering (new this week)
Every call — success or failure — writes a `UsageEvent` row (`agent = 'script-generation'`, resolved provider/model, token counts, computed `costUsd`), per Design Principle 7. This is the first agent invocation in the system, so it's also the first row `usage_events` ever gets.

## 3. Script Review

**Owner**: Script Review agent, per `AGENT_FLEET_DESIGN.md` 4.5.

### Input
`{ scriptText, captions }` (Script Generation's output) plus `Channel`'s rubric/brand config.

### Output
A `ReviewLog` row (`agent = 'script-review'`, `verdict` = numeric score as text, `rationale` = notes — including the video-generation-fit check per 4.5's updated responsibilities), mirrored into `pipeline_stages.output` (`stageName = 'script_review'`) so the score/notes are visible at Gate 1 without a join.

### Logic
Single LLM call, cheap/fast tier per `AGENT_FLEET_DESIGN.md` 8.1. No auto-revision loop this week — a low score still reaches Gate 1 for the human to judge, per 4.5's "kept lightweight" MVP status. Also writes its own `UsageEvent` row — every call is metered, including cheap-tier ones.

## 4. Approval Gate 1

**Owner**: the Orchestrator, via the notification interface built in Week 2 Task 2.

### Mechanics
One Telegram thread per `PipelineRun` (`MVP_ROADMAP_OCT15.md` Section 17). The gate message includes: channel name, the original brief, the full script text, and Script Review's score/notes inline. `requestApproval(...)` blocks the stage (`PipelineRun.status = 'paused_gate1'`) until a reply arrives.

### Reply grammar (per roadmap Section 17)
- `approve` → the script passes through unchanged.
- Any other free text → treated as an edited script, replacing the sanctioned version for downstream stages.
- `reject [reason]` → stops the run (`failed`); the reason is recorded on the `ReviewLog` row.

### Logging
Every gate decision writes a `ReviewLog` row (`agent = 'human'`, `verdict` = `approve`/`edit`/`reject`, `editedOutput` populated only on edit) — per `MVP_ROADMAP_OCT15.md` Section 16, human decisions are logged exactly like agent verdicts, not treated as out-of-band.

## Reference
- `MVP_ROADMAP_OCT15.md` Sections 3, 5.6, 6, 12, 17
- `AGENT_FLEET_DESIGN.md` Sections 4.4, 4.5, 6.2, 8.7
- `docs/execution/week1/BUSINESS_LOGIC.md` Sections 1, 6
