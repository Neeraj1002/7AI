# Sprint 6 Task 5 Spike: can a recurring AI host speak to camera like a real-shot vlog, at a cost a Short can carry? (P28, quality and cost test before any build)

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** It defines the Git Workflow, the Hard rules (5 to 9) and the report shape. This file states only this spike's specifics. Keep every reply to the founder to 3 lines; only the report is long. Do not edit `STATUS.md`, `PLAN.md` or any doc except your own report.

**Revision**: r1, 2026-11-02, first issue.

**Written**: 2026-11-02 by the architect chat, at the founder's request. **Status**: not started. **Priority**: P2 (P28 in `PLAN.md`). **Branch**: `SPRINT6_TASK5_SPIKE`; worktree `spike5` under `D:\Study Material\7AI-SPRINT6`. Give branch, worktree and PR in your first reply and at the top of the report (Hard rule 7).

## Founder decisions (all answered 2 Nov; kept here as the record)

1. **Moving video is reopened for this spike only.** It was on STATUS's "Deferred on purpose" list. Nothing is built, wired or merged into the pipeline; a build task follows only on a GO.
2. **Per-Short cost cap for this format: $2.00, hard, for the pilot.** The final cap is reset from what this spike measures.
3. **Spike ceiling: $15** (about $11 if the self-hosted candidate is dropped). Stop and report at the ceiling.
4. **Route A, audio-driven, plus the hybrid cut** is the default: our own OpenAI voice makes the audio; an audio-driven model animates one still image of the host to match it; the face speaks in short bursts and era stills cover the action. **Route B** (a video model that makes face, voice and scene from a prompt) is a comparison only.
5. **Candidates for route A:** Wan 2.2 speech-to-video, Kling AI Avatar v2 Pro, HunyuanVideo-Avatar (self-hosted or on a rented GPU). VEED Fabric 1.0 is a price baseline only. The names and prices come from vendor and aggregator pages the architect read on 2 Nov and are **not verified**; S0 re-checks every one.

## Why this exists

The founder wants to test a new channel format: one recurring AI host who travels to a past era, works one job for a day, and films herself selfie-style, speaking straight to the viewer, built around the most intense moments (danger, crowds, heat, noise, close calls). Reference Shorts of this kind show the face on screen, talking, like a real-shot vlog, and the founder sees good views on them. Those views are other people's evidence; only our own pilot's retention counts.

Today the pipeline makes AI stills with a voiceover. No video-generation model exists anywhere in the code, and the script reviewer is told lip sync and motion footage "are not supplied" (`studio/src/agents/script-review/index.ts`, around line 146; confirm in S0). A recurring face (reference character upload) was also deferred. So the signature of the format is exactly what is missing. Before any engineering, find out whether an audio-driven talking portrait plus era cutaways feels like the founder's references, and what it really costs per Short.

## Objective

On three short first-person scripts from three different eras and jobs, produce talking-host clips with three route-A candidates, a small route-B comparison, and one full hybrid proof Short; measure price, speed, face consistency, lip-sync and look; give the founder a blind rating sheet; and recommend **go**, **go with a different route**, or **no-go**, with the real cost per Short.

**Duration**: 1 to 2 days.
**Depends On**: nothing. No product code is changed or merged. (It reads the image, voice, caption and render code; it does not edit it.)
**Owning Component**: a throwaway script under `studio/scripts/spikes/host/`, the report, a key file and the assets. **Nothing in `studio/src` or `app/` changes.**
**Success Criteria**: (1) a blind sheet of the clips the founder can rate in about 10 minutes; (2) a table per candidate of real price per second, speed, resolution and length limits, face consistency across clips, lip-sync, artifacts, and how the background and camera behave; (3) the real cost of a 35-second hybrid Short against the $2.00 cap; (4) the pipeline-fit list (where a talking-host stage would plug in, with files); (5) a clear recommendation and the inputs a build task needs.

## Rules that never bend

