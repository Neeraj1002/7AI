# 7AI — Agent Fleet: Initial Design (v3)

**Status**: 🟢 **Locked** — design phase complete; implementation starts with the Orchestrator, in a new repo separate from `yt_shorts` (companion roadmap doc, Section 18)
**Date**: September 2026
**Owner**: Neeraj Singh (founder)
**Scope**: The full multi-agent content-automation platform — separate from, and broader than, the `yt_shorts` forecasting MVP. `yt_shorts` is the locked spec for *one* agent in this fleet (Trend Identification); this document defines the rest of the fleet and how they fit together.
**Companion doc**: `7AI/docs/roadmap/MVP_ROADMAP_OCT15.md` (archived, see docs/ARCHIVE_INDEX.md) — the MVP cut of this fleet, communication flow, and the build plan to a first end-to-end test by Oct 15, 2026. This document is the full long-term design; that one is what actually gets built first.

> **Working name**: "7AI" is a placeholder — easy to change later, everything below is unaffected by the final brand name.

---

## 1. North Star & What 7AI Is

**Core principle**: 7AI exists to monetize attention — grow views (and, downstream, revenue) on YouTube Shorts and, later, other short- and long-form video across platforms. It does this by running one loop, continuously, for every channel it operates:

> **Understand what's rising right now** (trends, current affairs, news) → **analyze what competitors are already doing well** → **generate a script informed by what has worked before** (priors) → **review that script** → **generate the video** → **review the video** → **publish it** → **study the analytics** → **use what was learned to make the next pass through this loop better.**

Every agent in this document exists to run one stage of that loop. Nothing in the fleet exists that isn't in service of that loop or the infrastructure it needs to run continuously and cheaply.

**Usage timeline vs. architecture — deliberately decoupled:**

- **Usage**: self-use only for at least the first 6–10 months, across up to 7 YouTube channels — the permanent per-platform ceiling (6.2.1), not a starting point to grow past. No outside users, no rented agents, no real billing during this period.
- **Architecture**: multi-tenant from the first version of every agent regardless of usage timeline (Section 2, Principle 2) — retrofitting tenancy later is far more expensive than building it in from the first schema. Within the founder's one tenant, each YouTube channel is its own `Channel` entity (Section 6.2).
- **Cost**: cost-efficiency is a first-class design constraint from v1 too — a pipeline that runs the full loop per video, per channel, many times a day only stays viable if every step is priced correctly from the start. See Section 8.

---

## 2. Design Principles

| # | Principle | What it means in practice |
|---|-----------|---------------------------|
| 1 | **One agent, one job — with one documented exception** | Each agent owns one stage of the loop in Section 1. **Exception**: Competitor Intelligence and Video Review were merged into one Video Intelligence Agent (4.2) because both are fundamentally "watch a video, extract structured judgment" — the underlying capability is shared even though the two use cases differ. See 4.2 for the reasoning and the flag/metadata design that keeps their contracts separate. |
| 2 | **Multi-tenant from v1 — mandatory, not aspirational** | Every agent's data model is scoped by `tenant_id` (and, within a tenant, `channel_id` — Section 6.2) from its first schema. See Section 6. |
| 3 | **Cost-aware by design** | Every agent call runs at the cheapest model/tool tier that doesn't degrade the thing that actually drives views. Premium spend is reserved for creative generation, not classification, scoring, or QA. See Section 8. |
| 4 | **Rentable by default** | Every agent exposes a versioned, documented input/output contract and can be called directly by an external caller — not just by the internal orchestrator. |
| 5 | **Composable, not coupled** | Agents never call each other directly or share hidden state. They communicate through exactly two channels: the Orchestrator (control flow) and shared data stores (cross-cutting signals). See Section 5. |
| 6 | **Contract-first** | Input/output schemas are designed and documented *before* an agent is built. |
| 7 | **Every call is a metered event** | Every agent invocation writes a usage record from the first working version — whether or not billing is switched on yet. |
| 8 | **Polyglot is fine** | Implementation language is not a constraint — most code will be generated with Claude Code. |
| 9 | **Reuse what's locked** | The `yt_shorts` forecasting engine becomes the core of Agent 1's tools layer (Section 4.1). |
| 10 | **Don't over-engineer the first version** | The full fleet below is the destination, not the MVP. What actually gets built for the Oct 15 test is a deliberately small subset — see the companion roadmap doc and the "MVP Status" column in Section 3. |

---

## 3. Agent Fleet Overview

