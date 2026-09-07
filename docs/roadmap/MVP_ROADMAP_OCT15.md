# 7AI — MVP Architecture & Roadmap to the Oct 15 Test

**Status**: 🟢 **Locked** — design phase complete; implementation starts with the Orchestrator, in a new repo (`yt_shorts` set aside — Section 18)
**Date**: September 7, 2026
**Owner**: Neeraj Singh (founder)
**Companion doc**: `7AI/docs/design_doc/agents/all_agents/AGENT_FLEET_DESIGN.md` — the full long-term fleet design. This document is the narrow slice of it being built first, plus the operational questions (communication flow, approvals, UI, failure recovery, 7-channel support) needed to actually run it.

---

## 1. Where We Are Right Now

Zero code has been written for 7AI. What exists:

- `yt_shorts`: a locked architecture for one piece — trend forecasting — built single-tenant, no LLM reasoning layer, not yet implemented (still Phase 1/planning).
- `AGENT_FLEET_DESIGN.md`: a full 9-agent design on paper, not built.

That's fine — 100% design, 0% implementation, five and a half weeks out, is a normal place to be **if the MVP is cut aggressively**. The rest of this document is that cut.

**Where `yt_shorts` fits the MVP**: nowhere, for now — set aside entirely (✅ decided, Section 18). Trend Identification (4.1), which is what `yt_shorts` is, is already **Deferred** in the MVP since you're supplying the brief directly for the first test, and the Orchestrator gets a fresh repo rather than being built inside `yt_shorts`'s codebase. What carries forward is the *philosophy*, not the code: same stack (TypeScript + Postgres), same "cron + Postgres, no magic" approach — just a new, unentangled foundation. `yt_shorts` stays parked as reference until Trend Identification actually gets built, at which point it slots in as one agent the Orchestrator calls, not something the Orchestrator is built on top of.

---

## 2. The Core Simplification: Your Brief Replaces Auto-Discovery

The single biggest scope reduction comes directly from the workflow you described:

> *I consume content → I know what I want → I give the orchestrator 2–3 sentences → the system runs.*

That means **you** are supplying what Trend Identification, Video Intelligence (competitor mode), and Content Prediction would otherwise have to discover automatically. For the first test, none of those three agents are needed — your brief *is* the trend understanding and the content prediction. This alone cuts the MVP from 9 agents down to essentially 5, plus the Orchestrator.

This is exactly the kind of cut Section 1's north star supports: those agents exist to make the loop run *without* you eventually — but proving the loop works *with* you in it first is the right-sized first test, and it's the same loop, just with a human standing in for three not-yet-built agents.

---

## 3. Communication Architecture

**The governing rule (Design Principle 5): agents never call each other directly.** There are exactly two ways anything in 7AI communicates:

1. **Control flow — the Orchestrator.** For a given pipeline run, the Orchestrator invokes each agent in sequence, waits for approval gates, and passes the (possibly human-edited) output of one stage as the input to the next. This is synchronous, per-run, and owned entirely by the Orchestrator's state machine.
2. **Shared state — the datastore.** Agents that need to influence future runs without being "called" read and write structured records in shared Postgres tables. This is how Continuous Learning and Video Intelligence's competitor mode work: nobody invokes them mid-pipeline; they run on their own schedule, reading whatever accumulated data they need and writing results other agents pick up later.

This directly answers the two communication questions you raised:

- **Video Intelligence (competitor mode) → Continuous Learning**: Video Intelligence writes competitor pattern reports to a shared table. Continuous Learning, running as a periodic batch job, reads recent reports (plus Performance Analytics data) when it runs — it doesn't get "called" by Video Intelligence, it just finds the data waiting for it. Same pattern for the `own_draft` mode: its pass/fail verdicts get compared against actual post-publish outcomes, which is how the review rubric itself improves over time.
- **Continuous Learning → Script Generation**: Continuous Learning writes to a shared **Priors Library** (a table/index of top-performing past scripts and what made them work). Script Generation reads from that library at generation time, as few-shot context. Again, no direct call — a shared store in between.

### MVP-critical-path flow (what actually runs for the first test)

