# Sprint 6 Task 2: Per-Video Disclosure Controls (P5) — interim report (R0 + backend build)

**Branch**: `SPRINT6_TASK2_BE2` · **Worktree**: `D:\Study Material\7AI-SPRINT6\task2b` · **PR**: draft, number in first reply
**Task doc**: committed in 99782b3 (r7). Stale `SPRINT6_TASK2_BE` worktree (`task2`, 21 uncommitted files, disclaimer folder) was left untouched by founder decision; the architect should decide its fate.
**Status**: backend built (R1, R2, R3 backend); app toggle (R3 UI), live renders, sweep (R5) and the AI-use decision still open. Code-complete: no. Merged: no. Deployed: no.

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


## Build status (backend, 29 Oct)

**Rendered copy (exact)**: "Visuals in this video are AI-generated or imagined." One constant, `studio/src/disclaimer/sentence.ts`. Founder changed it from "Some visuals..." on 28 Oct.

**Clip**: Ash, `gpt-4o-mini-tts`, fixed provider voice id and delivery in `disclaimer/asset-spec.ts` (no catalog, channel or run input). Recorded once by `scripts/build-disclaimer-assets.ts --live`, tempo set by the founder to **1.4x** (pitch-preserving `atempo`, applied at record time only), 3.216 s, version `f23eb08d55c3` (hash covers sentence, voice, delivery, pace, level, fades). Manifest in `studio/data/disclaimer/`; `readDisclaimerManifest` refuses a clip that does not match the sentence or version. Spend: about $0.006 of the $0.50 ceiling (5 short recordings). Listening check: founder confirmed tempo; intelligibility at 1.4x confirmed by founder only on tempo ("Tempo is right"); I cannot hear audio.

**Run data contract**: `creationOptions.disclaimer = { enabled, assetVersion, defaultReason }`, no migration. Default: AI stills (every Long) On; brief IMAGINED line On; factual DOCUMENTED-only stock brief Off; cannot tell On. Changed via `runs.create({disclaimerEnabled})` or `runs.updateSettings({disclaimerEnabled})` (refused once the video is made; recorded in settings history). `runs.get.disclaimer` returns enabled, version, reason and the sentence for the app preview. Runs without the field render as today (Off). Note: the default for "imagined" reads only the brief's IMAGINED line; no machine-readable Script Review flag exists.

**Render**: On splices the clip into the narration after the hook (first sentence end) with 0.35 s pads; narration words, chapter markers, scene windows, stock cover, captions and the mix all move by the added seconds (3.916 s with this clip). The clip is set 6 dB under measured narration inside the narration track, so the bed ducks under it and the final loudness stage keeps the ratio. Measured on a stand-in narration: narration -16.1 LUFS, clip window -22.7 LUFS (about 5.7 dB under). Fades 0.25 s in and out. Card: ASS boxed style, dark translucent (about 35% see-through), white text, two balanced lines, top area, fades with the clip, at least 2 s; checked at 360 px wide over a bright frame in both orientations (readable). Short: card burned in the main pass. Long: card burned into the one chapter segment that holds the clip.

**Tests**: `npx vitest run src/agents/video-generation src/disclaimer`: 19 files, 155 passed. `tsc --noEmit` clean apart from the existing missing `@napi-rs/canvas` in the shared `node_modules`; that same missing package makes `src/run-pipeline/*` and `src/api/*` suites fail at load in this worktree (environmental, not from this change; needs `npm ci` with the package present). Those suites are therefore NOT verified.

**Not done**: real first-ten-seconds renders of a Short and a Long (On/Off, two channels) and the added-render-time measurement; app On/Off toggle and preview (R3 UI, suggested as separate `SPRINT6_TASK2_FE`); same-cause sweep (R5); focused tests for Gate 1 disabled and restart; AI-use gap decision; NIYT config and PLAN doc updates for the architect.

## Real renders (29 Oct)

`src/disclaimer/render.integration.test.ts` (real FFmpeg, stub narration and pictures, the real recorded clip): 2 tests passed. Short: Off 27.30 s, On 31.22 s, 3.92 s added; at 4.5 s the On video shows the card and no captions while Off shows its caption. Long: chapter 1 end and chapter 2 start each moved by the same gap; picture length matches audio within 0.3 s; card burned into the chapter segment that holds the clip. First ten seconds kept locally, not committed. Not covered: real narration, a real-voice listening check of the clip over speech, two differently configured channels end to end, render-time effect (stub narration makes it meaningless), Gate 1 disabled, restart. Spend: $0 for this step.

