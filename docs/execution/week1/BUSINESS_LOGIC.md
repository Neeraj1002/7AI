# Week 1 Business Logic: Orchestrator Skeleton & Control Flow

**Scope**: the control-flow rules Week 1 actually implements. Week 1 builds the *skeleton* — no real agents are wired in yet (`MVP_ROADMAP_OCT15.md` Section 12: "Orchestrator skeleton: state machine + Intake parsing (no real agents wired yet)"), so most of this document defines rules that exist as reusable machinery this week and get exercised for real starting Week 2.

Each section below states what's real *this week* vs. what's scaffolded now but only meaningfully tested later — don't over-build the parts marked deferred; the point of a skeleton is that it's thin.

---

## 1. PipelineRun / PipelineStage State Machine

### States (PipelineRun.status)

```
pending → running → completed
                  ↘ needs_attention (circuit breaker / dead-letter)
                  ↘ failed (hard, non-recoverable)
running → paused_gate1 → running   (Week 2+; state exists now, unreachable until Gate 1 exists)
running → paused_gate2 → running   (Week 2+; state exists now, unreachable until Gate 2 exists)
```

### Rule: persist before advancing

A stage's `output` and `status = completed` are written to `pipeline_stages` in the same transaction that would otherwise "move on" to the next stage — never advance `pipeline_runs.currentStage` based on in-memory state alone. This is the mechanism behind `MVP_ROADMAP_OCT15.md` Section 9's resumability requirement: on restart, the scheduler reads `pipeline_runs` + the latest `pipeline_stages` row per run from Postgres, not from anything held in process memory. Week 1 exercises this only for the `intake` stage — real resumability testing (kill the process mid-run, confirm it resumes) is a Week 4 dry-run activity, but the mechanism has to be correct now because retrofitting it after stages depend on it is expensive.

### Rule: idempotent resume

On startup, for every `PipelineRun` with `status = running`, look at its latest `PipelineStage`. If that stage's `status = completed`, resume at the *next* stage. If `status = running` (the process died mid-stage), re-run that same stage from its `input` rather than assuming partial work happened — stages must be safe to re-run with the same input (no side effect that isn't itself idempotent, e.g. don't re-send a Telegram message on stage retry without checking whether it was already sent).

### Transition table (Week 1 subset)

| From | Event | To |
|---|---|---|
| (none) | `PipelineRun` created from a brief | `pending` |
| `pending` | Intake stage starts | `running`, `currentStage = intake` |
| `running` (intake) | Intake succeeds | stays `running`, `currentStage` advances to next stage in sequence (unreachable this week — no next agent exists yet, so a Week 1 test run stops here deliberately) |
| `running` (intake) | Intake fails — bad/unparseable brief | `needs_attention` (not `failed` — a bad brief is a human-fixable input problem, not a system fault; it should show up in the approval queue, not silently die) |
| any | Circuit breaker trips (Section 4) | `needs_attention` |

---

## 2. Intake Parsing

**Owner**: the Orchestrator itself, not a separate agent — per `MVP_ROADMAP_OCT15.md` Section 5.1, this is "a small LLM call, owned by the Orchestrator itself... revisit only if you later want to let *others* submit raw briefs as a standalone product."

### Input
`{ tenantId, channelId, briefText }` — the human's 2-3 sentence description, plus which channel it's for (Week 1: always the single MVP channel, but the field is required from day one since every run is scoped by `(tenant_id, channel_id)` per `AGENT_FLEET_DESIGN.md` Section 6.2).

### Output
`intakeParsed: { topic: string, constraints: string[] }` written to `pipeline_runs.intakeParsed`, plus a `pipeline_stages` row with `stageName = 'intake'`, `input = { briefText }`, `output = { topic, constraints }`.

### Logic
A single LLM call: given the brief text, extract a structured topic and any explicit constraints (e.g. "keep it under 45 seconds," "no profanity," a specific angle the founder mentioned). This is intentionally the simplest possible extraction — no validation against a taxonomy, no niche-matching logic. If the brief is too vague to extract a topic at all, the stage fails (see transition table above) rather than guessing.