```
YOU: consume content, decide what to make
  │
  ▼
[2-3 sentence brief]
  │
  ▼
ORCHESTRATOR — Intake (parses brief → structured request, scoped to tenant_id + channel_id)
  │
  ▼
Script Generation  ──writes──▶  PipelineRun.stage[script_draft]
  │
  ▼
Script Review (cheap rubric score + notes)
  │
  ▼
╔══════════════════════════════════════╗
║ APPROVAL GATE 1 (you)                ║
║ See the script. Approve / Edit / Reject ║
╚══════════════════════════════════════╝
  │ (approved or edited script becomes the sanctioned input downstream)
  ▼
Video Generation (TTS + captions + simple visual assembly)
  │
  ▼
Video Intelligence — own_draft mode (pass/fail + fix notes)
  │
  ▼
╔══════════════════════════════════════╗
║ APPROVAL GATE 2 (you)                ║
║ See the video. Approve / Edit / Reject ║
╚══════════════════════════════════════╝
  │
  ▼
Publishing (uploads to the channel's YouTube account)
  │
  ▼
Performance Analytics (starts logging views/watch-time/engagement)
```

### Full long-term flow (post-MVP, for reference)

```
Trend Identification ─┐
                       ├─▶ Content Prediction ─▶ Script Generation ─▶ [Gate 1] ─▶ Script Review*
Video Intelligence     │                                                              │
 (competitor mode) ────┘                                                              ▼
                                                                              Video Generation
                                                                                       │
                                                                                       ▼
                                                                        Video Intelligence (own_draft)
                                                                                       │
                                                                                       ▼
                                                                                  [Gate 2] ─▶ Publishing
                                                                                                   │
                                                                                                   ▼
                                                                                      Performance Analytics
                                                                                                   │
                        ┌──────────────── Priors Library ◀── Continuous Learning ◀────────────────┘
                        ▼                        ▲
              (read by Script Generation)   (also reads Video Intelligence
                                              competitor reports, batched)
```
*Script Review can run before or after Gate 1 depending on final ordering choice — noted as an open question below.

---

## 4. Critical Component Analysis

There isn't a single "most important" component — importance splits along three different axes, and it's more useful to name all three than to force one answer:

| Axis | Component | Why |
|---|---|---|
| **Most structurally critical** | **Orchestrator** | Single point of failure. Every other agent is independently replaceable/improvable; if the Orchestrator's state machine breaks, nothing runs, no approvals happen, no channel posts. Get this one right first. |
| **Most value-critical** | **Script Generation** | The clearest lever on the actual mission (views). A mediocre video with a great hook still gets watched; a great video with a weak script doesn't. This is where quality spend belongs. |
| **Highest risk/irreversibility** | **Publishing** | The only agent that takes a live, public, hard-to-undo action on a real account. Needs the most careful credential handling and the most conservative default (approval gate stays on longest here). |
| **Highest cost/uncertainty** | **Video Generation** | Dominant cost center, least mature tooling, biggest unknown for hitting Oct 15 — see Section 14. |

If forced to pick one to get exactly right before anything else: the **Orchestrator**, because it's what makes the rest of the system trustworthy enough to eventually run unattended — agent quality can improve iteratively once that skeleton is solid; a shaky orchestrator undermines everything built on top of it.

---

## 5. Orchestrator Responsibilities (the core of the MVP)

1. **Intake** — parse your 2–3 sentence brief into a structured request (`{channel_id, topic, constraints}`). A small LLM call, owned by the Orchestrator itself — not a separate agent for now (revisit only if you later want to let *others* submit raw briefs as a standalone product).
2. **Pipeline run state machine** — persist every stage's status and output in Postgres (`PipelineRun`, `PipelineStage` tables) so a crash or restart resumes from the last completed stage instead of starting over. This is the single most important piece of "boring but critical" engineering in the whole MVP.
3. **Approval gates** — pause at Gate 1 (post Script Review) and Gate 2 (post Video Review), notify you, wait, and resume with whatever you decided. This is also the mechanism for controlling input into the next agent — see Section 6.
4. **Multi-channel scheduling** — run jobs across channels, respecting each channel's cadence and credentials (MVP: 1 channel; see Section 10 for scaling to 7).
5. **Failure handling** — retries with backoff on transient errors, hard circuit breakers on cost-risky loops (e.g. video review fail → regenerate), and escalation to you (surfaced as a pending item in the same approval UI) when a run needs a decision rather than failing silently.
6. **Cost checks** — refuse to trigger Video Generation if a budget ceiling would be exceeded (even a soft/manual ceiling for MVP is fine). The ceiling itself is pooled per platform across all 7 channels (`AGENT_FLEET_DESIGN.md` 6.2/8.7), not 1 channel; irrelevant for MVP with a single channel, but the Orchestrator will need a fair-allocation policy across channels before channel #2 goes live (Week 5) so one channel can't consume the whole pool.

