# Sprint 6 Task 1 Spike: can we make thumbnails and titles that really make a stranger curious? (P1, quality test before any build)

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** It defines the Git Workflow, the Hard rules (5 to 9) and the report shape. This file states only this spike's specifics. Keep every reply to the founder to 3 lines; only the report is long. Do not edit `STATUS.md`, `PLAN.md` or any doc except your own report.

**Revision**: r1, 2026-10-25, first issue.

**Written**: 2026-10-25 by the architect chat, at the founder's request. **Status**: not started. **Priority**: P2, and it **gates Sprint 6 Task 1** (Task 1 is on hold until this reports). **Branch**: `SPRINT6_TASK1_SPIKE`; worktree `spike1` under `D:\Study Material\7AI-SPRINT6`. Give branch, worktree and PR in your first reply and at the top of the report (Hard rule 7).

**Why this exists**: Task 1 will build a packaging engine (curiosity brief, packages, thumbnails, critic). Nothing guarantees a catchy thumbnail, and the founder's references look like the work of top image models with a lot of prompt craft. Before we engineer anything, find out whether **our current image generator and prompting can reach that richness on our own content**. If it cannot, no engine will fix it; we change the model or the prompting first.

**Objective**: on three real scripts from three different channels, write candidate packages (title and thumbnail concept), render the best as 16:9 thumbnails with code-drawn lettering, test them with a cold-reader critic, and give the founder a blind rating sheet. Report what the generator does well and badly and recommend: go, change the prompting, or change the model.
**Duration**: 0.5 to 1 day.
**Depends On**: nothing. No product code is changed or merged.
**Owning Component**: a throwaway script under `studio/scripts/spikes/packaging/`, the report and its assets. **Nothing in `studio/src` or `app/` changes.**
**Success Criteria**: (1) a blind contact sheet of about 12 cards the founder can rate in 10 minutes; (2) a table of what worked and failed (richness, faces and hands, clutter, text, fit to each channel's look); (3) the real price per image; (4) a clear recommendation and the inputs Task 1 needs (prompt skeleton, font set, critic prompts).

## Rules that never bend

- **No channel name in any prompt or script logic.** Each channel's look comes only from its existing profile text (`visual.stylePrompt` and `visual.negativePrompt`); the thumbnail follows the channel's negative prompt. A channel with no profile gets a neutral look.
- **Do not use the founder's reference images** as input to the generator (no image-to-image, no style transfer) and do not name their channels or copy their lettering, logos, people or exact compositions. They show a grammar, not assets (see `sprint6/tasks/task1.md`, "The curiosity grammar" and Appendix A).
- **Honest curiosity**: every question and every scene must be supported by the script. No fake badges ("4K", "Full Movie", "Official"), no real living people, no logos.
- Dev database and dev keys only. Never connect to `sevenai_preview`.
- Every LLM call goes through the LLM Registry (`callLLM`), so cost is recorded.

## S0. Read first (table in the report, at most 12 lines)

Confirm, from the real code and config: which image generator and model the pipeline uses for stills and the price per image; whether a registry model can read images (needed for S5); how a channel's `visual.stylePrompt` and `visual.negativePrompt` reach `generateStills` (copy that same assembly for the spike, do not reinvent it); where approved scripts and the three channels' profiles can be read on dev. If something is missing, say so; do not invent it.

## S1. Pick three scripts from three different channels

Use approved or best-available scripts from the dev database or fixtures, one each from **three different channels** with visibly different looks (for example the Mary Celeste script, the Lego script from the Task 6 appendix, and a Short or Long from another channel). State each source. If a script is not available, ask the founder for one before using a bare brief.

## S2. Six candidate packages per script (text only)

One LLM call per script. Each package: the question a stranger will have, the primary device (stake, scale, mystery, correction, how, person, countdown), a title (use the channel's `titleGuidance`; neutral limit about 70 characters if none), and a thumbnail concept: subject, gaze or gesture, scale, the threat or mystery, light, lettering words (at most four) with an optional small subline of at most five, and where in the script the question is answered. Use the grammar in `sprint6/tasks/task1.md`. Six different devices where the script supports them; say so where it does not.

## S3. Cold-reader prune, then render

A cheap text-only call (sees only title and lettering) ranks the six and keeps three per script. Render those three per script as 16:9 images with the channel's own look (nine images). For the single best concept per script, add one more render with a richer, unconstrained cinematic prompt to find the **model's ceiling** (three more images): this separates "the model cannot" from "our channel look or prompt limits it". Ceiling for all image spend: see Spend.

## S4. Lettering in code

Draw the lettering on each image in code (never ask the image model for the words). Try three open-licence font families that ship with the spike (a serif, a heavy condensed sans, a display face; confirm each licence in the report; do not copy a reference's lettering). Use safe margins and a subtle shadow or plate. Produce each card at three sizes: full, feed size (about 360 px wide) and sidebar size (about 170 px wide) and report readability at the small size. Never bake a duration chip or any badge into the image.

## S5. Critic on the real image

If S0 shows a registry model can read images: one call per card that sees only the thumbnail and title and answers what it is about, what it expects to see, what it wants to know, whether it would click and why not, and what would disappoint it. Record it beside each card. If no model can read images, say so and skip.

## S6. Blind rating sheet for the founder

Build one HTML or PNG contact sheet of the twelve cards in **shuffled order labelled A to L**, shown as YouTube-feed-style cards (thumbnail, title, a placeholder channel name, no duration), with no concept, device or critic text visible. Add a plain CSV the founder can fill: for each card, "would I click" 1 to 5 and "as rich as my references" 1 to 5. A separate key file (not on the sheet) maps each letter to script, concept, device, look (channel or ceiling) and font.

## S7. Report and recommendation

`docs/execution/sprint6/reports/task1-spike.md`: the S0 table; the three scripts and channels; the contact sheet and key file; the real price per image and total spend; what worked and failed (richness, faces and hands, clutter, text, consistency with each channel's look, the ceiling renders versus the channel-look renders); what the critic said versus what the founder rates (fill in after the founder rates); prompt patterns that helped; a recommendation: **go** (build Task 1 as designed), **change the prompting** (say how), or **change the model** (say which, with price and evidence); and the inputs Task 1 needs (prompt skeleton, font set, critic prompts). Do not guess the founder's ratings.

## Spend

Ceiling for the whole spike: **$3.00** (about twelve images plus a few cheap text calls); stop and report at the ceiling. If the price per image from S0 makes twelve images exceed it, reduce to the best two concepts per script and say so.

## Schema Impact

None. No product code, no migration.

## Testing

The spike script runs twice from a clean checkout with a stub for the image call (no spend) and once live. Report the commands. No product tests change.

## Definition of Done

Draft PR opened with the first push containing the task doc copy (Hard rule 5), your report, the script under `studio/scripts/spikes/packaging/`, and the images and sheet under `docs/execution/sprint6/reports/task1-spike-assets/` (at most 15 MB in total). CI green, `main` pulled, docs scope clean (task doc identical to the source, your report and assets only), `gh pr ready`. After the founder says merged: close per Hard rule 8 (remove your throwaway database, if any, and temp files; reply "Closed: worktree removed, branch deleted, leftovers: <list or none>.").

## Links & References

`sprint6/tasks/task1.md` (the curiosity grammar and Appendix A; on hold, being rewritten as r7) · `sprint5/bugs/tasks/llm-registry.md` · `docs/execution/templates/TASK_TEMPLATE.md`.

## Revision log
- r1, 2026-10-25: first issue.
