# Sprint 6 Task 2: Per-Video Disclosure Controls (P5)

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** It defines the Git Workflow, the Hard rules (5 to 9: task doc sync, pull `main` before ready, who owns which doc, close after merge, same-cause sweep), the `STATUS.md` rule and the report shape. This file states only this task's specifics. Keep every reply to the founder to 3 lines; only the report is long. Do not edit `STATUS.md`, `PLAN.md` or any doc except your own report and the docs named in the Report section.

**Revision**: r7, 2026-10-26. The disclaimer sentence, voice and card are shared platform assets owned by no channel, and they must sound and look soft: one neutral sentence in one code constant, the clip pre-rendered once at natural pace (1x, recommended), quieter than the narration, with a soft fade in and out; the card smaller, softer and never full-screen. The script-derived default now counts AI-generated visuals. R0 also reports any voice, wording or history assumption hardcoded outside the shared asset. r6 made the default script-derived with no setting and no channel names; r5 added the clip method, the report-first rule for the AI-use gap, the spend ceiling and the sweep.

**Written**: 2026-10-24 by the architect chat, at the founder's request; r7 by the task writer. **Status**: not started. **Priority**: P2. Runs **before** Sprint 6 Task 1 PR C (both change the Short opening); independent of Task 1 PR A and PR B, so start now. **Branch**: `SPRINT6_TASK2_BE` (add `SPRINT6_TASK2_FE` only if R0 shows the app change should be separate); worktree `task2` under `D:\Study Material\7AI-SPRINT6`. Give branch, worktree and PR in your first reply and at the top of the report (Hard rule 7).

**Founder direction (2026-10-24, amended 2026-10-26)**: One fixed disclaimer sentence, one fixed voice clip and one unbranded dark translucent card, adapted only for 9:16 and 16:9 framing. **From 26 Oct they are platform assets shared by every channel and owned by no channel: no channel's voice setting, profile, style guide or story guide feeds the sentence, the voice or the card, and none can change them.** They must sound and look soft. Each video has one disclaimer choice: `on` plays the clip and shows the card together after the hook; `off` uses neither and hides the optional `Imagined` tag. The sentence, voice and visual are never edited per video. The YouTube AI-use declaration remains independent of this choice. The 24 Oct sentence ("This video includes imagined reconstructions.") and the 2x clip are superseded.

**Founder decisions still open (recommendations given)**
1. **Toggle default (decided 25 Oct: derived from the script, no setting; widened 26 Oct).** For each new run the system sets the default itself: **On** when the script contains imagined or dramatised passages **or the video's visuals are AI-generated**, **Off** when the script is purely factual and the visuals are not AI-generated, and **On when it cannot tell**. R0 finds the signals that already exist: the brief's IMAGINED allowance, the script's own imagined passages, what Script Review detects, and the run's resolved visual source (the AI-stills value that already drives the YouTube flag). Plain consequence to confirm in R0: a Long is AI stills only, so every Long defaults On; Off is the default only for a purely factual stock-footage Short. The founder changes it per video with one tap; that tap is the only human choice. There is no per-channel default and no channel setting. Runs created or in flight before this ships render exactly as today (no card, no clip, no tag) and show the control as Off until the founder changes it.
2. **Description and pinned-comment wording.** Recommendation: keep the current description disclosure and pinned-comment wording as they are; the short fixed sentence serves the video only. No comment automation is added by this task (P11 owns that).
3. **Sentence and pace (26 Oct; both are inputs the founder supplies or confirms).** (a) **Sentence:** one neutral sentence, true for every channel (a history channel's reconstructions and a utility channel's AI-generated visuals alike), chosen by the founder: **`<FOUNDER-CHOSEN NEUTRAL SENTENCE: pending, the founder supplies the exact text before the clip is generated>`**. It lives in one code constant with one owner (R0 names the module; R5 removes every other copy). (b) **Pace:** the clip is pre-rendered once at **1x, natural pace (recommended)**. The 2x speed is dropped: a hurried clip is the opposite of soft, and at 1x a sentence this short adds roughly a second and a half. Softness comes from a lower level and a fade, not from speed. R2 requires the listening check at this pace; if a word is not clearly intelligible, report it with one alternative sample and the founder decides. Until the founder supplies the sentence, build everything against the constant and a clearly marked placeholder value that cannot reach a real render (the live clip and the render checks wait for the real text).