## Same-cause sweep (R5, Hard rule 9) — 29 Oct

Cause: disclosure wording, voice or the `Imagined` tag defined in more than one place; a channel's own voice, sentence or history phrasing standing in for a platform asset; any channel name or single-channel assumption. Searched `studio/src`, `studio/data`, `studio/scripts`, `app/` and the channel and Sprint 6 docs.

| Hit | Disposition |
|---|---|
| Canonical sentence, clip voice, card | One owner each in `studio/src/disclaimer/` (`sentence.ts`, `asset-spec.ts`, `card-ass.ts`). Tests (`guards.test.ts`) fail if these files import channels, profiles, the voice catalog or the registry, or if the splice takes a voice, channel or profile parameter. No channel name appears in any new file or test. **Fixed here.** |
| In-video `Imagined` tag code | None existed in `studio/` or `app/`. Nothing to remove. |
| `studio/src/agents/publishing/packaging.ts` (description template) | Uses the channel's own `descriptionTemplate`; no hardcoded disclosure wording. **Left alone** (decision 2: description and pinned comment unchanged; P11 owns comments). |
| "reconstruction" / "imagined" in `script-review`, `plan.ts`, `plan-long.ts`, `video-intelligence`, `packaging/prompts.ts`, `still-check.ts` | Reviewer rules, scene-purpose enum and picture prompts; none is viewer-facing and none is the disclaimer. **Left alone.** |
| `studio/src/media/voice-catalog.config.ts:28` ("AI-generated audio; tell listeners the voice is AI-generated") | Confirms the AI-narration gap: `deriveContainsSyntheticMedia` ignores it. **Needs a new task / architect decision** (compliance; not changed quietly). |
| `app/app/(app)/channel/[id]/profile.tsx:329` ("AI-generated visuals are flagged as synthetic content on upload") | True for AI stills but incomplete (ignores narration; does not say the in-video disclaimer is separate). **Needs the FE change** (R3 UI states that the YouTube label is separate and may appear with Off). |
| Test fixtures `long-form/fixtures/briefs/*.txt` | Brief IMAGINED lines are legitimate brief input and the default's signal. **Left alone.** |
| `docs/channel_bibles/NIYT_CHANNEL_CONFIG.md` (spoken first-sentence disclaimer, description creative-liberty line, pinned comment, "(Imagined)" title tag, section 14 item 8) | Would duplicate the shared clip when On. **Doc hit for the architect**; I did not edit it. |
| `docs/execution/sprint6/PLAN.md` lines 48, 81, 97, 102, 108 | Still describe the old sentence, the 2x clip and the frame-zero tag. **Doc hit for the architect.** |
| `docs/execution/sprint6/tasks/task2.md` decision 3 | Placeholder sentence and 1x pace; actual: sentence "Visuals in this video are AI-generated or imagined.", 1.4x tempo. **Doc hit for the architect.** |
| Old worktree `task2` (branch `SPRINT6_TASK2_BE`) | Has an earlier, uncommitted disclaimer build; untouched. **Architect decision.** |

## Added tests and results (29 Oct)

- `src/disclaimer/guards.test.ts`: platform-asset isolation (including "two channels with different narration voices get the same clip"), the AI-use derivation independent of the toggle, JSON round trip and restart, old runs unchanged, default independent of Gate 1 (set at creation), two videos on one channel differing.
- `runs.create` tests updated for the new stored `disclaimer` choice; new test for default from visuals and an explicit override. A rerun keeps the choice and refreshes the asset version.
- With `@napi-rs/canvas` now resolvable (this worktree's `node_modules` junction points at the Task 1b checkout's), `src/run-pipeline` and `src/api`: 63 files passed, 524 tests passed, 6 failed before the test update above; after it, the two affected files pass (56). `tsc --noEmit` and `eslint` on the changed files are clean.
- Not verified: Gate 1 disabled end to end and a process restart in a live run (covered only by the persistence and creation-time tests above).
