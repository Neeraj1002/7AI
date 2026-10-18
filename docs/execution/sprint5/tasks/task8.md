# Sprint 5 Task 8: Sprint 4 and 5 Test Failures and Backend Fixes (Backend)

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting**, then [WORKFLOW](../WORKFLOW.md). Use `task8` under the shared Sprint 5 root (`D:\Study Material\7AI-SPRINT5`), your own worktree off fresh `main`, branch `SPRINT5_TASK8_BE`. One PR per group R1-R3, R4-R6, R7-R9, R10-R12 is allowed (list the PRs in your report). Record the branch in your row of `sprint5/STATUS.md` when you create it, and write only your own row and your own report.

**Keep replies and tool output short: no step-by-step narration, read only the files you need, one-line status messages.**

**Written**: 2026-10-18 by the architect chat, at the founder's request, from the founder's first combined acceptance run. **Status**: not started. **Priority**: P0 for the next acceptance run and for the first public long video.

**Objective**: fix everything the first real 2-minute Video run (Lego brief, channel Underdogs, run `7a90cd6e`, 18 Oct) showed on the backend: a setting that only fails after money is spent, a review failure that rebuilds the whole video, wrong attempt status, a brand logo in the pictures, a video 18% shorter than its target, and cost that is higher than the estimate and hard to read. Nothing here adds a new product feature except the voice list (R10), which is stop-and-confirm.
**Duration**: 3 to 4 days.
**Depends On**: Sprint 5 Tasks 1 to 5 merged (they are). Independent of Task 6 (script review prompt and rules) and Task 7 (app); if you touch the same file as Task 6, rebase. Check `sprint5/STATUS.md`.
**Owning Component**: `studio/src/run-pipeline/`, `studio/src/agents/` (video, voice, image prompt builder, video review), cost ledger and estimate, runs API (`runs.get`, runs list). **Not** in scope: Script Review rules (Task 6), any app screen (Task 7), publishing logic.
**Success Criteria**: (1) an invalid voice, a provider that is out of quota, a missing music track or an expired YouTube connection is caught before the first paid step, with a plain message; (2) a Video Review failure about timing or shot length is repaired without regenerating images that did not change, and attempt 2 of the replay makes zero image calls for unchanged scenes; (3) a provider limit during review pauses the run for retry and never rebuilds the video; (4) attempt status shows the real outcome and reason; (5) no brand logo or lettering reaches the final video in the replay; (6) a 2-minute Video lands within the tolerance of its target; (7) estimate shows a range that includes retries, and cost per attempt and per stage is returned by the API; (8) tests, `tsc`, `eslint` pass.

## What the test showed (evidence)

Run `7a90cd6e`, Underdogs, "Video 2 min", voice Ballad then Coral, music inspirational, AI images, estimate $0.24, max spend $0.50.