| # | Agent | Loop Stage (Section 1) | Future Rental Potential | MVP Status (Oct 15 test) |
|---|-------|-----------------|-------------------|--------|
| 1 | Trend Identification | Understand what's rising (incl. current affairs/news) | High | 🔵 Deferred — human supplies the brief for the first test instead |
| 2 | **Video Intelligence** *(merged)* | Analyze competitor content **and** review own content pre-publish | High | 🟡 Partial — only the "own draft" review mode is in the MVP |
| 3 | Content Prediction | Synthesize trend + competitor + priors into ideas | Medium–High | 🔵 Deferred — the human's brief *is* the content prediction for now |
| 4 | Script Generation | Generate script, informed by priors | Very High | 🟢 In MVP |
| 5 | Script Review | Review the script | High | 🟢 In MVP (kept lightweight) |
| 6 | Video Generation | Generate the video | Medium | 🟢 In MVP (deliberately simple approach — see roadmap doc) |
| 7 | Publishing | Publish it | Medium | 🟢 In MVP |
| 8 | Performance Analytics | Study the analytics | High | 🟡 Partial — basic logging only, no dashboard yet |
| 9 | Continuous Learning | Make the next pass better | Low (internal value only) | 🔵 Deferred — needs performance history the first test won't have yet |
| — | Pipeline Orchestrator | *(internal only, sequences 1–9, owns approval gates)* | — | 🟢 In MVP — expanded scope, see 4.10 |
| — | Platform: Tenancy & Billing | *(shared infrastructure)* | — | 🟡 Schema only, dormant — Section 6 |
| — | Platform: Data/Signal Ingestion & Caching | *(shared infrastructure, cost layer)* | — | 🔵 Deferred — not needed until Trend Identification is built |

**Agent count: 9** product-facing agents (down from 10 — see 3.1), plus the Orchestrator and two non-rentable platform layers.

### 3.1 Why Competitor Intelligence and Video Review became one agent

They were doing recognizably the same core job — *watch a video, extract a structured judgment about it* — from two different angles:

| | Competitor Intelligence (old) | Video Review (old) |
|---|---|---|
| Watches | Other people's published videos | Your own generated, not-yet-published video |
| Purpose | Understand the market (exploratory) | Quality gate before publish (pass/fail) |
| Runs | Early (discovery phase) | Late (right before publish) |
| Performance data available? | Yes — real views/engagement already exist | No — hasn't been published yet |

The underlying capability — frame/transcript/pacing/hook analysis — is the same expensive multimodal work either way. Building and maintaining two separate agents means two prompts, two rubrics, two analysis pipelines to keep in sync, for something that's one capability with two modes. So they're now **one Video Intelligence Agent**, differentiated by a `content_source` flag, detailed in 4.2.

This does bend Principle 1 (Section 2) — it's the one deliberate exception, not a precedent for merging other agents. Script Generation and Script Review, for instance, stay separate (see the reasoning that was already locked for that decision).

**Rentability isn't lost**: the agent still exposes two distinct, separately documented contracts (`mode: competitor` and `mode: own_draft`) — a future renter calling one never needs to know the other exists. One implementation, two products.

### 3.2 How many agents does 7AI actually need? (updated)

