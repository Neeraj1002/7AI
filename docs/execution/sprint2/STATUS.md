# Sprint 2 Status: Flexible Creation + Content Intelligence

**Sprint status**: Task 1 done — a real per-channel default voice and a real, explicit, per-brief
`voice` override now exist, replacing "whatever `media/registry.ts` happens to resolve." This is
also the foundation the rest of the sprint's flexible-creation work (visual style, audio layer)
builds on: the `PipelineRun.creationOptions` column and the three-step resolution order are both
designed to be extended, not re-invented, by later tasks.
**Last updated**: 2026-09-14 (after Task 1)

| Task | Name | Status | Owner | Notes |
|---|---|---|---|---|
| 1 | Voice Selection & Structured Creation Choices | Done | Claude Code | D1: `media/registry.ts` gained `TTS_VOICES` (the 13 real OpenAI preset voices, sourced from the installed SDK's own types, not guessed), `DEFAULT_TTS_VOICE`, and a pure `resolveVoice` three-step resolution function. `generateVideo` now threads a real voice into `synthesizeSpeech` instead of always taking the hardcoded default. D2: real Prisma migration (`Channel.defaultVoice`, `PipelineRun.creationOptions`); `api/routers/runs.ts`'s brief-submission input gains a real, validated `voice` field, stored separately from `intakeParsed` (never inferred by `parse-brief.ts`'s LLM call). Verified live: three real, full `video_generation` runs (real TTS, real stock footage), each confirmed against the actual OpenAI request payload — explicit override wins (`nova`), channel default when unset (`shimmer`), and the regression-critical case of neither (`alloy`, unchanged from before this task). See `reports/task1.md`. |

## Full detail
Per-task reports: `reports/task1.md`.

## Open items closed by Task 1
- `MVP_PART2_MULTI_USER_AND_FLEXIBLE_CREATION.md` Section 2's "Voice" item — **closed**. Section 2's
  "Visual style" item is explicitly Task 2's, not this task's — see that doc's own "two different
  requests, not one" framing.

## Open items carried forward
- **`Channel.defaultVoice` has no in-app settings UI** — set via a founder-operator script
  (`scripts/set-channel-default-voice.ts`), same posture as every other channel-level MVP setting
  (`budgetOverrideUsd`, `postingCadence`, etc.). Real settings UI is Part 2 territory, not this
  sprint's scope.
- **No DB-level `CHECK` constraint validates `Channel.defaultVoice` against `TTS_VOICES`'s known
  keys** — enforced at the API edge and at the one script that writes it, not by Postgres itself.
  Same posture as every other free-text-ish nullable `Channel` column already in this schema.