| # | What happened | Where it is fixed |
|---|---|---|
| E1 | Gate 1 approved, then the Video step failed at once: OpenAI 400, voice must be one of nova, shimmer, echo, onyx, fable, alloy, ash, sage, coral. Ballad is not accepted by `tts-1-hd`. No image had been made yet. | R1, R2 |
| E2 | Attempt 1 made all 24 images and a video, then Video Review failed it: longest still 8.3 s against the 7.5 s limit. The planner then made a new plan and attempt 2 regenerated the images. The app showed attempt 1 as "done" and sent no notification; the Details list on the Run screen also says "video review, attempt 1, done" (the stage status means "ran", not "passed"). | R3, R5 |
| E3 | Attempt 2 stopped at the $0.50 limit ($0.51 spent). The founder raised the limit to $1.00 and retried. Attempt 3 completed. | R3, R8 |
| E4 | During Video Review of attempt 3 the Anthropic workspace usage limit was hit ("You have reached your specified workspace API usage limits", regained 1 Nov). The run showed "Reviewing the video failed once" and waited for a manual retry after the founder raised the limit. | R4 |
| E5 | Final video 1:38 against a 2:00 target (floor 96 s, so it passed by 2 s). The approved script was about 273 words, which is about 167 words per minute with Coral; planning assumes 155. | R7 |
| E6 | Brand logos and lettering are all over the published video, against the brief ("no logos or lettering"). Watching the final file (frame every 4 s, about 24 stills): about 7 stills show the LEGO logo or brand text (factory sign, a large red LEGO sign on a factory, a wall sign "The LEGO Group", a "LEGOLAND PARK" entrance, a building with the logo in a window, a "LEGO Billund Denmark" sign). About 5 stills carry invented text or figures: a document "Consolidated Financial Results" with a "-27%" line, a calculator reading a made-up number, a slogan "A Brighter Tomorrow Together", a warehouse sign "Build Belong", a poster "SAME QUESTIONS. DIFFERENT YEARS.", a door sign "MANAGEMENT CONFERENCE", machine labels "ENGEL 11/12". Two stills show an overgrown, abandoned roller coaster for the line about selling the four parks (the brief says sold, not abandoned), and a Danish flag at half-mast. Video Review passed all of it (it looks at only 3 frames). | R6 |
| E7 | Total cost $0.5492 against a $0.24 estimate (about 2.3 times). Images are $0.0053 each, so a full set of 24 is about $0.13; the overrun is the extra image sets. Admin cost list showed 4 events at $0: two `video-generation` rows for `tts-1-hd+whisper-1` (they carry `costsBookedSeparately`), one `video-generation` row with provider and model both "unknown", one Haiku `video-intelligence-own-draft` call (probably the call that hit the provider limit). | R8 |
| E8 | The script generator is on `claude-sonnet-5`; the founder wants Sonnet 5.5. | R9 |
| E9 | The founder finds `tts-1-hd` voices sound like every template voice on YouTube and wants a per-channel choice with listening samples. | R10 |
| E10 | The Script tab showed the writer's original draft (about 311 words), not the edited script that was approved and narrated. | R11 (data), Task 7 R3 (screen) |
| E11 | Inbox list stops at about 7 or 8 runs (it showed more earlier). | R12 (check), Task 7 R1 |
| E12 | Known items carried in: stale "running" attempt rows (run `9ab4fbe5`), three failing tests in `quality-spec-row.test.ts`, Compare does not return long-form numbers, `chapterWarning` not declared in the `runs.get` type, YouTube thumbnail 403. | R11 |

## Decisions (defaults apply unless the founder says otherwise)

- **D1, automatic retry spend:** automatic retries may spend up to **2 times the estimate** in total. Beyond that the run pauses and asks the user (Retry with a raised limit). Alternative: no automatic retry after the first spend problem.
- **D2, voice list storage (R10):** a config file, no migration, unless R0 shows it cannot hold previews. Tell me which before building.
- **D3, logo check (R6):** a cheap vision pass over every still, budget about $0.02 per video; if it costs more, sample every second still and say so.

## R0. Read the code first

Table in the report: each item below **confirmed** or **wrong (what is really there)**. The architect cannot read the code from the chat. Open: the voice settings and TTS call, the run creation validation, the planner and scene plan, the Video Review stage and its retry loop, the retry and cap logic, the cost ledger and estimate, `runs.get`, the runs list endpoint.

1. Is the voice sent to OpenAI as a plain name with no check against the model's accepted list (E1)?
2. What exactly triggers attempt 2 after a review failure, and does the planner write a new plan and new image prompts (E2)? Are images keyed by prompt hash anywhere (Task 3 and 5 caches)?
3. How are provider errors (quota, rate limit, auth) classified today? Is a provider error in review treated like a failed review (E4)?
4. What is stored per attempt (status, reason, cost)? Where does "done" come from (E2)?
5. Where does the image prompt get built, and is there any "no text, logos or brand marks" rule (E6)?
6. How is the word count planned from the target length, and is the measured pace of the voice (`measuredWordsPerMinute` is in the cost event) used (E5)?
7. How is the estimate computed, and does it include retries (E7)? Where is the cap checked (after the call, which explains $0.51 on a $0.50 limit)?

