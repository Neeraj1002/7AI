# Sprint 2 Status: Flexible Creation + Content Intelligence

**Sprint status**: Tasks 1-2 done. Task 1 built a real per-channel default voice and a real,
explicit, per-brief `voice` override, replacing "whatever `media/registry.ts` happens to resolve" —
also the foundation (`PipelineRun.creationOptions`, the resolution-order pattern) the rest of the
sprint's flexible-creation work builds on. Task 2 added a real second visual-source path
(AI-generated stills, Ken-Burns animated) alongside stock footage, a matching Video Intelligence
rubric variant, and the real YouTube synthetic-media disclosure flag — plus found and fixed a real,
severe FFmpeg performance bug along the way (see its own report).
**Last updated**: 2026-09-15 (after Task 2)

| Task | Name | Status | Owner | Notes |
|---|---|---|---|---|
| 1 | Voice Selection & Structured Creation Choices | Done | Claude Code | D1: `media/registry.ts` gained `TTS_VOICES` (the 13 real OpenAI preset voices, sourced from the installed SDK's own types, not guessed), `DEFAULT_TTS_VOICE`, and a pure `resolveVoice` three-step resolution function. `generateVideo` now threads a real voice into `synthesizeSpeech` instead of always taking the hardcoded default. D2: real Prisma migration (`Channel.defaultVoice`, `PipelineRun.creationOptions`); `api/routers/runs.ts`'s brief-submission input gains a real, validated `voice` field, stored separately from `intakeParsed` (never inferred by `parse-brief.ts`'s LLM call). Verified live: three real, full `video_generation` runs (real TTS, real stock footage), each confirmed against the actual OpenAI request payload — explicit override wins (`nova`), channel default when unset (`shimmer`), and the regression-critical case of neither (`alloy`, unchanged from before this task). See `reports/task1.md`. |
| 2 | A Second Visual-Source Backend — AI-Generated Stills + Synthetic-Content Disclosure | Done | Claude Code | E1: new `ai-visuals/` module (mirrors `stock-footage/`'s client/stub/registry/index split), real provider decision `gpt-image-1.5` (not the soon-deprecated `gpt-image-1`, checked live). E2: `ProductionPlanSchema` gained `visualSource`/`stillScenePrompts`; `generateVideo` branches into stock-footage vs. a real Ken-Burns (zoompan) assembly from generated stills, converging on a shared `visualPath` before all downstream assembly. E3: Video Intelligence's review prompt gained an ai-stills-aware carve-out — verified live via the reviewer's own language ("stylized lighthouse illustrations"), proving it isn't penalizing AI-generated style, only genuine content-relevance (a legitimate bar, applied identically either way). E4: real `containsSyntheticMedia` on the YouTube upload request, derived from `plan.visualSource`, verified two ways — a mocked-client test asserting the real multipart request body, and a live stub-upload run confirming `false` for stock-footage end-to-end. **Real, live finding, fixed within this task**: an early `buildKenBurnsVideo` combined a looped-input `-t` duration with `zoompan`'s own `d=` parameter, double-multiplying frame count — an 8+ hour real failure before being diagnosed and fixed (switched to independently-encoded per-segment files joined via the concat demuxer; verified at ~17s for a 3-still test, ~60-70s for a full real stage). See `reports/task2.md`. |

## Full detail
Per-task reports: `reports/task1.md`, `reports/task2.md`.

## Open items closed by Task 1
- `MVP_PART2_MULTI_USER_AND_FLEXIBLE_CREATION.md` Section 2's "Voice" item — **closed**. Section 2's
  "Visual style" item is explicitly Task 2's, not this task's — see that doc's own "two different
  requests, not one" framing.

## Open items closed by Task 2
- `MVP_PART2_MULTI_USER_AND_FLEXIBLE_CREATION.md` Section 2's "Visual style" item — **closed**.
- `MVP_PART3_CONTENT_QUALITY_AND_GROWTH_LOOP.md` §1's synthetic-content disclosure item — **closed**.

## Open items carried forward
- **`Channel.defaultVoice` has no in-app settings UI** — set via a founder-operator script
  (`scripts/set-channel-default-voice.ts`), same posture as every other channel-level MVP setting
  (`budgetOverrideUsd`, `postingCadence`, etc.). Real settings UI is Part 2 territory, not this
  sprint's scope.
- **No DB-level `CHECK` constraint validates `Channel.defaultVoice` against `TTS_VOICES`'s known
  keys** — enforced at the API edge and at the one script that writes it, not by Postgres itself.
  Same posture as every other free-text-ish nullable `Channel` column already in this schema.
- **Full generative AI video** — deliberately not attempted; `ai-stills` (animated stills) was this
  task's real scope per the design doc's own "smaller lift" recommendation. See
  `KNOWN_ISSUES_AND_BLOCKERS.md` §6.
- **A real, unrelated `extractJsonText` parsing gap, found during Task 2's regression testing** —
  a real Video Intelligence multimodal review call returned its JSON wrapped in a markdown code
  fence despite the prompt's explicit "no markdown code fences" instruction, and `extractJsonText`
  didn't strip it, causing a `NonTransientStageError` and escalating a real, otherwise-fine run to
  `needs_attention`. Not a Task 2 regression (this is Script Review/Video Intelligence's own JSON
  parsing, unrelated to visual-source logic) — not fixed here, logged in
  `KNOWN_ISSUES_AND_BLOCKERS.md` §3 as a real, pre-existing robustness gap.
