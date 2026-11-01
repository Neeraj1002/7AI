# Decision: LLM & Notification Capability Layers (Provider-Agnostic, Purpose-Configurable)

**Date**: 2026-09-07 (registry shape, fallback, and library-boundary mechanics resolved same day, in a follow-up pass — see "Decision" below)
**Status**: Design decided, including implementation mechanics. Implementation pending — Week 1's `parse-brief.ts` still calls `@anthropic-ai/sdk` directly, as a known, deliberate temporary coupling (see "Current state" below), not an oversight.
**Related**: `AGENT_FLEET_DESIGN.md` Section 5.1 (this decision, summarized) and Section 8.1 (model tiering); `docs/execution/week1/BUSINESS_LOGIC.md` Section 2 (Intake Parsing)

## Why

`studio/src/run-pipeline/parse-brief.ts` (Task 5) is written directly against `@anthropic-ai/sdk`: it instantiates an `Anthropic` client, hardcodes `MODEL = 'claude-sonnet-5'` as a literal, and its transient-vs-permanent retry logic is typed against Anthropic's own error classes (`APIConnectionError`, `RateLimitError`, `InternalServerError`). Separately, `studio/src/notify-founder/bot.ts` is written directly against `grammy` (Telegram's library).

Neither is wrong for a Week 1 skeleton, but both are about to become load-bearing patterns: Script Generation, Script Review, and Video Intelligence's own-draft mode (all MVP-active, Section 3) will each need to make LLM calls in the next few weeks, and Gate 1/Gate 2 (also MVP-active) will each need to notify the founder and wait for a decision. If each of those is built the way `parse-brief.ts` was, switching a model (pricing change, a stronger model launches) or a notification channel becomes a multi-file rewrite instead of a config change — and the founder has already said explicitly he doesn't want any agent locked to one LLM vendor, since model choice will likely shift with pricing/launches over the system's life.

This also isn't a new idea for the design — `AGENT_FLEET_DESIGN.md` Section 5 already named "LiteLLM for per-call model routing" as part of the long-term direction, and Section 8.1 already specifies that different task shapes should run on different model tiers. What was missing was code that actually enforces that, rather than leaving it to convention.

## Decision

Any code that calls an LLM, or that notifies the founder and waits for a decision, goes through an internal contract — never a provider's SDK or library directly from business logic.

**LLM / text-completion layer** — `studio/src/llm/`, a shared platform layer alongside `studio/src/types/` and `studio/src/models/` (not a business-action folder, since multiple agents consume it). Call sites declare a *purpose* — `intake-parsing`, `script-generation`, `script-review`, `video-intelligence-own-draft` — not a model or provider. A small registry resolves purpose → actual provider + model, independently configurable per purpose. Errors get normalized to `TransientStageError`/`NonTransientStageError` (the existing taxonomy from `retry-with-backoff.ts`) at the adapter boundary — call sites never import or check against any provider's error types.

*Registry shape*: a typed config map in `studio/src/llm/registry.ts` — `Record<Purpose, { provider, model }>` — not env vars, not an external config file. Env vars earn their keep when config needs to change without a redeploy (different values per environment, ops flipping something in prod); a solo-founder, single-environment MVP doesn't have that need, and a typed map is git-reviewed and type-checked, with no per-purpose env-var naming convention to invent (`LLM_MODEL_SCRIPT_GENERATION`, then eventually `LLM_TEMPERATURE_SCRIPT_GENERATION`, and so on). Env vars stay reserved for actual secrets (the API key itself). A config file was ruled out as pure overhead — a parser and a schema to keep in sync with code, for something only the founder edits, rarely.

*No cross-provider fallback for MVP.* The registry resolves exactly one provider+model per purpose — no automatic fallback to a different provider if the resolved one fails. The existing retry/circuit-breaker logic (`retry-with-backoff.ts`) already covers the failure mode that's actually likely (a transient error on the one provider in use); cross-provider fallback is a materially bigger feature — it means defining behavioral equivalence between models and testing prompts against multiple providers — worth building once a real outage has actually happened, not preemptively. This costs nothing toward the coupling goal: which provider+model serves a purpose stays independently swappable either way, since fallback is a separate concern from swappability.