## R1. Voice must be valid for its model (E1)

Each voice carries the model it works on, or the list offered is limited to what the configured model accepts. Newer voices (for example Ballad) need the newer speech model; older voices keep working. Validate at run creation (and when settings change) and again before the Video step. A rejected voice never reaches the paid steps. Test: Ballad with the old model is refused with a clear message; Ballad with its own model works; Coral unchanged.

## R2. Check before spend (preflight)

One preflight check at run start and before each paid stage. Table in the report: every setting a stage uses, where it is validated today, and whether it can fail after money is spent. Add checks for at least:
- voice against its speech model (R1);
- provider availability and quota for every provider the run will call (Anthropic and OpenAI): a cheap probe or the last known error state, so an exhausted workspace limit is found before the first paid call, not at review (E4);
- the chosen music mood has a track at least as long as the target video;
- YouTube connection and scopes when publish is on (the 7-day token, subtitle scope);
- the estimate against max spend, and the retry allowance (D1);
- the scene plan against the shot-length limit (R3).

A failed check blocks the stage with a plain message and the setting to change, before any spend. Test each check.

## R3. A review failure must not rebuild the video (E2, E3)

1. **Plan check before images.** The voice and its timing come before the images, so each scene's on-screen length is known from the plan and the narration timing. Run the shot-length check (limit 7.5 s) on the plan itself. If a scene is too long, rebalance scene starts or split it before any image is generated.
2. **Repair the defect only.** For a timing or shot-length failure from Video Review, change the scene timings and re-render from the images already made, with no image calls. For a scene that has to be split, generate only the new scene's image(s) (reuse the Task 5 one-scene mechanism).
3. **Stable plan between attempts.** The re-planner patches only the failing scenes. An image whose prompt did not change is reused (match by prompt hash). Narration, captions and music are reused.
4. **Retry spend** follows D1. The automatic regeneration limit (2) is unchanged.

Test: a replay of E2 (one scene over 7.5 s) where attempt 2 makes zero image calls for unchanged scenes; a case that needs one new image makes exactly one. Report image calls per attempt, before and after.

## R4. Provider errors are not defects (E4)

Classify errors into: provider limit or quota, rate limit, authentication, transient network, and content or quality failure. Only content and quality failures count as a failed review and may trigger regeneration. Provider limit, rate limit and auth errors put the run in a waiting state ("blocked: provider limit, retry this step"), keep everything made so far, do not use up a regeneration, and carry the provider's own message (including the date the limit returns, when given). Retry reruns only the blocked step (for E4, the review of the existing video). Test: a quota error during Video Review leaves the video and images untouched and a retry reviews the same file.

## R5. Honest attempt status (E2)

Per attempt the API returns an outcome: completed (passed review), failed review (with the reason code and text, for example "longest shot 8.3 s, limit 7.5 s"), failed error (with the error class from R4), cancelled, or running. "Done" must not appear for an attempt that failed review. The Admin run view uses the same labels (it currently shows "Gate2 Running, Attempt 1", which is unclear). The same rule applies to stage rows: a review stage whose verdict is fail is "failed review", not "done". The app side is Task 7 R5; keep the field names stable and tell Task 7 in your report.

## R6. No brand logos or lettering in the pictures (E6)

1. Add a rule to the image prompt builder for every style and provider: no text, logos, brand marks, watermarks or lettering in the picture, and no recognisable branded product packaging, unless the brief explicitly asks for it. Cover brief topics that are brands (Lego in this case).
2. Check every still before render with the vision pass (D3). A still with text or a logo is regenerated once with a stronger instruction; a second failure is flagged for Video Review and the Gate 2 screen instead of looping.
3. Video Review must not rely on 3 sampled frames for this. The still-level check is the safeguard; Video Review keeps its own sample.