**Not the Orchestrator's job**: any creative or analytical judgment. It routes and gates; the agents think.

---

## 6. Human Approval Design

**Where**: two gates, both **on by default** for the MVP/testing phase.

- **Gate 1 — after Script Review, before Video Generation.** This is the highest-leverage gate: a script is cheap to redo, a video is not. Catching problems here is far cheaper than catching them after rendering.
- **Gate 2 — after Video Review, before Publishing.** Final human check before anything goes live and public — irreversible/reputational, stays manual longest even after Gate 1 is relaxed.

Both gates are per-channel configurable so you can dial down oversight on channels you trust once they've proven themselves — but for the first test, leave both on everywhere.

**How you control the input to the next agent**: each `PipelineStage` row stores the proposed output as plain, human-readable text/JSON (a script is just text; video metadata is a small JSON object). At a gate, you see that exact payload and can:
- **Approve** — it passes through unchanged.
- **Edit** — you submit a revised version, which becomes the actual input to the next stage (the original AI output is kept in history but the edited version is what downstream agents see).
- **Reject** — the run stops, or optionally re-queues with your reject notes as extra context for a retry.

This is a standard human-in-the-loop pattern and doesn't require anything exotic — just that every stage's data is stored as something a person can read and edit, not opaque binary.

---

## 7. The Simplest Possible UI

Two views, nothing else, for the MVP:

- **Queue** — a list of pending approvals across channels ("Channel 3: script ready for review").
- **Detail** — the pending content (script text, or an embedded video preview) plus three actions: **Approve**, **Edit & Resubmit**, **Reject**.

That's the "media player with two [really three] buttons" you described — deliberately no dashboards, no settings screens, no channel-config UI for v1 (channel setup — niche, style guide, credentials — is a JSON/config file for now, since you're the only operator).

**Fastest possible path to something working**: ship the approval gate as a Telegram bot first (✅ resolved, Section 17) — before building any web UI at all. That could realistically be working in days rather than weeks; a minimal web page in the new repo becomes a fast-follow rather than a blocker to the first test, if one turns out to be needed.

---

## 8. The Sophisticated Backend Behind That Simple UI

- **Durable, resumable state machine** — Postgres-backed `PipelineRun`/`PipelineStage`, not in-memory only (Section 5.2).
- **Scheduler** — for MVP, a single-channel cron-like loop; extends to a proper multi-channel job scheduler once more than 1–2 channels are live (Section 10).
- **Retry/circuit-breaker logic** — wraps every external call (LLM, YouTube API, render pipeline).
- **Agent layer** — each agent is a function/service behind the contract defined in `AGENT_FLEET_DESIGN.md` Section 4, callable independently of the Orchestrator for testing.
- **Shared datastore** — a fresh Postgres instance in the new repo (`yt_shorts` set aside, not shared — Section 18), holding `PipelineRun`, `PipelineStage`, `Channel`, `ReviewLog`, and (dormant for now) the tenancy/billing tables from the fleet doc's Section 6, following the same "cron + Postgres, no magic" conventions `yt_shorts` established without inheriting its actual schema.
- **Dormant platform layers** — tenancy/billing schema present but not enforced; data-ingestion caching deferred entirely (not needed without Trend Identification running).
- **Logging** — two layers: general operational logs (minimal but present from day one — when something fails at 2am on channel 4, you need to know why without re-running it blind), plus the structured `ReviewLog` (Section 16) that specifically captures every reviewing agent's verdict and every human gate decision, not just pass/fail system events.

---

## 9. Continuous Operation & Failure Recovery