**Objective**: let the founder choose, per video on any channel, a fixed, soft, platform-wide disclaimer treatment (the same sentence, voice and card for every channel) while keeping the hook first and leaving YouTube's required AI-use declaration accurate.
**Duration**: to estimate after R0.
**Depends On**: existing channel profile, run creation and approval, renderer and audio, publisher contracts. Task 1's thumbnail tool does not depend on this task.
**Owning Component**: per-run creation and approval, shared disclaimer assets (no channel owns them), video rendering and audio, publisher, app controls. Confirm exact owners in R0.
**Success Criteria**: the founder can turn the disclaimer On or Off for one Short or Long without changing other videos or channels. Every On video uses the same approved sentence, voice and visual together after the hook, with no per-video copy field and no channel influence on any of the three. The clip is audibly quieter than the narration and fades softly; the card is small, soft and never full-screen. The YouTube AI-use field stays accurate whatever the toggle says.

## Task Requirement

Sprint 6 P5 (the disclosure need first raised in the NIYT test channel's gap register, G5, but built for every channel), with the founder's 24 Oct fixed-disclaimer direction and the 26 Oct shared-and-soft amendment controlling the in-video treatment for every channel. Do not add editable in-video wording, voice or look to profiles or runs. **No new settings and no channel names.** Nothing here is configured per channel: the sentence, voice and card are fixed platform assets, the default comes from the script and the visuals, and the one per-video control is the On/Off. No channel name appears in code, prompts or fixtures; tests use at least two differently configured channels, including one whose voice setting differs from the clip's fixed voice. This task does not build P4's reviewer allowance, P11's comment automation or Task 1's thumbnail work.

**Writer's pre-read (26 Oct, partial: the files below were read, `studio/src` and `app/` were not searched in full; R0 confirms and extends all of it)**
- `studio/src/run-pipeline/state-machine.ts` (about line 1971): `deriveContainsSyntheticMedia` returns true only when the latest video-generation plan's `visualSource` is `'ai-stills'`. Nothing in it looks at the narration voice, which is OpenAI TTS (`media/voice-catalog.config.ts` calls it "AI-generated audio"). This is the AI-use gap R1 must report first.
- `studio/src/agents/video-generation/audio-mix.ts` and `long-render.ts`: the narration plus the end tail and the sidechain-ducked bed are mixed into one audio file before the picture is built, from a single `voicePath`, then `loudnorm` to the `QUALITY_SPEC` target (-14 LUFS) as the last stage. Scene boundaries and captions are timed from the narration, so a clip inserted after the hook shifts everything after it unless the timing inputs shift too.
- `studio/src/media/voice-catalog.config.ts`: `ash` is a channel-selectable catalog voice with no direction line; the catalog is what a profile, a run and the app store. The disclaimer must not resolve its voice through that path (R0 confirms how).
- `studio/src/run-pipeline/resolved-options.ts`: a run resolves its voice, visual source and music from run picks, profile, channel and defaults; this is the existing place a per-run value is stored without a migration.
- No in-video disclaimer or `Imagined` tag code was found in the files read. The NIYT channel config (an example, not a rule) puts its own exact spoken first sentence inside the script and its own description template; with the shared clip those are a second disclaimer that Off does not remove (R0 and R5).

## R0. Read the real code first and confirm

**Where**: run creation options, Gate 1 decision path, script generation and review, video renderer, audio timing, fonts and media assets, the description builder, publishing upload flags, app controls, and each existing channel's current disclosure wording (its spoken disclaimer in the story guide, its description template) and their test cases.

**Fix**: report confirmed / wrong / unknown for: whether any in-video disclosure or `Imagined` tag is rendered today; where a per-run On/Off can be saved before paid rendering; whether one pre-made voice clip can be reused with no per-video speech call; how fixed video and audio assets are versioned and inserted; how `containsSyntheticMedia` is calculated; how this behaves when Gate 1 is disabled and for runs already in flight; whether the Ash voice, and a soft delivery for it, is available to this provider through a fixed provider voice id that bypasses the channel voice path; **whether the clip can be mixed before the final loudness stage at a level set relative to the narration, how bed ducking will treat it, and what inserting it does to scene, caption and chapter timings; which existing signals the script-derived default can read (imagined passages, brief allowance, Script Review, resolved visual source); and whether any voice, wording or history assumption is hardcoded outside the shared asset (a channel's voice used for the disclaimer, the sentence or an "imagined" or "reconstruction" phrase in code, prompts, fixtures, descriptions or the app, or a script-level spoken disclaimer that duplicates the clip).** Never treat a doc's intended feature as a code fact.

**Verify**: the report names real files and contracts and a safe compatibility path. Stop and ask the architect for a schema decision if existing profile or run JSON cannot carry the new field safely.

## R1. Separate the in-video choice from platform disclosure

**Where**: run-level choice and publishing metadata.

**Fix**: add one video-level boolean (On/Off) saved before the render spends money, with the fixed asset version it resolved to. Only that boolean is editable per video. `off` removes both the card and clip and the optional `Imagined` tag. Derive the default as decision 1 says (imagined passages, **AI-generated visuals**, or cannot tell: On). Keep deriving YouTube's AI-use declaration from the actual content and current provider policy, never from this toggle. **If R0 shows that derivation is incomplete for realistic synthetic content (the pre-read shows it ignores the AI narration voice), report it first with the evidence; fix it in this task only if the fix is small and obvious, otherwise raise it to the architect as its own task.** This is compliance work and must not be changed quietly.

**Verify**: the default is derived from the script and the visuals (a script with imagined material defaults On; an AI-stills video defaults On; a purely factual stock-footage video defaults Off; an unclassifiable one defaults On); two videos on one channel can differ; every On video uses identical assets; Off does not force `containsSyntheticMedia` false; the choice and asset version survive reload and restart and show in the approval record.

## R2. Insert the fixed card and the fixed voice after the hook

**Where**: shared disclaimer asset, Short and Long opening sequence, on-screen renderer, spoken audio.

**Fix**:
- **Sentence**: the one code constant from decision 3 is the only place the words live; the card text, the clip's recorded text and the description-free tests all read it. The asset records the sentence's hash, and a test fails if the stored clip was made from different words.
- **Voice**: one fixed Ash recording of the sentence, **pre-rendered once at 1x (natural pace)**, through a fixed provider voice id and fixed delivery that no channel profile, run pick or catalog default can change. It is **quieter than the narration** (set relative to the measured narration level in the same mix graph, so the final loudness stage cannot lift it back; start from about 6 dB under the narration and let the listening check settle the constant) with **a soft fade in and out** (constants, starting at roughly a quarter of a second each). Stored as a versioned asset with a content hash; no per-video speech call and no speed or level change outside the mix graph, if R0 confirms the render path supports reuse. Keep the listening check and the version hash (the version covers the sentence, pace, level and fades, so any change gives a new version).
- **Card**: one fixed unbranded dark translucent card with the sentence in white text, adapted for 9:16 and 16:9, **smaller and softer than a full caption slate and never full-screen** (a modest share of the frame, set in R2 after looking at it), fading in and out with the clip, readable at **360 px** wide (check the white text's contrast over a bright frame at that width), kept out of the caption zone and the platform safe zones. On screen for the whole clip and at least two seconds, never under captions.
- **Mix and timing**: the clip sits correctly against the music bed and narration (no clipping; the bed ducks under it as it does under narration). Insert after the hook without changing the factual script; report the added seconds so the approved length is not shifted unnoticed, and keep scene, caption and chapter timings aligned with the inserted gap.
- `on` inserts both; `off` inserts neither and no tag. The older frame-zero tag instruction is superseded.

**Verify**: inspect the first ten seconds of a Short and a Long, On and Off, on at least two channels, one of them with a narration voice different from the clip's. The first substantive line and image are the hook. Every On video has the same sentence, the same asset version and hash. Listen to the clip and report plainly whether each word is intelligible at this pace and level, and whether it sounds soft (decision 3 if not). Measure and report the clip's level against the narration. Captions, duration and audio stay aligned. Report the added seconds and whether reuse removed the per-video speech cost and the observed render-time effect.

## R3. Show the fixed treatment; keep other disclosure surfaces separate

**Where**: run choice UI, Gate 1 and preview, description generation.

**Fix**: one On/Off control and a preview of the sentence, card and clip before paid rendering; the founder changes only the toggle. No wording, voice, level or look fields on a profile or run form. Keep existing description and pinned-comment behaviour (decision 2); do not claim pinned-comment automation exists. State in the app that the YouTube AI-use label is separate and may still appear with Off.

**Verify**: two differently configured channels show the same canonical treatment; no wording editor or separate audio and visual choices appear; changing one run does not change another; preview and final output use the same asset version.

## R4. Preserve truthful content and review boundaries

**Where**: Script Review and approval checks.

**Fix**: Off must not turn invented facts into documented ones. Keep the existing factual and imagined-allowance checks. Show the founder what the selected choice really renders; do not silently override it and do not add an `Imagined` cue to an Off video. Do not add P4's allowance rules here.

**Verify**: an imagined dramatisation with Off has no in-video cue from this task while its AI-use declaration stays accurate; a factual video can use Off without an artificial disclaimer; the same unsupported factual claim fails whatever the toggle.

## R5. Same-cause sweep (Hard rule 9)

Name the cause (disclosure wording, voice or the `Imagined` tag defined in more than one place; a channel's own voice, sentence or history phrasing standing in for a platform asset; any channel name or single-channel assumption in code, prompts or fixtures). Search `studio/`, `app/` and the channel docs for every copy: the NIYT config's spoken disclaimer and description line, any in-video tag code, the description builder, any place the narration voice could reach the clip, test fixtures. List each hit as fixed here, left alone with a reason, or needing a new task; give the canonical sentence, the clip's voice and the card one owner each in code, outside any channel. Do not edit docs other than your report; list the doc hits for the architect (the NIYT config, the Sprint 6 plan and any story guide that requires its own spoken disclaimer need updating from this task).

## Spend

One clip generation and the test renders only (the clip is generated once, after the founder supplies the sentence; a regenerated sample for the listening check counts against the same ceiling). Live-check ceiling for the whole task: **$0.50**; stop and report at the ceiling. Offline tests carry the rest.

## Schema Impact

Unknown until R0. Prefer existing per-run options if their storage and compatibility fit; save a version reference to the fixed asset for replay. Any table, column or migration needs the architect's decision and a Sprint 6 schema note. No schema change is assumed.

## Business Logic / State Transition

The On/Off choice and the exact asset version are resolved before paid video generation and saved with the run; changing the choice later follows the existing regenerate and approval rules that R0 confirms. The AI-use status stays content-derived and independent. Record any new state in the Sprint 6 business-logic doc.

## Implementation

After R0, name the confirmed files and make the smallest compatible change: shared asset (sentence constant, clip, card spec, one version), run choice, render and mix, preview, publisher. Version the one voice and visual master so old runs render consistently. No per-channel or per-run copy, voice or look editors, no new form step, no comment posting.

## Testing

Backend and app type check, lint, focused tests found in R0. Cover: On and Off on a Short and a Long; two differently configured channels (one with a different narration voice) getting the same assets; the sentence constant matching the stored clip's hash; hook order; clip level against narration and the final loudness stage; fade and ducking; readability of the card at 360 px; the per-video choice and the script-and-visuals default; asset versioning; Gate 1 disabled; restart; existing and in-flight runs unchanged; the AI-use declaration independent of the toggle. Render and inspect first-ten-second clips and report exactly what was observed.

## Report

`docs/execution/sprint6/reports/task2.md`: branch, worktree and PR at the top; R0 table (including the hardcoded-assumption findings); the run data contract; screenshots or opening clips; the exact rendered copy; the clip's measured level and listening-check result; the AI-use output; focused tests; compatibility behaviour; the sweep section; Hard rules 5 to 9 lines; code-complete, merged and deployed as three separate statements; unresolved founder decisions. Give the architect a one-line status for `PLAN.md`.

## Links & References

`sprint6/PLAN.md` (P5; P1's hook dependency; the earlier frame-zero tag decision, now superseded; the 26 Oct disclaimer section) · `docs/channel_bibles/NIYT_CHANNEL_CONFIG.md` (one example of existing disclosure wording: section 2, section 7 description template, G5, section 14 hook-order decision; a test channel, not a rule) · [YouTube disclosure requirements](https://support.google.com/youtube/answer/14328491?hl=en) (verify current policy before shipping) · `sprint6/tasks/task1.md` · `docs/execution/templates/TASK_TEMPLATE.md`.

## Revision log
- r5, 2026-10-24: toggle default (recommend On for new runs, old and in-flight unchanged); clip pre-rendered once, pitch-preserved, with a listening check; AI-use gap is report-first; card duration and caption rules; spend ceiling $0.50; sweep; header lines (branch, worktree, priority, ordering with Task 1).
- r4, 2026-10-24: founder simplified the per-video control to On/Off.
- r6, 2026-10-25: toggle default derived from the script (no per-channel default); no channel names in code, prompts or fixtures; NIYT references reworded as examples of existing wording; sweep also searches for channel-specific assumptions.
- r7, 2026-10-26: founder direction: the sentence, voice and card are shared platform assets owned by no channel and must be soft. One neutral sentence in one code constant with one owner (the founder supplies the text; open decision 3); the clip pre-rendered once at 1x instead of 2x, quieter than the narration with a soft fade, listening check and version hash kept; the card stays unbranded, dark and translucent, now smaller, softer, never full-screen, readable at 360 px; the script-derived default also counts AI-generated visuals (so every Long defaults On); R0 also reports any voice, wording or history assumption hardcoded outside the shared asset; header, decision 3, R1, R2, R5, spend, testing and report updated; writer's pre-read of the real code added (AI-use flag ignores the AI narration voice; audio is mixed and loudness-normalised before the picture, so clip level and timing need care).