- **No channel name in any prompt or script logic.** The host and the format are test inputs, not code.
- **The host is a fictional adult character.** Do not use or imitate a real person's face or voice. No real living people, no logos, no brand names in prompts.
- **Do not use the founder's reference Shorts as input** to any model (no image-to-image, no video-to-video, no style transfer) and do not copy their lettering, people, jokes or exact compositions. They show a grammar, not assets.
- **Honest content.** Every era fact in a script comes from a source you cite in a short facts note for that script (one paragraph, links). A first-person day is an imagined reconstruction; the spike labels its outputs "synthetic" in file names and on the sheet.
- **Vendor terms.** For each candidate, read and report the licence or terms for commercial use (the architect found no licence terms on the HunyuanVideo-Avatar page) and any territory limits. Do not use a candidate whose terms forbid commercial use without telling the founder.
- **Keys and accounts.** The founder creates every vendor account and key; you ask for each one when you need it and say exactly which screen to use. Never commit a key, never paste one in chat or a report, never sign up for a plan or give a card number yourself. Ask the founder to set a spend limit on each vendor account if the vendor offers one.
- Dev database and dev keys only. Never connect to `sevenai_preview`. Every LLM call goes through the LLM Registry (`callLLM`). Media calls in the spike script record their own cost per call in the report (the media registry has no video purpose yet; do not add one in `studio/src`).
- **No channel-specific literal in code** (Key Principle 11, STATUS rule 4). The report states "channel-specific literals added: none" and shows the search that proves it.
- **Prompt layers** (Key Principle 12). If the spike writes prompt text for the script call, the report names the layer each part belongs to. Use the neutral platform prompts as they are; do not edit prompt files.
- **ffmpeg.** On the server's ffmpeg 8.0.1, putting video and audio filters in one graph dropped chunks of audio (#158). In the proof assembly use two separate filter graphs, log the ffmpeg version, and run an audio-hole check (no gap over 0.5 s) on the proof.

## S0. Read first (table in the report, at most 16 lines)

Confirm, from the real code and config, and re-verify every vendor fact from the vendor's own page: (1) which image generator and model make stills, and the price per image (`studio/src/ai-visuals/registry.ts`); (2) how narration audio is made today: the media registry (`studio/src/media/registry.ts`), the voice catalog and which catalog voice to use for the host; (3) how Whisper word timings are produced and used for captions; (4) how a Short is rendered and where a talking-host stage could plug in; (5) where cost is metered and where the per-run and per-channel cost limit lives (channel or run); (6) the ffmpeg versions here and on the server; (7) whether any GPU is available to you for the self-hosted candidate, and the hourly price of a rented one; (8) for each candidate: current price per second at each resolution, input needs, maximum clip length, frame rate, licence. If something is missing, say so; do not invent it. If the self-hosted candidate cannot be run within the ceiling, drop it, say so, and use the $11 ceiling.

## S1. Three scripts

Ask the founder for three eras and jobs (one line each). If the founder has not answered by the time you start, propose three different ones, say so, and use them. For each, write one ~35-second first-person script (about 90 words) in the intense-moments style from the facts note, through the registry's existing script call or a neutral call; state which. Record the script, the facts note and the sources.

## S2. The host

Make one reference still of the host with the existing image generator (selfie framing, adult woman, no real person), keep the same file for every candidate and every clip, and record the prompt and price. Produce the narration audio for each script with the existing OpenAI voice path and one catalog voice (say which), and its word timings.

## S3. Lane 1: route A, three candidates

