# Sprint 6 Task 2: Per-Video Disclosure Controls (P5) — R0 report (interim)

**Branch**: `SPRINT6_TASK2_BE2` · **Worktree**: `D:\Study Material\7AI-SPRINT6\task2b` · **PR**: draft, number in first reply
**Task doc**: committed in 99782b3 (r7). Stale `SPRINT6_TASK2_BE` worktree (`task2`, 21 uncommitted files, disclaimer folder) was left untouched by founder decision; the architect should decide its fate.
**Status**: R0 only. No code changed. Sentence not yet supplied by the founder.

## R0 table (confirmed / wrong / unknown)

| Question | Result | Evidence |
|---|---|---|
| Any in-video disclosure or `Imagined` tag rendered today? | **Confirmed: none.** Only hits for "imagined/reconstruction" are script-review rules, scene-purpose enums, scene prompts and packaging face rules; none render text or audio. | grep of `studio/src`, `app/` |
| Where can a per-run On/Off be saved before paid rendering? | **Confirmed**: `PipelineRun.creationOptions` (Json?, nullable, no backfill; `models/schema.prisma:268`). Written at create (`api/routers/runs.ts` ~751) and edited via `runs.updateSettings` (~1225), which preflights and can retry. No migration needed. Null on old runs = Off. | files cited |
| One pre-made clip reused with no per-video speech call? | **Unknown / not yet proven.** Render takes one `voicePath` and mixes in `buildAudioFilterGraph` (`audio-mix.ts`); an extra input for the clip is feasible, no speech call needed at render. Needs a spike. | `video-generation/index.ts:256,625-690` |
| Asset versioning/insertion | **Unknown.** No fixed-asset mechanism found; `studio/data/` and `assets` are candidates. Chapter segments are hash-signed (`long-render.ts:161`), so a version in the signature gives replay safety. | |
| `containsSyntheticMedia` | **Confirmed gap**: `deriveContainsSyntheticMedia` (`state-machine.ts:2002`) is true only when `plan.visualSource === 'ai-stills'`. It ignores the OpenAI TTS narration voice. Not changed (report-first rule). Flows to `upload` at `state-machine.ts:2085/2228`. | |
| Gate 1 disabled / in-flight runs | **Partly confirmed**: `gate1Enabled === false` auto-approves (`state-machine.ts:588`), so the toggle needs a default resolved at run creation, not at Gate 1. Old runs have null creationOptions, so they render as today. | |
| Ash voice by fixed provider id, bypassing channel path? | **Partly confirmed**: `synthesizeSpeechViaProvider` (`media/client.ts:55`) takes a `VoiceConfig`, maps via `providerVoiceFor` and a catalog direction. `ash` is catalog entry (`voice-catalog.config.ts:54`, no direction). A one-off script can call the OpenAI client with a literal `ash` + fixed `instructions` (gpt-4o-mini-tts only) without touching the catalog. Soft delivery availability: **unknown until the live clip is generated**. | |
| Clip mixed before final loudness, level relative to narration, ducking | **Feasible, unproven.** Graph: voice split into key + voice, bed sidechain-ducked, `amix normalize=0`, then `loudnorm` last. Add the clip as a delayed (`adelay`) input at ~narration -6 dB with `afade`, and feed it into the sidechain key so the bed ducks. Loudnorm is linear from a pass-1 measurement, so a quiet clip keeps its ratio. `measureMixLoudness` must receive the same graph. | `audio-mix.ts:43-81` |
| Timing effect of inserting the clip | **Confirmed to be the hard part.** Captions, scene windows and (Long) `chapterTimings` come from ASR/narration times (`index.ts:240-260,482`; `long-narration.ts:162-250`; `scene-alignment.ts`). Inserting a gap of N seconds after the hook needs a shift of every later time (captions, scene windows, chapter markers in description) and a held or continued picture during the gap. Simplest safe route: split narration audio at the hook boundary and insert silence+clip, shifting `words`/`chapterTimings` by N. Short and Long are separate code paths (`index.ts`, `long-form.ts`/`long-render.ts`). | |
| Signals for the script-derived default | **Confirmed available**: brief `IMAGINED:` line (regex used in `script-review/grounded-findings.ts:11`); Script Review output; resolved visual source (`resolved-options.ts`, same value that drives the AI flag). A Long is ai-stills only, so every Long defaults On. No signal for "script contains imagined passages" beyond the brief line: **unknown** whether Script Review exposes a machine-readable flag. | |
| Hardcoded voice/wording/history assumptions outside the shared asset | **Found**: (1) `docs/channel_bibles/NIYT_CHANNEL_CONFIG.md` requires an exact spoken first-sentence disclaimer, a description line ("This is a dramatised, imagined scene...", ~line 233), a pinned comment, and an optional "(Imagined)" title tag (~line 306); hook-order decision at §14 item 8. (2) `agents/publishing/packaging.ts:59-81` appends the profile description template. (3) NIYT fixtures `long-form/fixtures/briefs/*.txt` use IMAGINED lines (legitimate brief input, not a disclaimer). (4) Script-review rules and scene prompts say "reconstruction"; these are review/visual wording, not viewer-facing. No channel voice reaches a disclaimer today (none exists). | |

## Compatibility
Old and in-flight runs: null creationOptions field, treated Off, no render change. No schema change assumed (Json column).

## Proposed run data contract (not yet built)
`creationOptions.disclaimer = { enabled: boolean, assetVersion: string, defaultReason: 'imagined'|'ai-visuals'|'unknown'|'factual' }`, written at run creation, editable only through `updateSettings` (which re-runs video_generation preflight).

## Open items for the founder / architect
1. **Sentence text** still needed (decision 3a). Nothing will be generated or spent until supplied.
2. AI-use gap: narration is AI TTS but the flag ignores it. Needs an architect decision (small fix vs own task).
3. Fate of the stale `SPRINT6_TASK2_BE` worktree.
4. Timing approach (split-and-shift) is a design choice with some risk on the Long path; confirm before build.
5. Docs needing architect updates after build: NIYT config (spoken first sentence, description line, title tag, §14 item 8), Sprint 6 PLAN.

## Hard rules
Rule 5: task doc r7 copied from the source and committed alone (99782b3). Rules 6, 8, 9: not yet applicable (no build; sweep happens in R5 after the sentence exists). No spend so far ($0).