### Resolved (2026-09-08, by Week 2 Task 3)
This stage previously called `@anthropic-ai/sdk` directly, per the "Known temporary coupling" note this section used to carry — that coupling is now gone. `parse-brief.ts` calls through `studio/src/llm/` (the provider-agnostic LLM layer, `docs/decisions/LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md`) like every other real agent call in the system. See `docs/execution/week2/reports/task3.md`.

### Explicitly not in Week 1 scope
Anything resembling Trend Identification, Content Prediction, or auto-discovery — per the roadmap's Section 2 core simplification, the human's brief *is* the trend understanding and content prediction for the MVP. Intake parses what the human already decided; it doesn't decide anything itself.

---

## 3. Channel Creation Rule: 7-Channel Cap

Per `AGENT_FLEET_DESIGN.md` Section 6.2.1, this is a **permanent product rule**, not a soft MVP default — build the validation now, even though Week 1 only ever creates one channel, because "informally respecting it" is exactly the kind of thing that's easy to forget once channel #2 through #7 get added under time pressure in Week 5.

### Rule
Before inserting a new `Channel` row: `SELECT count(*) FROM channels WHERE tenantId = $1 AND platform = $2 AND isActive = true`. If the count is already 7, reject the creation with a clear error — this is an application-level check in the channel-creation code path (repository or service layer), not a database constraint (see `SCHEMA.md` Section 2 for why).

### Not in Week 1 scope
The fair-allocation policy across channels sharing one pooled budget (`AGENT_FLEET_DESIGN.md` Section 6.4) — irrelevant with one channel, becomes relevant at channel #2 (Week 5 per the roadmap's Section 5.6).

---

## 4. Retry / Circuit-Breaker Design

Defined now as reusable wrapper logic; meaningfully exercised starting Week 2+ once stages make real external calls (LLM calls, later the YouTube API, later a render pipeline). Week 1's `intake` stage is the first thing that can use it, since it's already an LLM call.

### Retry
Transient failures (timeout, rate limit, 5xx) get retried with exponential backoff, up to a fixed cap per stage attempt (`pipeline_stages.attemptNumber` tracks this). Non-transient failures (a 4xx validation error, an unparseable brief) do not retry — they fail immediately and route to `needs_attention` per Section 1's transition table.

### Circuit breaker
A hard cap on total retries *within a single stage* and a separate hard cap on *regeneration loops* between stages (e.g. Video Review failing back to Video Generation, once that exists in Week 3) — both caps trip into `needs_attention` rather than looping indefinitely or failing silently. Week 1 defines the wrapper and the cap constants; there's no regeneration loop to exercise yet since there's only one real stage.

### Dead-letter / escalation
`needs_attention` runs surface in the same approval queue as Gate 1/Gate 2 reviews (once those exist) — not a separate error console. This keeps "the system needs a decision from you" as a single, consistent place to look, per `MVP_ROADMAP_OCT15.md` Section 5.5.

---

## 5. Telegram Bot: Week 1 Scope

Per `MVP_ROADMAP_OCT15.md` Section 12: "wire a basic send/receive loop (no gate logic yet, just prove messages flow both ways)."

### What Week 1 builds
A bot process that can send a message to the founder's Telegram and receive a reply, logging both directions. No parsing of `approve`/`reject [reason]`/edited-text replies — that reply-command grammar is Section 17 of the roadmap and is explicitly a Week 2 deliverable (Approval Gate 1). No per-run threading yet (the "one thread per pipeline run" design from Section 17) — Week 1 is one flat test channel to prove the transport works.

### Explicitly deferred to Week 2
Gate message formatting (script text + review score inline), the three-reply-command grammar, per-run threading, the "⚠️ Needs attention" message type, and the daily digest. Building any of this in Week 1 would be building UI for a gate that doesn't exist yet — Gate 1 itself is a Week 2 deliverable.

---

## 6. Deferred Entirely (Not Week 1, Noted for Context Only)

- **Cost/budget checks** (`MVP_ROADMAP_OCT15.md` Section 5.6) — irrelevant with a single channel and no agents that spend money yet. First relevant once Script Generation (Week 2) makes real LLM calls with a cost.
- **Approval gate mechanics** (Section 6) — Week 2, tied to Script Review.
- **Multi-channel scheduling / fair allocation** — Week 5, tied to adding channel #2.
- **`AgentQuota`/`UsageEvent` metering** — starts once an agent actually runs (Week 2), per `SCHEMA.md`'s scope note.