**Nine** product-facing agents, mapped onto the Section 1 loop with the merge in 3.1 applied. The reasoning from the prior draft still holds for the rest of the fleet: current-affairs/news stays a data source inside Trend Identification rather than its own agent (cost of an extra hop isn't worth it), and Script Generation/Script Review stay split (the rental boundary is worth the extra hop there, unlike the video-analysis case above).

Net: **9 rentable agents + 1 orchestrator + 2 non-rentable platform layers = 12 deployable components** in the full design. The MVP (Section 3, right column) builds roughly half of that for the first test — see the companion roadmap doc for exactly which ones and why.

---

## 4. Agent Initial Designs

Each agent below follows the same template: **Mission → Pipeline Position → Core Responsibilities → Inputs → Outputs → Candidate Tools → Tenancy Notes → Cost Notes → Status → Open Questions.**

### 4.1 Trend Identification Agent

> **Reuse vs. rebuild verdict**: Reuse the `yt_shorts` data plumbing (discovery, snapshotting, quota management, schema). **Do not reuse its decision-making core as the final answer** — a linear-regression forecast with no judgment isn't an agent. Demote it from *the decision* to *a tool the agent calls*, with a new LLM reasoning layer on top. See prior discussion for full detail (unchanged since last revision).

- **Mission**: Discover emerging topics/formats within a niche — from platform data and news/current-affairs signals — and produce a reasoned judgment (not a bare number) of what's worth pursuing.
- **Pipeline position**: First stage, when active. Feeds Content Prediction.
- **Architecture**: Data/tools layer (reused `yt_shorts` discovery + momentum calculation, exposed as a tool) + a reasoning layer (LLM call that interprets the tool output plus news/context and explains *why*).
- **Inputs**: `tenant_id`, `channel_id`, niche keywords, region, language, platform.
- **Outputs**: ranked topics with momentum, lifecycle stage, source, and a written rationale.
- **Candidate tools**: YouTube Data API v3, the reused momentum tool, pluggable news/current-affairs signal providers.
- **Tenancy notes**: needs the `tenant_id`/`channel_id` correction to the locked `yt_shorts` schema before Phase 2 proceeds.
- **Cost notes**: high volume, cheap-tier reasoning (Section 8.1).
- **⚠️ Conflicts with locked `yt_shorts` decisions**: `DECISIONS_LOCKED.md` Q8 deferred any AI layer to "Phase 2" — this design supersedes that; needs explicit founder sign-off.
- **MVP status**: **Deferred.** For the first test, the human supplies the topic directly in the 2–3 sentence brief — this agent's whole job (auto-discovery) isn't in the critical path yet. Build it once the system needs to propose ideas without a human prompt.
- **Open questions**: unchanged from prior revision.

### 4.2 Video Intelligence Agent *(merged: Competitor Intelligence + Video Review)*

- **Mission**: Analyze a video and extract structured judgment about it — either to understand what's working in the market (`competitor` mode) or to gate a generated video before it publishes (`own_draft` mode).
- **Pipeline position**: **Competitor mode** runs in Discovery, alongside Trend Identification, feeding Content Prediction. **Own-draft mode** runs in Production, right after Video Generation, feeding Publishing.
- **Core responsibilities** (shared engine, mode-dependent behavior):
  - Extract frames, transcript, pacing/timing, and audio characteristics from the input video.
  - `competitor` mode: detect title/hook/thumbnail/cadence patterns, benchmark engagement, summarize *why* it performs.
  - `own_draft` mode: check pacing/duration fit for the platform, verify branding elements, flag storytelling/quality issues, return a pass/fail with fix notes (or an auto-revision request back to Video Generation).
- **The flag/metadata design**: every call carries a `content_source` envelope:
  - `content_source: "competitor"` → `{ tenant_id, source_channel_id (external), source_video_id, is_external: true }`. Output routes to the competitor-report store, feeding Content Prediction and (batched) Continuous Learning.
  - `content_source: "own_draft"` → `{ tenant_id, channel_id (internal), pipeline_run_id, is_external: false }`. Output routes to a pass/fail verdict that gates Publishing, and — batched — feeds Continuous Learning as "predicted quality vs. actual outcome" calibration data.
  - The mode flag determines: which rubric/prompt to apply, which output schema to return, and which tenancy rules apply (competitor data is external/cacheable per Section 7; own-draft data is strictly tenant-private, never cached or shared).
- **Inputs**: `tenant_id`, `content_source` envelope (above), video reference (URL for competitor mode, internal asset for own-draft mode), brand/rubric config (own-draft mode only).
- **Outputs**: mode-dependent — see above.
- **Candidate tools**: YouTube Data API (competitor mode, via the Section 7 cache), a multimodal LLM for frame/audio analysis (both modes, same underlying call with a different prompt/rubric).
- **Tenancy notes**: competitor *reports* are tenant-isolated even though the raw data is public; own-draft analysis is tenant-private, full stop, and must never be cached or reused across tenants.
- **Cost notes**: `competitor` mode's raw fetch reuses the Section 7 cache; `own_draft` mode is a cost gate — a fail here should never let a video reach Publishing, and repeated fail→regenerate loops need a hard retry cap (Section 8.6), since each loop re-triggers the far more expensive Video Generation step.
- **MVP status**: **Partial.** Only `own_draft` mode is built for the first test — it's the quality gate right before publishing and is squarely in the critical path. `competitor` mode waits until Trend Identification and Content Prediction are built (no point analyzing competitors if nothing yet uses that signal).
- **Open questions**: how much of the own-draft rubric can be deterministic (duration/aspect-ratio/silence checks) vs. genuinely needs the multimodal LLM pass, for MVP cost and speed; how many auto-revision loops to allow before escalating to the human approval gate instead.

### 4.3 Content Prediction Agent

- **Mission**: Combine trend data, competitor data, and a tenant's own priors to predict which content ideas are most likely to succeed.
- **Pipeline position**: Consumes Trend Identification + Video Intelligence (competitor mode) output; feeds Script Generation.
- **Inputs/Outputs/Tools**: unchanged from prior revision.
- **MVP status**: **Deferred.** For the first test, the human's 2–3 sentence brief *is* the content prediction — this agent's job is to do that automatically, which isn't needed until the human wants the system to propose ideas on its own.

### 4.4 Script Generation Agent

- **Mission**: Turn an approved content idea (or, for MVP, the human's direct brief) into a complete, platform-optimized Shorts script.
- **Pipeline position**: Consumes Content Prediction output *or*, in MVP, the Orchestrator's parsed brief directly; feeds Script Review.
- **Inputs**: `tenant_id`, `channel_id`, topic/idea or raw brief, niche voice guide, target length/format, retrieved prior top-performing scripts (few-shot — deferred until there's enough history; MVP starts with no priors).
- **Outputs**: script text, captions, hashtags.
- **Cost notes**: the one place premium model spend is justified (unchanged reasoning).
- **MVP status**: **In MVP** — the first real agent in the critical path. Runs without priors/retrieval initially (nothing to retrieve yet); add priors once Continuous Learning exists.
- **Open questions**: unchanged.

### 4.5 Script Review Agent

- **Mission**: Review a script for quality, engagement, clarity, and brand alignment — **and fit for video generation** — before production.
- **Pipeline position**: Consumes Script Generation output; feeds the human approval gate, then Video Generation.
- **Core responsibilities** *(updated)*: Score against the quality/engagement/clarity/brand rubric; **also check the script is actually producible by Video Generation** — runtime fits the platform's length limit, pacing (beats/scene changes) is realistic for a Short, and any described visuals/shots are things the video-gen toolchain can actually generate — flagging anything that would pass a quality bar but fail or blow the budget at rendering.
- **Cost notes**: cheap-tier rubric scoring, gates the expensive Video Generation step — the video-generation-fit check specifically is what keeps 4.6 from discovering a problem only after spending render cost on it.
- **MVP status**: **In MVP, kept lightweight** — a rubric score + notes, not an auto-revision loop, for the first test. Auto-revision can be added once the basic gate is proven.
- **Open questions** *(new, 2026-09-08)*: the rubric (quality/engagement/clarity/brand/video-gen-fit) does not check **factual accuracy**. Surfaced by a real Week 2 test run — a script about hummingbird flight biomechanics — that happened to hold up under a manual fact-check, but nothing in the pipeline would have caught it if it hadn't. For a "science/nature educational" niche in particular, an unreviewed factual error reaching Gate 1 (or worse, publication) is a real reputational risk, not a hypothetical one. Not yet decided whether this becomes a rubric addition (a documentation/search-grounded fact-check pass, likely cheap/fast tier per 8.1 for narrow factual claims) or stays the founder's manual responsibility at the approval gates — worth deciding before autonomy is increased on any channel, since the human gate is currently the only fact-check that exists.

### 4.6 Video Generation Agent

- **Mission**: Convert an approved script into a complete video.
- **Pipeline position**: Consumes the (human-approved) script; feeds Video Intelligence (own-draft mode).
- **Cost notes**: dominant cost center in the fleet (unchanged reasoning).
- **MVP status**: **In MVP, deliberately simplified.** For the first test: TTS voiceover + auto-captions + simple visual assembly (stock imagery/template motion, not generative AI video) — see the roadmap doc's risk section for why this is the recommended MVP approach rather than a full AI-video pipeline.
- **Open questions**: which TTS + assembly toolchain to spike first (roadmap doc, this week).
- **Update (2026-09-09)**: real Week 3 testing showed the review→regen loop wasn't actually closing — Video Generation had no decision-making step for a review's `fixNotes` to change, so a rejected video just re-ran the identical deterministic pipeline (a real run failed the same way three times in a row before hitting the circuit breaker). See `docs/decisions/VIDEO_GENERATION_LOOP_AND_VISUAL_STRATEGY.md` for the fix (a production-planning LLM step ahead of assembly) and the two-path visual strategy this section's "stock imagery" framing is now made concrete by: Path A (stock footage + TTS, approved as the near-term build target) vs. Path B (generative/character-consistent video, deliberately deferred).

### 4.7 Publishing Agent

- **Mission**: Upload and publish an approved video with optimized metadata.
- **Pipeline position**: Consumes the human-approved video; feeds Performance Analytics.
- **Tenancy notes**: highest security bar in the fleet — per-`channel_id` OAuth credentials, encrypted, isolated (unchanged reasoning, now scoped per channel rather than just per tenant, since one tenant has 7 channels each with their own YouTube account).
- **MVP status**: **In MVP** — required to close the loop end-to-end. Start with one channel's credentials; add the rest incrementally (Section on 7-channel support, roadmap doc).

### 4.8 Performance Analytics Agent

- **Mission**: Track views, watch time, retention, engagement for published videos.
- **MVP status**: **Partial.** Basic polling/logging only for the first test — enough to start accumulating the history Continuous Learning will eventually need. No dashboard/UI required yet.

### 4.9 Continuous Learning Agent

- **Mission**: Analyze what performs best and feed insights back into Trend Identification, Content Prediction, and Script Generation's priors.
- **MVP status**: **Deferred.** Needs weeks of performance history across multiple videos to produce anything meaningful — irrelevant for a first test that produces a handful of videos. Revisit once Performance Analytics has real data to work with.

### 4.10 Pipeline Orchestrator *(internal-only, expanded scope)*

- **Mission**: Sequence agents into an end-to-end pipeline per channel, own all approval gates, and keep the whole system running continuously across channels without manual babysitting.
- **Responsibilities** (this is the system's structural core — see Section 4 of the roadmap doc for the full breakdown):
  1. **Intake**: parse the human's 2–3 sentence brief into a structured request (a small LLM call owned by the Orchestrator, not a separate agent, for now).
  2. **Pipeline run state machine**: persist every run's progress per stage, so a crash or restart resumes from the last completed stage rather than starting over.
  3. **Approval gates**: pause at defined checkpoints, present the pending output for review, accept an approval / edit / rejection, and resume with whatever the human decided — this is also how the human controls the input going into the next agent (Section 6, roadmap doc).
  4. **Multi-channel scheduling**: run and prioritize jobs across up to 7 channels, respecting each channel's cadence, credentials, and budget.
  5. **Failure handling**: retries with backoff, circuit breakers (Section 8.6), and escalation to the human when a run needs attention rather than failing silently.
  6. **Cost enforcement**: check budget ceilings before triggering expensive steps (Video Generation especially).
- **Explicitly not responsible for**: any creative or analytical judgment — all of that stays inside the agents it calls.
- **MVP status**: **In MVP** — this is the first thing to build well, since everything else depends on it. For the first test, this is a simple custom state machine (Postgres-backed), **not** Google ADK — see Section 5.

---

## 5. Orchestration & Interoperability

- **Long-term design**: sequential/parallel/loop chaining (script → review → video, trend + competitor intel in parallel, revision cycles) maps well onto Google ADK's Workflow Agents, with A2A for external rentability and LiteLLM for per-call model routing.
- **MVP decision**: **do not adopt ADK for the first test.** Learning and integrating a new framework under a 5-week deadline is a real risk, not an accelerant, and the MVP pipeline is a single linear chain with two approval gates — a plain persisted state machine (Section 4.10) does the job with far less new surface area to debug. Revisit ADK once the pattern is proven and the fleet grows past a simple chain (e.g. once Trend Identification + Content Prediction reintroduce parallel branches).
- Everything else from the prior revision (A2A, LiteLLM model flexibility) still holds as the long-term direction — just not on the MVP critical path.

### 5.1 Platform Capability Layers: LLM Calls & Founder Notification/Approval *(added after this document was locked — see `docs/decisions/LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md` for full reasoning)*

This refines the LiteLLM mention above rather than replacing it: per-call model routing isn't only a long-term, ADK-era idea — it's needed starting now, because multiple MVP agents (Intake, Script Generation, Script Review, Video Intelligence's own-draft mode) all make LLM calls, and Section 8.1's model-tiering table (cheap/fast vs. premium, by task shape) is currently enforced only by convention, not by code. Nothing stops a call site from hardcoding one provider's SDK and one model string — which is exactly what Week 1's intake-parsing call did.

**Decision**: any code that calls an LLM, or that notifies the founder and waits for a decision, goes through an internal contract — never a provider's SDK or library directly from business logic. Two capability layers, scoped only to what's actually MVP-active right now (Principle 10):

- **LLM / text-completion layer** (`studio/src/llm/`) — a shared platform layer, alongside `types/` and `models/`, since Intake, Script Generation, Script Review, and Video Intelligence (own-draft) all reach into it. Call sites declare a *purpose* (`intake-parsing`, `script-generation`, `script-review`, `video-intelligence-own-draft`), not a model — a small registry resolves purpose → provider + model, independently configurable per purpose. This is the mechanism that makes Section 8.1's tiering table an enforced config rather than a convention every new call site has to remember. Video/media generation (Video Generation agent, Task 8's TTS/toolchain spike) is explicitly **not** folded into this layer — it's a different shape of call (submit a job → poll/webhook → asset), not a chat completion. The same swappability principle applies there, but its contract gets designed when Task 8's spike actually happens, not guessed at now.
- **Founder notification / approval-gate interface** — lives inside the existing `notify-founder/` folder (already correctly named as a business action, not a vendor), split into an interface (`requestApproval`, `notify`) and a Telegram adapter underneath it. Script Review, Video Intelligence's own-draft gate, and Gate 1/Gate 2 generally call the interface, never `grammy` directly.

**Explicitly deferred, not part of this decision** (Principle 10 — MVP is YouTube-only, single-platform): a `PublishTarget` interface for the Publishing agent, and a per-platform interface for Performance Analytics. `Channel.platform` already anticipates multi-platform at the schema level (Section 6.2), but the Publishing/Analytics agents calling the YouTube API directly is fine for MVP — formalize an interface when a second platform is actually being added, not before. Billing-provider abstraction and trend-data-source abstraction are likewise out of scope — no code exists yet for either.

---

## 6. Multi-Tenancy & Billing Platform (mandatory from v1, dormant for MVP)

### 6.1 Why the schema exists now even though billing doesn't run yet

Unchanged reasoning: retrofitting tenancy later is far more expensive than including it from the first schema. For the MVP, this section is about **schema shape**, not working billing — `UsageEvent` rows get written from day one, but invoicing/shadow-mode billing (6.3) is not required to hit Oct 15.

### 6.2 Core tenancy data model (updated: adds `Channel`)

| Entity | Purpose |
|---|---|
| `Tenant` | Top-level account. The founder's own account is `tenant_id = 1`. |
| **`Channel`** *(new)* | **One of a tenant's channels on a given platform.** Holds niche/topic focus, style/voice guide, brand assets (intro/outro, watermark, voice profile), OAuth credential, posting cadence, per-channel approval-gate settings, and per-channel priors scope. Every pipeline run is scoped by `(tenant_id, channel_id)`, not just `tenant_id`. **Hard-capped at 7 channels per platform per tenant** — see 6.2.1. |

#### 6.2.1 The 7-channel cap is a permanent product rule, not a scope limit

This is a deliberate, standing business decision, not a temporary MVP constraint to be lifted once the platform matures: **a tenant may run at most 7 channels per social platform** (7 on YouTube, and independently up to 7 on Instagram once that's added — not 7 total across platforms). The reasoning, as stated: keeping the system performing well matters more than raw scale — spreading the pipeline's attention (and cost budget) across an unbounded number of channels degrades quality on all of them, so the cap is what keeps every channel actually well-run rather than thinly served. It's the product's positioning, not an artifact of current capacity — hence naming the platform after it.

**Architectural implication**: `AgentQuota`/scheduling should enforce this as a hard validation rule (reject a request to add an 8th `Channel` on a platform for a tenant), not just a soft default. It also simplifies capacity planning — the Orchestrator's per-tenant concurrency and cost-budget logic (Section 8.7) can be sized against a known, fixed ceiling instead of an open-ended "however many channels a tenant adds."
| `User` | A person belonging to a tenant. |
| `AgentCredential` | Per-`channel_id` secrets (e.g. that channel's YouTube OAuth token). Encrypted at rest. |
| `AgentQuota` | **Pooled per `(tenant_id, platform)`** — API units and dollar budget are one shared ceiling across all 7 channels on a platform, not 7 separate per-channel ceilings (resolved 6.4). |
| `UsageEvent` | One row per agent invocation — written from day one, MVP included. |
| `Plan` / `Subscription` / `Invoice` / `InvoiceLineItem` / `Payment` | Unchanged from prior revision — schema present, `shadow` mode not required until after MVP. |
| **`ReviewLog`** *(new)* | One row per review-type decision anywhere in the pipeline — Script Review's score/notes (4.5), Video Intelligence's own-draft pass/fail (4.2), and every human Gate 1/Gate 2 decision (approve/edit/reject). Fields: `tenant_id`, `channel_id`, `pipeline_run_id`, `agent` (or `human`), `verdict`, `rationale`, `timestamp`. Written from day one (MVP), even though nothing consumes it yet — it's the exact "predicted quality vs. actual outcome" data Continuous Learning (4.9) will eventually calibrate against, so building it now is cheap and reconstructing it retroactively later would not be. |

### 6.3 What's shared across all 7 channels vs. channel-specific

| Shared (one implementation, all channels) | Channel-specific (per `Channel` row) |
|---|---|
| Agent code (all 9 agents) | Niche/topic focus |
| Orchestrator engine | Style/voice guide |
| Platform infra (tenancy schema, cost tiers) | Brand assets (intro/outro, watermark, voice profile) |
| UI shell | YouTube OAuth credentials |
| | Posting cadence/schedule |
| | Approval-gate configuration (some channels can graduate to more autonomy sooner than others) |
| | Priors library scope (a fitness channel's top scripts shouldn't bleed into a finance channel's voice) |

Cross-channel learning (e.g. a pattern that works on one channel might inform another) is **opt-in only, off by default** — automatic bleed-through between channels with different niches/voices is a bug, not a feature.

### 6.4 Open questions

Unchanged from prior revision. ~~Whether `AgentQuota`/budget ceilings should default per-channel or be pooled~~ — **resolved: pooled across all 7 under one tenant's per-platform budget** (6.2).

**New implication of pooling (flagging this, not yet resolved)**: a shared pool means one channel can starve the other 6 if nothing allocates fairly within it — e.g. if channel #1's runs happen to process first each day, it could consume the whole platform budget before channels #2–7 ever get scheduled. Pooling the *ceiling* doesn't by itself guarantee fair *access* to it. This needs an allocation policy in the Orchestrator (Section 4.10) — options worth considering later: an equal per-channel reservation within the pool (e.g. ~1/7th guaranteed, remainder first-come), round-robin scheduling across channels regardless of budget, or priority weighting if some channels matter more than others. Not a blocker for the MVP (one channel, nothing to starve yet), but worth deciding before channel #2 goes live in Week 5.

---

## 7. Shared Data/Signal Ingestion & Caching Platform (cost layer, deferred)

Unchanged design from prior revision. **MVP status: deferred** — this exists to make Trend Identification + Video Intelligence (competitor mode) cheap to run at scale, and neither is in the MVP critical path. Build this when Trend Identification is built, not before.

---

## 8. Cost Optimization Strategy

**Governing rule**: pay for a strong model only where intelligence quality directly changes whether a video gets watched. Everywhere else, use the cheapest deterministic or lightweight-model approach that does the job. All principles below still apply to the MVP subset of agents actually built; see the roadmap doc for which are load-bearing on day one (mainly 8.1 and 8.6) versus which wait for the full fleet (8.2, 8.5).

### 8.1 Model tiering by task type

| Task shape | Example agents/steps | Model tier | Why |
|---|---|---|---|
| Classification / scoring / extraction | Intake parsing, Trend scoring, Video Intelligence pattern tagging, Script Review rubric scoring, Video Intelligence own-draft pass/fail | Cheap/fast | High call volume, low marginal value per call. |
| Reasoning / explanation | Content Prediction's "why," Script Review's revision notes | Mid-tier | Read by a human or another agent, not the end viewer. |
| Creative generation | Script Generation | **Premium** | The one place quality directly drives views. Don't cost-optimize this step. |
| Media generation | Video Generation (TTS, visuals, rendering) | N/A — dominated by provider/render cost, not tokens | See 8.4. |

**Known deviation from this table** *(flagged 2026-09-08, by Week 2 Task 3)*: `intake-parsing` is classified above as extraction → cheap/fast tier, but `studio/src/llm/registry.ts`'s actual entry still resolves it to `claude-sonnet-5` (premium) — inherited unchanged from Week 1's original default, never a deliberate tiering choice. Not corrected as part of Task 3 (flagged as a note for whoever picks up model-tiering work, not a scope change for that task). Low cost impact today — Intake is one small call per run — but worth fixing before call volume grows, and before Script Review's own tier gets re-examined for the same reason (Script Review is already on `claude-haiku-4-5`, correctly, so this deviation is Intake-specific, not systemic).

### 8.2 Shared ingestion & caching (Section 7)

The single biggest lever on YouTube API quota cost. Deferred until Trend Identification is built.

### 8.3 Batch over real-time

Trend Identification (6–12h cadence, already locked in `yt_shorts`); Performance Analytics polls on a schedule; Continuous Learning runs weekly/monthly, not per-video.

### 8.4 Cheap draft before expensive final (protects Video Generation)

Nothing reaches full render without passing the (cheap) Script Review gate first — now including the video-generation-fit check added to 4.5.

### 8.5 Retrieval over fine-tuning ("priors")

Script Generation's priors are retrieved few-shot examples, not a fine-tuned model — deferred until there's history to retrieve from.

### 8.6 Circuit breakers

Hard caps on Video Intelligence → Video Generation revision loops, any agent's retry count, and an Orchestrator-level check that refuses to trigger Video Generation below a confidence threshold.

### 8.7 Cost budgets, not just API-unit quotas

`AgentQuota` (Section 6.2) tracks a dollar-cost ceiling, not only raw API units — LLM/generation spend is the dominant cost driver once script and video generation are both running. **Pooled per `(tenant_id, platform)` across all 7 channels** (resolved 6.4), which means the budget-ceiling *check* in the Orchestrator (4.10) is a single shared counter per platform — simpler to implement than 7 separate ceilings — but the *fair-access* question flagged in 6.4 (one channel able to consume the whole pool before others run) still needs an allocation policy before multiple channels are live simultaneously.

### 8.8 Prefer free/cheap signal sources first

YouTube Data API and free trend signals (Google Trends, RSS, Reddit) before any paid vendor.

---

## 9. Relationship to the Existing `yt_shorts` Project

Unchanged from prior revision.

---

## 10. Document & Repository Structure

```
7AI/
├── docs/                                 ← everything in this section, one level down — keeps the repo root to two things: docs/ and code
│   ├── design_doc/
│   │   ├── agents/
│   │   │   ├── all_agents/                  ← this document (fleet overview)
│   │   │   ├── trend-identification/
│   │   │   ├── video-intelligence/          ← merged: competitor-intelligence + video-review
│   │   │   ├── content-prediction/
│   │   │   ├── script-generation/
│   │   │   ├── script-review/
│   │   │   ├── video-generation/
│   │   │   ├── publishing/
│   │   │   ├── performance-analytics/
│   │   │   └── continuous-learning/
│   │   ├── studio/                          ← state-machine design now (MVP), ADK/A2A evaluation later — renamed from "orchestration", see note below
│   │   ├── cost-strategy/                   ← Section 8 detailed spec
│   │   └── platform/
│   │       ├── tenancy-and-billing/         ← Section 6 detailed spec, incl. Channel entity
│   │       └── data-ingestion-and-caching/  ← Section 7 detailed spec (deferred)
│   ├── decisions/                            ← locked fleet-level decisions
│   ├── roadmap/
│   │   └── MVP_ROADMAP_OCT15.md (archived, see docs/ARCHIVE_INDEX.md)             ← communication flow, MVP scope, week-by-week plan to first test
│   └── execution/                            ← week-by-week build docs: schema/business-logic deltas, task instructions, completion reports
│       ├── templates/
│       │   └── TASK_TEMPLATE.md             ← the reusable task-file template, applied from Week 2 onward
│       └── week[N]/
│           ├── WEEK[N]_INSTRUCTIONS.md      ← Week 1 only: a single consolidated kickoff doc pasted to Claude Code
│           ├── SCHEMA.md                    ← this week's DB schema delta against Section 6 above
│           ├── BUSINESS_LOGIC.md            ← this week's state-machine/control-flow delta
│           ├── STATUS.md                    ← one row per task (status, owner, notes) — updated as each task completes
│           ├── tasks/                       ← Week 2+: one file per task, following TASK_TEMPLATE.md
│           └── reports/                     ← Claude Code's completion report per task
└── studio/                               ← the actual code, a self-contained project. See note below.
    ├── package.json, tsconfig.json, eslint.config.js
    ├── node_modules/, dist/
    ├── scripts/
    └── src/                               ← state machine, DB access, Telegram bot
        ├── types/, models/
        ├── run-pipeline/, manage-channels/, notify-founder/
        ├── config/
        └── index.ts
```

**Three changes made after this document was first locked, all purely organizational — nothing in Sections 1–9 changed:**

1. **`docs/` wrapper.** Everything that used to sit directly under `7AI/` (`design_doc/`, `decisions/`, `roadmap/`, and the later-added `execution/`) now lives under `7AI/docs/`, so the repo root separates cleanly into two things: `docs/` (read about the system) and `studio/` (the system itself), rather than four-plus documentation folders sitting flat alongside the code.
2. **`studio/`, not `src/` or "Orchestrator".** The code folder is named `studio/` — a plain business noun for the thing that runs script → video → review → publish, deliberately not "Orchestrator" (architecture jargon) or the generic `src/`. This also reserves the naming pattern for later: when an individual agent's code grows large enough to warrant its own top-level folder (e.g. a future `7AI/scriptwriter/` alongside `docs/design_doc/agents/script-generation/`), it gets a matching business+action name rather than being lumped into one undifferentiated `src/`. For the MVP itself, `studio/` is still one single TypeScript project (one `package.json`, one build) — this doesn't imply separate deployable services yet, per Principle 10 (don't over-engineer the first version). The design-doc folder that pairs with it was renamed to match: `design_doc/orchestration/` → `docs/design_doc/studio/`.
3. **`studio/` is self-contained, not just a renamed `src/`.** The first pass at the rename above left `package.json`/`tsconfig.json`/`node_modules`/`dist`/`scripts` sitting at the `7AI/` repo root, with `studio/` holding only what used to be directly under `src/`. Corrected: `studio/` now owns its own `package.json`, `tsconfig.json`, and build tooling, with the actual code nested one level deeper at `studio/src/`. This directly serves point 2 above — if a future `7AI/scriptwriter/` (or similar) becomes a sibling top-level code folder, each one is independently buildable (`cd studio && npm run build`) rather than sharing one repo-root `package.json` that would need retrofitting later. This still isn't monorepo/workspace tooling — there's one package, just nested one level deeper for the shape to be right when a second one eventually exists.

The term "Orchestrator" stays as-is everywhere else in this document and the roadmap doc (Section 3, 4.10, Section 5, etc.) — this rename is scoped to the folder/file layer only, not a rewrite of the architectural vocabulary used to describe the component.

---

## 11. Open Questions & Suggested Next Steps

See `7AI/docs/roadmap/MVP_ROADMAP_OCT15.md` (archived, see docs/ARCHIVE_INDEX.md) for the concrete, date-driven next steps. Longer-term open questions from prior revisions (orchestration framework choice, model routing config, cost budget thresholds, platform expansion timing) remain open and unaffected by the MVP cut.