*Library choice, and how it stays a real boundary*: built internally on top of Vercel AI SDK rather than hand-rolled provider adapters — hand-writing and maintaining adapters for Anthropic/Groq/Gemini is the over-engineering path here, re-solving an already-solved problem. But the library must not leak past the layer, or "loosely coupled" becomes nominal rather than real: only one file, `studio/src/llm/client.ts`, is allowed to import the library or any provider SDK. Everything `studio/src/llm/` exports outward (`studio/src/llm/index.ts`) — request shape, response shape, error types — is defined once, as this project's own types, translated from the library's shapes inside `client.ts`. Call sites never see the library's types. The test that makes this real: the library itself should be replaceable by rewriting one internal file, with zero call sites touched.

This layer is text-completion only. Video/media generation (Video Generation agent, Task 8's TTS/toolchain spike) is a different shape of call entirely — submit a job, poll or get a webhook, then fetch an asset — not a chat completion, so it does not get folded into `studio/src/llm/`. The same swappability principle applies to it, but its contract gets designed when Task 8's spike actually happens, against real toolchain options, not guessed at now.

**Founder notification / approval-gate interface** — lives inside the existing `studio/src/notify-founder/` folder, not a new top-level layer. `notify-founder/` is already correctly named as a business action rather than a vendor, so the fix is internal: split into an interface (`requestApproval(...)`, `notify(...)`) and a Telegram adapter underneath. Script Review, Video Intelligence's own-draft gate, and Gate 1/Gate 2 generally call the interface, never `grammy` directly.

The exact interface signature stays deferred to Week 2/Gate 1, as originally decided — but this is a low-risk deferral, not a real unknown. `MVP_ROADMAP_OCT15.md` (archived, see docs/ARCHIVE_INDEX.md) Section 17 already sketches Gate 1's reply grammar (approve / reject-with-reason / edited-text) in enough detail that `requestApproval(...)`'s shape is mostly a formalization of something already decided elsewhere, not a fresh design done under time pressure in Week 2.

## Scope — filtered to MVP-active components only (Principle 10: don't over-engineer)

**In scope now** (actively about to be built against):
- LLM / text-completion layer
- Founder notification / approval-gate interface

**Named, not built now** (real, but the trigger for building it hasn't happened yet):
- Video/media-generation contract for Video Generation — designed during Task 8's spike, once there's a real toolchain choice to design around.

**Explicitly deferred, not part of this decision** (MVP is YouTube-only, single-platform — Section 3):
- `PublishTarget` interface for the Publishing agent. `Channel.platform` already anticipates multi-platform at the schema level, but the Publishing agent calling the YouTube Data API directly is fine for MVP — formalize when a second platform is actually being added.
- Per-platform interface for Performance Analytics — same reasoning.
- Billing-provider abstraction, trend-data-source abstraction — no code exists yet for either; not relevant until those agents/features are actually built.

## Current state (as of this decision)

Week 1 Task 5 (`parse-brief.ts`) predates this decision and is being left calling `@anthropic-ai/sdk` directly for now, rather than immediately refactored — Task 4/5 is separately blocked on real-LLM verification (no API key available yet) and is proceeding with a stubbed LLM response in the meantime, with the deviation documented in that task's own completion report. `parse-brief.ts` gets refactored to call through `studio/src/llm/` once that layer exists — likely as part of the same work that builds the layer for Script Generation (Week 2), since that's the first genuinely new consumer of it.

## Resolved follow-ups (2026-09-07)

The four items originally left open were resolved the same day, in a follow-up discussion, and are now folded into the Decision section above:

- **Registry shape** → typed config map (`studio/src/llm/registry.ts`), not env vars or a config file.
- **Cross-provider fallback** → not for MVP; one provider+model per purpose, existing retry/circuit-breaker logic is sufficient.
- **Approval interface signature** → stays deferred to Week 2/Gate 1 (unchanged call), noted as low-risk since the roadmap already sketches the reply grammar.
- **Library vs. hand-rolled adapters** → Vercel AI SDK, confined entirely inside `studio/src/llm/client.ts` so it never becomes a second vendor lock-in.

## Still open

Nothing at the decision level. Remaining detail (exact `Purpose` enum values, `client.ts`'s precise translation logic, the library's pinned version) is implementation detail for whoever writes `studio/src/llm/` — left to that work, not pre-decided here.
