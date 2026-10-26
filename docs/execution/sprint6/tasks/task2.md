# Sprint 6 Task 2: Per-Video Disclosure Controls (P5)

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** It defines the Git Workflow, the Hard rules (5 to 9: task doc sync, pull `main` before ready, who owns which doc, close after merge, same-cause sweep), the `STATUS.md` rule and the report shape. This file states only this task's specifics. Keep every reply to the founder to 3 lines; only the report is long. Do not edit `STATUS.md`, `PLAN.md` or any doc except your own report and the docs named in the Report section.

**Revision**: r6, 2026-10-25. No new settings: the On/Off default is derived from the script; no channel name in code, prompts or fixtures. r5 added the clip method, the report-first rule for the AI-use gap, the spend ceiling and the sweep.

**Written**: 2026-10-24 by the architect chat, at the founder's request. **Status**: not started. **Priority**: P2. Runs **before** Sprint 6 Task 1 PR C (both change the Short opening); independent of Task 1 PR A and PR B, so start now. **Branch**: `SPRINT6_TASK2_BE` (add `SPRINT6_TASK2_FE` only if R0 shows the app change should be separate); worktree `task2` under `D:\Study Material\7AI-SPRINT6`. Give branch, worktree and PR in your first reply and at the top of the report (Hard rule 7).

**Founder direction (2026-10-24)**: Use the fixed sentence **"This video includes imagined reconstructions."**, one Ash voice clip at 2x speed, and one unbranded dark translucent card with white text, adapted only for 9:16 and 16:9 framing. Each video has one disclaimer choice: `on` plays the voice and shows the card together after the hook; `off` uses neither and hides the optional `Imagined` tag. The sentence, voice and visual are never edited per video. The YouTube AI-use declaration remains independent of this choice.

**Founder decisions still open (recommendations given)**
1. **Toggle default (decided 25 Oct: derived from the script, no setting).** For each new run the system sets the default itself: **On** when the script contains imagined or dramatised material (R0 finds the signal that already exists: the brief's IMAGINED allowance, the script's own imagined passages, or what Script Review detects), **Off** when the script is purely factual, and **On when it cannot tell**. The founder changes it per video with one tap; that tap is the only human choice. There is no per-channel default and no channel setting. Runs created or in flight before this ships render exactly as today (no card, no clip, no tag) and show the control as Off until the founder changes it.
2. **Description and pinned-comment wording.** Recommendation: keep the current description disclosure and pinned-comment wording as they are; the short fixed sentence serves the video only. No comment automation is added by this task (P11 owns that).
3. **Speed.** 2x is the decision. R2 requires a listening check; only if the clip is not clearly intelligible do you report it, with a 1.5x sample, and the founder decides.

**Objective**: let the founder choose, per video on any channel, a fixed reusable disclaimer treatment while keeping the hook first and leaving YouTube's required AI-use declaration accurate.
**Duration**: to estimate after R0.
**Depends On**: existing channel profile, run creation and approval, renderer and audio, publisher contracts. Task 1's thumbnail tool does not depend on this task.
**Owning Component**: per-run creation and approval, shared disclaimer assets, video rendering and audio, publisher, app controls. Confirm exact owners in R0.
**Success Criteria**: the founder can turn the disclaimer On or Off for one Short or Long without changing other videos or channels. Every On video uses the same approved words, voice and visual together after the hook, with no per-video copy field. The YouTube AI-use field stays accurate whatever the toggle says.

## Task Requirement