4. **Invented text, figures and slogans.** The same rule and the same check cover readable text, numbers, charts with figures and slogans made up by the image model (E6: "-27%", "A Brighter Tomorrow Together"). Pictures may show generic blurred or unreadable text, not invented facts.
5. **Pictures must not imply facts the brief does not state.** A scene tied to a sentence about a fact (parks sold) must not show a different fact (parks abandoned, flag at half-mast, empty ruins). Add the rule to the scene prompt writer: show the stated fact or a neutral scene; no decay, closure, disaster or mourning imagery unless the brief says it. The still-level vision pass (D3) also flags such scenes against the narration line it illustrates.

Test with a brand-named brief (the Lego brief is the fixture): in the replay, 0 of the stills show a logo, brand lettering or invented text or figures, and no scene contradicts its narration line; report the count per run before and after, and the extra cost.

## R7. Length lands near the target (E5)

Plan the narration word count from the measured pace of the chosen voice (the pace is already recorded per run as `measuredWordsPerMinute`; use the latest measured value for that voice and fall back to 155). Show the expected length at Gate 1 from the approved text, not only the writer's draft, and warn when it is under the quality floor (80% of target) or more than 10% under target. Do not change the floor or the 10% tolerance. Note: the quality-spec test conflict is in R11. Test: the replay of E5 (about 273 words, Coral) predicts about 98 s.

## R8. Cost: estimate, ledger, API (E3, E7)

1. The estimate shown before a run covers one clean attempt and also states the retry allowance (D1); max spend defaults to the estimate times that allowance, or the run asks before the first automatic retry beyond it.
2. The cap is checked before a paid call when the next call would pass it; if that is not possible, document the overshoot (E3: $0.51 on $0.50) in the report.
3. Resolve the "unknown / unknown" `video-generation` event: find where it is written and record the real provider and model.
4. For the two `tts-1-hd+whisper-1` rows at $0 with `costsBookedSeparately`: prove that separate voice and transcription cost events exist with real amounts; if they do not, book them. Report the voice and transcription cost of the Lego run.
5. A call that failed on a provider limit may legitimately be $0; mark such rows as failed, not as "under-counted".
6. The pricing table has an entry for every model in use, including Sonnet 5.5 (R9); an unknown model is an error in tests, not a silent $0.
7. `runs.get` returns total spend, estimate, limit, spend per attempt, and spend per stage inside each attempt, from the existing ledger (no new tracking). Totals must add up in a test. Task 7 R2 shows it.

## R9. Sonnet 5.5 (E8)

List every stage that uses `claude-sonnet-5` (script writing, script review, video review, planner, others). Switch them through the existing model config to `claude-sonnet-5-5` (confirm the API accepts that id), nothing hardcoded. Add pricing (R8.6). Rerun the script and review fixtures on the new model and report any change in scores or length. Do not change prompts here (Task 6 owns the review prompt).

## R10. Voice samples and voice list (E9)

**Part A, sample test (first, small).** Render chapter 2 of the Lego script (about 90 words) with: the current voice (`tts-1-hd` coral); `gpt-4o-mini-tts` with voices ballad and marin and the direction "calm documentary narrator, human pauses, heavier on loss, lifting at recovery"; and ElevenLabs (two voices) only if a key is configured. Save the files with clear names in the linked folder or R2. Report cost per sample and per full 2-minute video for each option. No pipeline change.

