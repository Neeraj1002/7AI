# Week 1 Task 8: TTS + Video-Assembly Toolchain Spike

**Date**: 2026-09-07
**Status**: Complete — recommendation given, resolves `MVP_ROADMAP_OCT15.md` Section 15, Open Question 1
**Time-box**: research only, no code — per the 1–2 day time-box in `MVP_ROADMAP_OCT15.md` Section 14 (Risk #1)

## Objective

Recommend a TTS / auto-captions / template-visuals toolchain for the MVP, deliberately avoiding full generative-AI video per Section 14: "TTS voiceover, auto-captions, and template/stock visuals rather than full generative AI video. Prove the loop with something unglamorous but reliable."

## Recommendation

| Layer | Choice | Why |
|---|---|---|
| **TTS** | OpenAI TTS API (`tts-1-hd`, upgrading to `gpt-4o-mini-tts` if steerability is needed) | ~$15/1M characters vs. ElevenLabs' ~$165/1M at comparable tiers — a 10x cost delta that compounds across 7 channels posting daily. Quality is "good enough" for MVP voiceover; simple single-call REST API, no separate voice-cloning workflow needed yet. |
| **Captions** | Hosted transcription (OpenAI transcription API or equivalent) with word-level timestamp granularity, rendered to `.srt`/`.ass` | Avoids standing up GPU infra (self-hosted WhisperX) for MVP-scale volume. Segment-level timestamps drift by hundreds of ms; request word-level granularity specifically so burned-in captions land on the right word, not just the right sentence. |
| **Visual assembly** | FFmpeg, scripted directly (no paid rendering SaaS) | Zero subscription cost, full control, matches the "cron + Postgres, no magic" philosophy already established in `SCHEMA.md`'s enum-strategy section. Composite: looped/stock background clip + burned caption track (FFmpeg `subtitles` filter) + brand overlay (intro/outro/watermark from `Channel.brandAssets`). |

### What this explicitly rejects, and why

- **ElevenLabs as the default voice**: reserved as a later per-channel upgrade path once voice becomes a real differentiator — `Channel.brandAssets.voiceProfileId` already anticipates this pluggable slot in `SCHEMA.md`, so switching later is a config change, not a rearchitecture.
- **Remotion / Creatomate / Shotstack** for assembly: these are strong tools, but add either a recurring SaaS bill ($54–500+/mo) or a headless-Chromium rendering pipeline — more infrastructure than a single-channel MVP proving the *pipeline*, not the *visual polish*, justifies. Revisit once caption/visual quality itself becomes the bottleneck rather than "does the loop run end to end."
- **Self-hosted WhisperX**: better word-timestamp precision (sub-100ms via forced phoneme alignment) and no per-call cost at volume, but needs GPU infra to run at reasonable speed. Worth revisiting once per-video LLM/TTS/transcription cost is being tracked seriously (Week 2+ `UsageEvent` metering) and volume justifies the infra.

## Confidence caveat

Pricing and comparison figures above come from web search against 2026-current sources; several of the comparison sites returned are SEO/content-marketing pages rather than the vendors' own pricing pages. Treat the relative ordering (OpenAI TTS cheaper than ElevenLabs by roughly an order of magnitude; FFmpeg free vs. Remotion/Creatomate paid) as reliable, but re-verify exact per-unit pricing against OpenAI's and ElevenLabs' own pricing pages before wiring real billing/cost-tracking logic in Week 2+.

## What this unlocks for Week 3 (Video Generation design)

- TTS call: text-in, audio-file-out — a single external API call, retryable via the same `retry-with-backoff.ts` wrapper this week already built generically.
- Captions: audio-in, timestamped-text-out — same shape.
- Assembly: a deterministic FFmpeg command built from (background asset, caption file, brand assets) — no non-deterministic generative step, which keeps Video Review (Week 3) simple: it's checking composition correctness, not evaluating open-ended generated content quality.

## Roadmap Update

`MVP_ROADMAP_OCT15.md` Section 15, Open Question 1 updated from 🟡 to ✅ (see that file).

## Sign-Off

- Task Objective: Met — written recommendation exists, detailed enough for Week 3's Video Generation design to lock to
- Tests: N/A (research task, no code)
- Ready for Integration: Yes