- **Idempotent, resumable runs** — persist a stage's output *before* advancing to the next one, so a crash mid-pipeline resumes cleanly.
- **Retry with backoff** on transient failures (API timeouts, rate limits).
- **Circuit breakers** — hard caps on revision loops (Video Review → Video Generation) and on total retries per run.
- **Dead-letter escalation** — after N failed attempts, a run flips to "needs attention" and shows up in the same approval queue, rather than failing silently or looping forever.
- **Stateless restart safety** — the scheduler reads persisted state from Postgres on startup rather than relying on in-memory state, so a process restart doesn't lose track of in-flight runs.

None of this is exotic engineering — it's the same "cron + Postgres, no magic" philosophy `yt_shorts` already committed to, just extended to cover full pipeline runs instead of only trend snapshots.

---

## 10. Supporting 7 Channels

Handled by the `Channel` entity added to the tenancy model (`AGENT_FLEET_DESIGN.md` Section 6.2): one `Tenant` (you), seven `Channel` rows underneath it, each carrying its own niche, style guide, brand assets, YouTube credentials, cadence, and approval-gate settings. Every pipeline run is scoped by `(tenant_id, channel_id)`.

**7 is a permanent ceiling, not a starting point** (Section 6.2.1 of the fleet doc) — a deliberate product rule that a tenant runs at most 7 channels per platform, because spreading the pipeline thinner than that degrades quality on all of them. Worth building the cap in as a real validation rule from the start (reject an 8th `Channel` on a platform), not just informally respecting it for now.