**Part B, voice list (stop and confirm first).** Send the architect the field list and the storage choice (D2) before coding. Intent: a catalog of voices, each with display name, provider, model, provider voice id, tone tags, default direction line, licence note, enabled flag and a stored preview file in R2 (two fixed sentences, one sad and one hopeful; optionally a per-channel preview from the channel's own text, cached). The API lists enabled voices with preview URLs; voice per channel and per run refers to a catalog id; only voices valid for their model are enabled (R1). Seed it with current voices and the Part A voices. The app side (picker with play buttons) is Task 7 R6. Per-channel voice settings are config-driven, never hardcoded to a channel.

## R11. Carry-over fixes

1. `runs.get` returns the approved (edited) script and the original draft separately, and says which one the video used (E10). Check that a Gate 1 edit is stored and used (the founder's edit was used in the video; the Script tab showed the draft).
2. Stale "running" attempt rows (run `9ab4fbe5`): reconcile attempts left in "running" after a restart or crash, for every stage and not only publishing, with a test.
3. `quality-spec-row.test.ts` has 3 failing assertions (expects a 20% window while the source uses the shared 10% `LONG_LENGTH_TOLERANCE`; failing on `main`). Decide with the code: the shared 10% is the policy (PR #75), so fix the test, and say so in the report.
4. Compare (`dashboard.comparison`) returns long-form watch numbers (Task 10 stores them); declare `chapterWarning` in the `runs.get` type.
5. YouTube thumbnail 403: reproduce and fix, or write down why it cannot be fixed.
6. The generated YouTube title and description are not covered by Script Review. The Lego title "How Lego Turned Around Its $220M Crisis" drops "roughly" from the 220 million figure, and the description has not been checked against the brief. Apply the same unsupported-claim and hedge check to the title, description and tags, and coordinate with Task 6 so the rule lives in one place.
7. Queue "Recent runs" filter: confirm the runs list returns runs whose final state is Failed for the Failed filter, with and without a channel filter (Task 7 R10.6 depends on it).

## R12. Runs list returns every run (E11)

The Inbox in the app shows only 7 or 8 runs; it showed more before. Check the runs list endpoint: default limit, cursor or page handling, filters, sort, and whether a recent change lowered a limit. If the backend is the cause, fix it (paging with a cursor, total count) and tell Task 7 the contract. If the backend is correct, say so in one line and Task 7 R1 fixes the app. Test with more than 30 runs.

## Not in this task

Script Review rules SR-1 to SR-9 (Task 6); making the music follow the story's emotion (product gap, deferred: one track plays under the whole video); a search-based fact check; ElevenLabs integration beyond the sample test; moving video; speech and transcription provider retirement dates (6 Jan and 26 Feb 2027); any app screen (Task 7); public publishing.

## Acceptance criteria

All Success Criteria above, plus a replay of the Lego run (or the closest fixture): invalid voice refused before spend; provider limit during review pauses and a retry reviews the same file; shot-length failure repaired with no new images for unchanged scenes; attempt outcomes correct; no logo; length within tolerance; cost per attempt and stage adds up to the total; every item E1 to E12 is marked fixed, deferred (with reason) or not reproducible in the report.

## Schema Impact

None expected: attempt outcome and cost per attempt come from existing records and the ledger. If R0 shows a stored shape must change, stop and report before adding a migration.

## Business Logic / State Transition

New: a "blocked, waiting for provider" state for a step (R4), attempt outcome values (R5), preflight failures before a stage (R2). Existing gates, the 2 regenerations, threshold rules and spend caps keep their meaning. Update `BUSINESS_LOGIC.md` with the preflight table, the error classes and the retry allowance.

## Testing

Studio `npm run build`, `npm run lint`, `npm run typecheck`, and `npx vitest run` for the areas touched. One budgeted real-model check for R6 (logo) and R3 (replay), ceiling $2 in total, dev database or fixtures only, no publish. Report anything skipped as skipped, not passed.

## Report

`docs/execution/sprint5/reports/task8.md`: the R0 table, E1 to E12 status table, one section per requirement, image calls per attempt before and after (R3), real-model cost, deviations, and a one-line status to the founder. Code-complete, merged and deployed are reported as separate statements.

## Definition of Done

Merged PR(s); tests pass; E1 to E12 each marked; the replay shows the behaviours above; the app contract (fields from R5, R8, R10, R11, R12) is written in the report for Task 7.

## Links

[Task 7, app gaps](task7.md) · [Task 6, Script Review rules](task6.md) · [Task 5 report](../reports/task5.md) · [WORKFLOW](../WORKFLOW.md) · [Acceptance plan](../SPRINT4_5_ACCEPTANCE_PLAN.md) (once on `main`)