For each candidate make three 10-second clips (the first 10 seconds of each script's audio, one per script), nine clips in all, at the cheapest sensible resolution (for example 480p) unless a candidate needs more. For each clip record the billed price, wall time, resolution, frame rate and the longest clip the candidate accepts. Judge, and describe in words: same face across the three clips; lip-sync and drift; teeth, hands, blinking and jitter; does the background move; does the camera feel handheld or fixed; behaviour on loud, intense speech. Cap this lane at about $9 including any GPU time.

## S4. Lane 2: route B comparison

At most two models that make face, voice and scene from a prompt (the aggregator page the architect read listed Veo 3.1, Kling v3.0 Pro, Seedance 2 and Sora 2 Pro as similar models; none was priced; choose at most two after S0 and say why). One or two clips each of about 8 to 10 seconds, with the same host still if the model accepts one. Record price, clip length limits, whether the voice stays the same across two clips, whether a reference image is accepted, and how the scene looks against route A. Cap this lane at **$3**.

## S5. Hybrid proof Short

With the best route-A candidate, assemble one full ~35-second Short: the face speaks in bursts (hook, middle, outro), the era stills (existing image generator) cover the action moments, our narration audio runs the whole length, captions from the Whisper timings. Throwaway ffmpeg in the spike script; apply the ffmpeg rule above. Record the total cost and the share of seconds that are face. Cap this at **$3**.

## S6. Blind rating sheet for the founder

One HTML or PNG contact sheet of the lane 1 and lane 2 clips in **shuffled order labelled A, B, C...**, with no vendor, route or price visible, plus the proof Short last and labelled. Add a plain CSV: for each clip, "feels like a real vlog" 1 to 5, "same woman as the others" 1 to 5, "I would keep watching" 1 to 5. A separate key file (not on the sheet) maps each letter to candidate, route, script and price. If the assets are over 15 MB, keep the clips outside git, tell the founder the folder, and put only the report, script and key in the PR.

## S7. Rules and policy read (no code)

Read YouTube's current help page on altered or synthetic content and the current "inauthentic" or mass-produced content policy, and report in plain words what a channel with a realistic recurring AI host in a past era must set or say (the setting, title and description lines, anything about a recurring AI character). Report what you read and the date. Do not guess the wording.

## S8. Pipeline fit (read-only list)

Where a talking-host stage would plug in, with files: the media registry (a new purpose beside `tts`), the Short renderer, Gate 2 preview, cost metering and the limit, the reference-character setting, the script reviewer's `videoGenFit` text, the writers' and reviewer's treatment of first-person imagined content (what will fail review today, for Fact Rules and Imagined Allowance), and the first-person format question for a preset. List the changes a build task would need and size them small, medium or large. Do not change anything.

## S9. Report and recommendation

`docs/execution/sprint6/reports/task5-host-spike.md`: the S0 table; the three scripts, sources and the host still; the key file and the sheet; per-candidate results; real price per second billed; the cost of the 35-second hybrid Short against the $2.00 cap and the cap this format would actually need; what worked and failed (face consistency, lip-sync, background and camera, the look against the references in words only); what the founder rated (fill in after the founder rates; do not guess); the S7 and S8 results; a recommendation: **go** (route and candidate, with the cost per Short and the hybrid share), **go with route B**, or **no-go**; and the inputs a build task needs.

## Spend

Ceiling for the whole spike: **$15** (about $11 without the self-hosted candidate): lane 1 about $9, lane 2 up to $3, proof Short up to $3. State your exact estimate from the S0 prices in your first reply; the founder confirms before you spend. Stop and report at the ceiling. Lane 2 has no price estimate (none found), so its $3 is a hard cap, not an expectation.

## Schema Impact

None. No product code, no migration. A migration, a new dependency in `studio/` or `app/`, or any change to an existing flow stops the task: ask the architect.

## Testing

The spike script runs twice from a clean checkout with stubs for the paid calls (no spend) and once live. Report the commands. No product tests change.

## Not in this task

Building the stage, a media-registry purpose, app screens, a first-person preset, Fact Rules (P22) or Imagined Allowance (P4), music or sound design, the Clocked In concept, any change to the current prompts.

## Definition of Done

Draft PR opened with the first push containing the task doc copy (Hard rule 5), your report, the script under `studio/scripts/spikes/host/` and the key file (assets only if small, see S6). CI green, `main` pulled, docs scope clean (task doc identical to the source, your report and assets only), `gh pr ready`. After the founder says merged: close per Hard rule 8 (remove temp files, any rented GPU and any throwaway database; reply "Closed: worktree removed, branch deleted, leftovers: <list or none>."). Confirm in the report that every rented machine and every vendor key you created or used is switched off or removed.

## Not verified by the architect

Everything about the vendors: prices, limits, quality, licences and whether the models do what their pages say (read from vendor and aggregator pages on 2 Nov). The reference Shorts: the architect could not open them; the founder says the face is on screen, talking, like a real-shot vlog. Every code path named here (read from `registry.ts` files and one grep on `main` on 2 Nov; nothing was run).

## Links & References

`docs/execution/templates/TASK_TEMPLATE.md` · `sprint6/PLAN.md` (P28, P22, P4) · `sprint6/tasks/task1-spike.md` (the spike pattern) · `studio/src/media/registry.ts` · `studio/src/ai-visuals/registry.ts` · `studio/src/llm/registry.ts` · `execution/sprint5/bugs/reports/shorts-audio-holes.md` (the ffmpeg rule) · `decisions/PROMPT_LAYERS.md`.

## Revision log
- r1, 2026-11-02: first issue (architect). Decisions of 2 Nov recorded: spike only, $2.00 pilot cap, $15 ceiling, route A plus hybrid, route B as comparison.
