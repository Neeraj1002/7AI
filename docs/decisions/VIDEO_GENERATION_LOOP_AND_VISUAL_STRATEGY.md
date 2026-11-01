# Video Generation: Closing the Review Loop + Two-Path Visual Strategy

**Status**: Decided — Path A (stock footage) approved as the near-term build target. Path B (generative/character video) intentionally deferred, not designed in detail yet.
**Date**: 2026-09-09
**Owner**: Neeraj Singh (founder) — captured from a real architecture discussion, not decided unilaterally
**Extends**: `AGENT_FLEET_DESIGN.md` Section 4.6 (Video Generation Agent), Week 1 Task 8's toolchain spike (`docs/execution/week1/reports/task8.md` (archived, see docs/ARCHIVE_INDEX.md))
**Related, unresolved**: `docs/execution/KNOWN_ISSUES_AND_BLOCKERS.md` §3, the caption/frame-sampling finding this decision directly addresses

## 1. The problem, with real evidence

`video_generation` and `video_review` are wired so a review failure loops back to a new `video_generation` attempt, carrying the review's `fixNotes` forward — the state-machine plumbing is correct. But `video_generation` itself is a purely deterministic pipeline today (TTS call → transcribe → FFmpeg composite onto a solid-color background). There is no decision-making step in it, so there is nothing for `fixNotes` to actually change. A regen attempt reruns the same steps and produces, structurally, the same result.

This isn't theoretical: Week 3 Task 3's real testing hit exactly this. The same run failed `video_review` three times in a row for the identical reason (a flashing-word-caption style combined with midpoint-frame sampling producing a partial-word frame), tripping the regen circuit breaker at its cap — not because the review kept being wrong, but because nothing about the video changed between attempts.

**Conclusion**: review, as built, is a pass/fail gate that eventually escalates to the founder on repeat failure. It is not yet a quality loop that improves output. For a system meant to run mostly unattended, that materially undercuts the point of having automated review at all.

## 2. The fix: give Video Generation an actual decision to make

Add a production-planning step ahead of the deterministic assembly — an LLM call (new `purpose: 'video-production-planning'` in `studio/src/llm/registry.ts`, same boundary pattern as every other LLM call site; no new credential needed, it runs on the existing `ANTHROPIC_API_KEY`) that takes the sanctioned script and, on a retry, the prior attempt's `fixNotes`, and outputs concrete production choices: caption style/timing, background/visual selection, pacing. Attempt 1 has no notes and decides on its own; attempt 2+ gets told specifically what failed and can change the relevant decision — different caption style, different visual, whatever the note calls for — instead of re-running an identical pipeline.

This mirrors the pattern that already works: Script Generation/Script Review close their loop because Script Generation is a re-promptable LLM call. Video Generation needs the equivalent decision point.

No schema change is required — the plan can be written into `pipeline_stages.output` for the `video_generation` stage exactly as everything else already is.

## 3. Two-path visual strategy

The production-planning step above needs to know what kind of visual it's planning *for*. Two genuinely different shapes exist, and the fleet design should support both, per-channel, rather than picking one forever:

### Path A — stock footage + TTS voiceover (near-term, default, build this first)

Real spoken voiceover (already built, Week 3 Task 1, just never activated — no key) over real stock footage (not yet built — background is currently a solid color) with burned captions. Cheap, deterministic-ish, fast to render, matches the original MVP cost/reliability rationale. The production-planning step's job here is: pick search terms/footage for the script's content, pick a caption style, decide pacing — all reviewable by mostly-deterministic rules plus a lightweight LLM sanity check, same cost tier as Script Review.

### Path B — generative/character-consistent video (later, per-channel option, not designed yet)

Real generative video (text/image-to-video, character consistency across shots — the category tools like OpenArt's Text-to-Video/Character/Director-Mode tools serve). A fundamentally different job shape (submit a generation job → poll/webhook → asset, not a synchronous call), a materially higher per-second cost, and a different review rubric (narrative coherence and character consistency, not template-correctness). Some future channels — ones built around a recurring character or a narrative format — will likely want this. Explicitly **not** being designed in detail now; when it's picked up, it should be architected as a second provider behind the same swappable `media`/production-planning boundary, not a replacement for Path A.

## 4. What Path A needs — founder action, concrete steps

1. **Real `OPENAI_API_KEY`** (unblocks the TTS/transcription code that's already built and tested against a stub):
   - platform.openai.com → API keys → create a new secret key.
   - OpenAI requires billing set up before API calls work — add a payment method under Billing.
   - Worth setting a usage/spend limit in the same dashboard while you're there, same spirit as the Anthropic workspace cap you already set up.
   - Add to `.env.local` as `OPENAI_API_KEY`.

2. **A stock-footage API key** (net-new — nothing exists for this yet):
   - Recommended: **Pexels API** (pexels.com/api) — free, generous rate limits, license explicitly permits commercial use including monetized YouTube content, no attribution required. Sign up, request a key (usually instant), add to `.env.local` as `PEXELS_API_KEY`.
   - Fine alternative: Pixabay, same free/commercial-friendly shape, if a particular niche's footage coverage is thin on Pexels.
   - Paid options (Storyblocks, Artgrid) exist for more curated/premium footage — not needed to start; a later call once you have a feel for whether stock quality is actually a bottleneck.

Nothing else is needed for this specific piece of work — no YouTube OAuth (that's still separately open, but it's for publishing, unrelated to generation/review), no new Anthropic scope (the production-planning call runs on the key you already have, under a new purpose).

## 5. Explicitly not decided yet

- Exact caption style Path A should default to (something other than one-word-flash, to stop tripping review on presentation artifacts) — left for implementation, should get real live testing the same way everything else in this project has.
- Video Intelligence's frame-sampling strategy (single midpoint frame vs. multiple frames) — same status.
- Path B's provider, cost ceiling, and review rubric — fully open, intentionally not designed until Path A is real and shipping.
- Whether Path A vs. B becomes a `Channel`-level setting now or gets decided per-channel later — leaning toward per-channel once it exists, not designed yet.