Sprint 6 P5 (the disclosure need first raised in the NIYT test channel's gap register, G5, but built for every channel), with the founder's 24 Oct fixed-disclaimer direction controlling the in-video treatment for every channel. Do not add editable in-video wording to profiles or runs. **No new settings and no channel names.** Nothing here is configured per channel: the sentence, voice and card are fixed, the default comes from the script, and the one per-video control is the On/Off. No channel name appears in code, prompts or fixtures; tests use at least two differently configured channels. This task does not build P4's reviewer allowance, P11's comment automation or Task 1's thumbnail work.

## R0. Read the real code first and confirm

**Where**: run creation options, Gate 1 decision path, script generation and review, video renderer, audio timing, fonts and media assets, the description builder, publishing upload flags, app controls, and each existing channel's current disclosure wording (its spoken disclaimer in the story guide, its description template) and their test cases.

**Fix**: report confirmed / wrong / unknown for: whether any in-video disclosure or `Imagined` tag is rendered today; where a per-run On/Off can be saved before paid rendering; whether one pre-made voice clip can be reused with no per-video speech call; how fixed video and audio assets are versioned and inserted; how `containsSyntheticMedia` is calculated; how this behaves when Gate 1 is disabled and for runs already in flight; whether the Ash voice is available to this provider. Never treat a doc's intended feature as a code fact.

**Verify**: the report names real files and contracts and a safe compatibility path. Stop and ask the architect for a schema decision if existing profile or run JSON cannot carry the new field safely.

## R1. Separate the in-video choice from platform disclosure

**Where**: run-level choice and publishing metadata.

**Fix**: add one video-level boolean (On/Off) saved before the render spends money, with the fixed asset version it resolved to. Only that boolean is editable per video. `off` removes both the card and clip and the optional `Imagined` tag. Keep deriving YouTube's AI-use declaration from the actual content and current provider policy, never from this toggle. **If R0 shows that derivation is incomplete for realistic synthetic content, report it first with the evidence; fix it in this task only if the fix is small and obvious, otherwise raise it to the architect as its own task.** This is compliance work and must not be changed quietly.

**Verify**: the default is derived from the script (a script with imagined material defaults On, a purely factual one defaults Off, an unclassifiable one defaults On); two videos on one channel can differ; every On video uses identical assets; Off does not force `containsSyntheticMedia` false; the choice and asset version survive reload and restart and show in the approval record.

## R2. Insert the fixed card and the fixed voice after the hook

**Where**: shared disclaimer asset, Short and Long opening sequence, on-screen renderer, spoken audio.

**Fix**: make one fixed unbranded dark translucent card with the sentence in white text, adapted for 9:16 and 16:9. Make one fixed Ash recording of the sentence, **pre-rendered once at 2x with pitch preserved** (time-stretch, not a plain speed-up, so it does not sound like a chipmunk), stored as a versioned asset with a content hash; no per-video speech call and no speed change at render time, if R0 confirms the render path supports reuse. The card is on screen for the whole clip and at least two seconds, never under captions, and the clip sits correctly against the music bed and narration (no clipping, ducking as the existing mix does). `on` inserts both; `off` inserts neither and no tag. Insert after the hook without changing the factual script; report the added seconds so the approved length is not shifted unnoticed. The older frame-zero tag instruction is superseded.

**Verify**: inspect the first ten seconds of a Short and a Long, On and Off, on at least two channels. The first substantive line and image are the hook. Every On video has the same sentence, the same asset version and hash. Listen to the clip and report plainly whether each word is intelligible (decision 3 if not). Captions, duration and audio stay aligned. Report whether reuse removed the per-video speech cost and the observed render-time effect.

## R3. Show the fixed treatment; keep other disclosure surfaces separate

**Where**: run choice UI, Gate 1 and preview, description generation.

**Fix**: one On/Off control and a preview of the sentence, card and clip before paid rendering; the founder changes only the toggle. No wording fields on a profile or run form. Keep existing description and pinned-comment behaviour (decision 2); do not claim pinned-comment automation exists. State in the app that the YouTube AI-use label is separate and may still appear with Off.

**Verify**: two differently configured channels show the same canonical treatment; no wording editor or separate audio and visual choices appear; changing one run does not change another; preview and final output use the same asset version.

## R4. Preserve truthful content and review boundaries

**Where**: Script Review and approval checks.

**Fix**: Off must not turn invented facts into documented ones. Keep the existing factual and imagined-allowance checks. Show the founder what the selected choice really renders; do not silently override it and do not add an `Imagined` cue to an Off video. Do not add P4's allowance rules here.

**Verify**: an imagined dramatisation with Off has no in-video cue while its AI-use declaration stays accurate; a factual video can use Off without an artificial disclaimer; the same unsupported factual claim fails whatever the toggle.

## R5. Same-cause sweep (Hard rule 9)

Name the cause (disclosure wording, the `Imagined` tag or the disclaimer defined in more than one place, and any channel name or single-channel assumption in code, prompts or fixtures). Search `studio/`, `app/` and the channel docs for every copy: the NIYT config's spoken disclaimer, any in-video tag code, the description builder, test fixtures. List each hit as fixed here, left alone with a reason, or needing a new task; give the canonical sentence one owner in code. Do not edit docs other than your report; list the doc hits for the architect (the NIYT config and the Sprint 6 plan need updating from this task).

## Spend

One clip generation and the test renders only. Live-check ceiling for the whole task: **$0.50**; stop and report at the ceiling. Offline tests carry the rest.

## Schema Impact

Unknown until R0. Prefer existing per-run options if their storage and compatibility fit; save a version reference to the fixed asset for replay. Any table, column or migration needs the architect's decision and a Sprint 6 schema note. No schema change is assumed.

## Business Logic / State Transition

The On/Off choice and the exact asset version are resolved before paid video generation and saved with the run; changing the choice later follows the existing regenerate and approval rules that R0 confirms. The AI-use status stays content-derived and independent. Record any new state in the Sprint 6 business-logic doc.

## Implementation

After R0, name the confirmed files and make the smallest compatible change: shared asset, run choice, render, preview, publisher. Version the one voice and visual master so old runs render consistently. No per-channel or per-run copy editors, no new form step, no comment posting.

## Testing

Backend and app type check, lint, focused tests found in R0. Cover: On and Off on a Short and a Long; two differently configured channels with the same assets; hook order; readability and audio timing at double speed; the per-video choice; asset versioning; Gate 1 disabled; restart; existing and in-flight runs unchanged; the AI-use declaration independent of the toggle. Render and inspect first-ten-second clips and report exactly what was observed.

## Report

`docs/execution/sprint6/reports/task2.md`: branch, worktree and PR at the top; R0 table; the run data contract; screenshots or opening clips; the exact rendered copy; the AI-use output; focused tests; compatibility behaviour; the sweep section; Hard rules 5 to 9 lines; code-complete, merged and deployed as three separate statements; unresolved founder decisions. Give the architect a one-line status for `PLAN.md`.

## Links & References

`sprint6/PLAN.md` (P5; P1's hook dependency; the earlier frame-zero tag decision, now superseded) · `docs/channel_bibles/NIYT_CHANNEL_CONFIG.md` (one example of existing disclosure wording: section 2, section 7 description template, G5, section 14 hook-order decision; a test channel, not a rule) · [YouTube disclosure requirements](https://support.google.com/youtube/answer/14328491?hl=en) (verify current policy before shipping) · `sprint6/tasks/task1.md` · `docs/execution/templates/TASK_TEMPLATE.md`.

## Revision log
- r5, 2026-10-24: toggle default (recommend On for new runs, old and in-flight unchanged); clip pre-rendered once, pitch-preserved, with a listening check; AI-use gap is report-first; card duration and caption rules; spend ceiling $0.50; sweep; header lines (branch, worktree, priority, ordering with Task 1).
- r4, 2026-10-24: founder simplified the per-video control to On/Off.
- r6, 2026-10-25: toggle default derived from the script (no per-channel default); no channel names in code, prompts or fixtures; NIYT references reworded as examples of existing wording; sweep also searches for channel-specific assumptions.