**Shared across all 7**: the agent code, the Orchestrator, the platform schema, the UI shell.
**Channel-specific**: everything about *what* and *how* each channel produces — niche, voice, brand, credentials, cadence, autonomy level, and its own priors (a fitness channel's top scripts shouldn't influence a finance channel's voice — cross-channel learning is opt-in, off by default).

**For the MVP itself: build for 1 channel, prove the loop, then add 2–3 more before Oct 15 if time allows.** Trying to stand up all 7 simultaneously before the loop is even proven once is the single easiest way to miss the date — see Section 14.

---

## 11. MVP Scope: Build Now vs. Defer

| Build now (critical path to Oct 15) | Defer until after the first test |
|---|---|
| Orchestrator: state machine, Intake, approval gates, basic scheduling, retries | Trend Identification's auto-discovery + news providers |
| Script Generation (no priors yet) | Content Prediction |
| Script Review (lightweight rubric) | Video Intelligence — `competitor` mode |
| Video Generation — **simple approach**: TTS + captions + template/stock visuals | Continuous Learning |
| Video Intelligence — `own_draft` mode only | Data/Signal Ingestion & Caching platform layer |
| Publishing (1 channel's YouTube credentials first) | Billing/invoicing enforcement (schema stays, dormant) |
| Performance Analytics — basic logging only | Google ADK / A2A adoption |
| `Channel`/`Tenant` schema (shape only) | All-7-channels-at-once (start with 1, add more incrementally) |
| Minimal approval UI (chat-bot, Section 17) | Priors Library / retrieval-based few-shot for Script Generation |
| `ReviewLog` (Section 16) — every agent verdict + every human gate decision | Continuous Learning's actual consumption of `ReviewLog` (the table gets built and written now; nothing reads it back yet) |

---

## 12. Roadmap: Sept 7 → Oct 15 (about 5.5 weeks)

**Week 1 (Sep 7–13) — Foundation**
- New repo (TypeScript + Postgres, `yt_shorts` set aside per Section 18): basic scaffolding, no reused code.
- Postgres schema: `Tenant`, `Channel`, `PipelineRun`, `PipelineStage`, `ReviewLog`.
- Orchestrator skeleton: state machine + Intake parsing (no real agents wired yet).
- Telegram bot: create it via @BotFather, wire a basic send/receive loop (no gate logic yet, just prove messages flow both ways).
- Submit YouTube API quota increase request now (known 1–2 week lead time — a lesson carried over from `yt_shorts`'s own planning, even though the code isn't) and set up OAuth for channel #1.
- Spike/evaluate TTS + video-assembly toolchain (1–2 days) — this is the biggest unknown, start early.

**Week 2 (Sep 14–20) — Script side**
- Script Generation agent (LLM call, no priors).
- Script Review agent (cheap rubric).
- Approval Gate 1 — build the chat-bot version first.
- Wire Orchestrator → Script Generation → Script Review → Gate 1, test end-to-end on text only.

**Week 3 (Sep 21–27) — Video side**
- Video Generation agent using the toolchain chosen in Week 1.
- Video Intelligence agent, `own_draft` mode (start with deterministic checks — duration, aspect ratio, silence — plus a lightweight LLM pass, not a heavy multimodal judge).
- Approval Gate 2.

**Week 4 (Sep 28–Oct 4) — Close the loop**
- Publishing agent (channel #1's YouTube upload).
- Performance Analytics — basic polling/logging.
- First full internal dry runs (publish as unlisted/private first, not public).

**Week 5 (Oct 5–11) — Harden and expand**
- Fix issues found in dry runs; tune quality/cost.
- Add channels #2 and #3 if Week 4 went cleanly (don't force it if not).
- Harden failure recovery: verify resumability after a forced restart mid-run.
- Polish the approval UI (minimal web page, if the chat-bot approach is proving limiting).

**Oct 12–15 — Buffer and first real test**
- Run the actual first end-to-end test (Section 13) on at least one real channel, publicly.
- Fix whatever breaks. This buffer exists because something always breaks in week 1 of a first real test — don't schedule the "real" test for the 15th itself with zero slack.

---

## 13. What the First End-to-End Test Looks Like

1. You watch/consume something, decide what you want.
2. You send the Orchestrator 2–3 sentences describing it, for channel #1.
3. Script Generation produces a draft; Script Review scores it.
4. **Gate 1**: you see the script, approve or edit it.
5. Video Generation produces a video from the (possibly edited) script.
6. Video Intelligence (own-draft mode) checks it.
7. **Gate 2**: you see the video, approve or edit/reject it.
8. Publishing uploads it to channel #1's real YouTube account.
9. Performance Analytics starts logging its metrics.

**Success criteria**: the full loop completes using only the two approval gates — no manual backend intervention — produces a video you consider acceptable, and if you kill the process mid-run and restart it, it resumes rather than losing the run.

---

## 14. Biggest Risks to Hitting Oct 15

1. **Video Generation is the biggest unknown.** AI video generation tooling is the least mature, most vendor-dependent, most expensive part of this entire stack. Mitigation: deliberately choose the *simplest viable* approach for the MVP — TTS voiceover, auto-captions, and template/stock visuals rather than full generative AI video. Prove the loop with something unglamorous but reliable; upgrade the visuals later once the pipeline itself is proven.
2. **YouTube API/OAuth/quota lead time.** Already flagged in the original `yt_shorts` docs as taking 1–2 weeks — start this in Week 1, not Week 4.
3. **Scope creep.** The temptation to build Trend Identification, Continuous Learning, or all 7 channels "while we're at it" is the most likely way to miss the date. The defer list in Section 11 is deliberate — resist adding to the build-now column mid-sprint.
4. **Orchestrator durability bugs.** Resumability is boring to build and easy to shortcut under time pressure, but it's what separates "a demo" from "a system that can run unattended later." Budget real time for it in Week 1.
5. **Approval-gate UI taking longer than expected.** If a proper web UI turns into its own multi-week project, fall back to the chat-bot approach immediately rather than letting it block the pipeline work.

---

## 15. Open Questions — Resolved

1. **TTS/video-assembly toolchain choice** — ✅ **Resolved: OpenAI TTS + hosted word-level-timestamp transcription + FFmpeg for assembly** (no paid rendering SaaS, ElevenLabs deferred as a later per-channel voice upgrade). Full rationale in `execution/week1/reports/task8-tts-video-toolchain-spike.md`. Video Generation's design (Week 3) should lock to this.
2. **Chat-bot vs. minimal web UI for approval gates** — ✅ **Resolved: chat-bot.** Design ideas requested within 1 week — this lines up neatly with the existing Week 2 (Sep 14–20) target for building Gate 1, so no schedule change needed. See Section 16 for the first pass.
3. **Which channel to use for the first live test** — ✅ Criterion confirmed (lowest-stakes niche among the 7); specific channel is the founder's call, not a blocking technical question.
4. **Script Review ordering relative to Gate 1** — ✅ **Resolved: review-then-approve.** This already matches the MVP-critical-path flow in Section 3 (Script Generation → Script Review → Gate 1) — no diagram change needed, just confirming the design as drawn.

---

## 16. New Requirement: Review & Decision Logging

**Ask**: log every review — every agent's review verdict, not just the final pipeline outcome.

**Design**: a single `ReviewLog` table (added to `AGENT_FLEET_DESIGN.md` Section 6.2), one row per review-type decision anywhere in the pipeline:

- Script Review's score + notes (4.5)
- Video Intelligence's own-draft pass/fail + fix notes (4.2)
- The human's Gate 1 and Gate 2 decisions (approve / edit / reject), including what was edited

Each row: `tenant_id`, `channel_id`, `pipeline_run_id`, `agent` (or `human`), `verdict`, `rationale`, `timestamp`.

**Why this is worth building now, not deferring**: it's not just observability — it's the exact data Continuous Learning (4.9, deferred) will eventually need for its "predicted quality vs. actual outcome" calibration loop (comparing what Video Intelligence predicted pre-publish against what Performance Analytics measures post-publish). Writing these rows from day one means that calibration data is already accumulating during the MVP test period, even though nothing reads it yet — the same "cheap now, expensive to reconstruct retroactively" logic already applied to tenancy (Principle 2) and usage metering (Principle 7). Added to the MVP build-now scope (Section 11).

---

## 17. Chat-Bot Approval UI — First-Pass Design Ideas

A starting point for Week 2, not a final spec:

- **One bot, one thread per pipeline run** (not one long thread for everything) — keeps each run's back-and-forth self-contained and scannable, and means "reply to this message" unambiguously means "this run, this stage."
- **Message at Gate 1**: channel name, the brief that started it, the full script text, and the Script Review score/notes inline (so you're not context-switching to see why it passed/what was flagged). Ends with the three actions spelled out as reply commands: `approve`, `reject [reason]`, or just send edited script text directly as the reply.
- **Message at Gate 2**: channel name, the video file/preview, Video Intelligence's verdict and any fix notes, same three reply options — `approve` publishes, `reject [reason]` stops the run, sending back notes (not a full video) requests a specific revision rather than a full regenerate where possible.
- **Failure/escalation messages**: a distinct message type (e.g. prefixed "⚠️ Needs attention") for anything that hit a circuit breaker or retry cap, so these don't blend into routine approvals.
- **Daily digest** (optional, easy add-on once the basic flow works): one end-of-day summary across all live channels — how many runs completed, how many are waiting on you — so multi-channel status doesn't require checking each thread individually.

**Telegram vs. Slack — ✅ Resolved: Telegram.** Free either way, but Telegram wins on the actual criteria: no workspace/app-approval overhead (a personal bot via @BotFather is a few minutes, no org review), reliable delivery, and no new tool to learn since you've already used it. Slack would mean standing up a workspace app and OAuth scopes for a single-user MVP bot — real setup cost for no corresponding benefit here. Revisit only if this ever needs to notify a team, not just you.

---

## 18. Repo Question — ✅ Resolved: New Repo, `yt_shorts` Set Aside

**Decided: the Orchestrator (and the MVP generally) gets a fresh repo — TypeScript + Postgres, same stack and same "cron + Postgres, no magic" philosophy `yt_shorts` already established, but no shared code, no shared schema, no shared database instance.** `yt_shorts` is set aside as-is — not deleted, not migrated, just parked — until Trend Identification (4.1) actually gets built for real, at which point it slots back in as one agent the Orchestrator calls, not the codebase the Orchestrator is built inside of.

Reasoning this confirmed: `yt_shorts` was scoped and locked as a single-purpose forecasting service. The Orchestrator is a structurally different system — a state machine, scheduler, and integration hub — and growing it inside `yt_shorts`'s existing API routes and domain model would have the two pulling the repo in different directions as both grow. A few hours of fresh scaffolding now avoids that entirely, and since Trend Identification is deferred anyway, there was no cost to waiting.

Everything needed to start is now unblocked: state machine design, approval-gate mechanics, Telegram as the UI, Intake owned by the Orchestrator, and now the repo itself. Section 12's Week 1 plan reflects this.
