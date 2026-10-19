# Sprint 5 Task 8: Sprint 4 and 5 test failures and backend fixes: report

**Branch** `SPRINT5_TASK8_BE`, worktree `D:\Study Material\7AI-SPRINT5\task8`, one draft PR for all four groups (R1-R12). Written 2026-10-19.

**One-line status for the founder:** code-complete and tested locally (tsc, eslint, build, 1,054 tests pass, 65 skipped as before); **not merged, not deployed**; the real-model checks that need Anthropic could not run because the Anthropic account is out of credit (see "Real-model checks").

Three separate statements, as the task asks:
- **Code-complete:** yes for R1 to R13 (R10 Part B built after your confirmation; its section lists what is not done), with the exceptions under Deviations.
- **Merged:** no. PR #104 (voice-to-model mapping) merged to `main` on 19 Oct; this branch has `main` merged in and builds on it (see "Overlap with PR #104").
- **Deployed / live-verified:** no. Nothing here was run against production or the dev database.

## R0. What the code really does

| # | Question | Result |
|---|---|---|
| 1 | Voice sent as a plain name with no check against the model's list (E1)? | **Confirmed.** Only `z.enum` of the 13 names was checked, at run create, channel update and profile schema. `tts-1-hd` accepts 9 of them, so Ballad passed every check and failed at OpenAI. (#104 had started to route four voices to `gpt-4o-mini-tts`.) |
| 2 | What triggers attempt 2; new plan and prompts; images keyed by prompt hash? | **Confirmed, with one correction.** A failing review sets the run back to video generation (regeneration cap 2); the planner is called again with the review's fix notes and writes new prompts. Stills ARE cached per run by hash of the final prompt text (`ai-visuals/cache.ts`), so the new prompts missed the cache and all 24 pictures were made again. **Correction:** narration was already reused (chunks are cached by voice, model and text). |
| 3 | Provider error classification; is a provider error in review treated as a failed review (E4)? | **Partly wrong.** Anthropic's workspace-limit 429, OpenAI `insufficient_quota` and rate limits were already classified (`recoveryKind`), thrown non-transient, and parked as a failed stage with a recovery record; Retry reran the review stage only and no regeneration was used. So the run did not rebuild the video. Gaps found and fixed: 401/403 (new class `provider_auth`), the 400 "credit balance is too low" answer (seen live on 19 Oct, was treated as a plain 400), the $0 usage row of a failed call (looked like lost cost), and no test existed. |
| 4 | What is stored per attempt; where does "done" come from (E2)? | Stage row: status (`pending/running/completed/failed/skipped`), input, output, error, times. "Done" is status `completed`, which a review stage reaches even when its verdict is **fail** (the stage ran). Confirmed. Nothing stored per attempt cost; cost lives in the usage ledger by `stageId`. |
| 5 | Image prompt builder; any no-text/logo rule (E6)? | The planner's system prompt already said "never ask for text, logos, watermarks", but the final picture prompt only got "no logos or trademarks, no text or lettering" when the platform flag `AI_VISUALS_SAFETY_NEGATIVES_ENABLED=1` was on. It is off by default, so the image model received no such rule. Confirmed. |
| 6 | Word count planned from target; measured pace used (E5)? | `target / 60 x 155` fixed. `measuredWordsPerMinute` was recorded in the output and used by nothing. Confirmed. |
| 7 | Estimate, retries, where the cap is checked (E7)? | Estimate was one clean attempt; the default limit was 1.5 x estimate; the Video Review call was not in the estimate. The cap was checked after each paid call, so one more picture could pass it ($0.51 on $0.50). Confirmed. |

## E1 to E12 status

| # | Status | Where |
|---|---|---|
| E1 voice refused after spend | **Fixed**, tested | R1 (voice carries its model, client refuses a mismatch before the call), R2 preflight at intake and before video |
| E2 review failure rebuilt the video; "done" shown | **Fixed**, tested with a real-FFmpeg replay (stub pictures) | R3, R5 |
| E3 cap overshoot, cost of regeneration | **Fixed**, tested | R3 (no regeneration for timing), R8 (predictive cap, allowance) |
| E4 provider limit at review | **Partly existed; gaps fixed**, tested; also reproduced live on 19 Oct (Anthropic "credit balance is too low") and the real preflight probe now reports it | R2, R4 |
| E5 1:38 against 2:00 | **Fixed**, tested (273 words, Coral: predicts 98 s and warns) | R7 |
| E6 logos, invented text, wrong imagery | **Fixed in the prompt and the check; verified by eye on real pictures** (7 of 16 before, 0 of 16 after). The vision check itself was **not run against the real model** (Anthropic out of credit) | R6 |
| E7 cost 2.3 x estimate, unreadable ledger | **Fixed** (range, allowance, per-attempt and per-stage cost, unknown/unknown row, failed rows marked). The Lego run's voice and transcription amounts **could not be read** here (no database access) | R8 |
| E8 Sonnet 5.5 | **Switched** in the registry (script writing and planner). The id was **not confirmed against the API** (no credit); Task 6's branch records the same price verified on 18 Oct | R9 |
| E9 voices sound generic | **Part A done** (samples below); **Part B built** (catalog, API, previews uploaded for all 15 voices) | R10 |
| E10 Script tab showed the draft | **Fixed in the data** (`runs.get` returns both, and which one the video used); the screen is Task 7 R3 | R11.1 |
| E11 Inbox stops at 7 or 8 runs | **Backend cause found and fixed:** the Inbox is built from `notifications.list`, which returns the newest 50 rows, and each run has several rows. `runs.list` has no limit and is not the cause. Paged lists added | R12 |
| E12 carried-in items | Stale rows **fixed**; quality-spec test **not reproducible** (see R11.3); Compare **fixed**; `chapterWarning` **declared**; thumbnail 403 **cannot be reproduced here, cause written down, plain message added**; title/description check **added**; Failed filter **confirmed** | R11 |

## R1. Voice valid for its model

**Done by PR #104, reused as it is.** `resolveMediaPurpose(purpose, voice)` maps Ballad, Verse, Marin and Cedar to `gpt-4o-mini-tts` and the other nine stay on `tts-1-hd`; `assertSupportedVoice` refuses an unknown voice at `runs.create` and in the state machine; the pricing rows (including `perMinuteUsd` and booking by measured duration) are #104's. My first R1 version (a per-voice model field, a `TTS_MODEL_VOICES` table and a model-mismatch guard in the speech client) overlapped it and was **dropped when `main` was merged**; nothing of it remains. What R1 still adds on top is in R2: the same voice check runs in preflight, which parks a run cleanly (no stage row, free Retry) instead of throwing, and #104's state-machine check is kept after it as the backstop. Tests are #104's (Ballad on the old model is refused by the provider, Ballad maps to its own model, Coral unchanged).

## R2. Preflight

Table of every check, the setting to change and where it used to be validated is in `BUSINESS_LOGIC.md` (Task 8 section). A block writes no stage row, so attempt numbers and the two regenerations are untouched; Retry after a block does not count against the manual retry limit. Provider probes are one output token on Haiku and one character of speech, cached 10 minutes on success. **Live check:** the real preflight run on 19 Oct returned "Anthropic account limit: Your credit balance is too low ... Nothing was spent" and passed OpenAI. Tests: each check, the gate, retry cost, disabled switch.

## R3. A review failure must not rebuild the video

1. **Plan check before pictures.** The scene timeline (plan plus narration timing) is built before the stills. Scenes over the shot limit (7.5 s, planned to 97% of it) are retimed within their chapter; only a chapter with too few scenes for its narration gets extra scenes, and each extra scene is the only new picture.
2. **Repair the defect only.** A Video Review failure with code `shot_length` or `narration_gap` reuses the previous plan, so every picture and narration chunk comes from the run's cache. A `duration` failure does not (re-timing cannot lengthen the narration). Other failures plan again, as before, and a located single-scene visual defect still goes through Task 5's repair.
3. **Stable plan.** The plan that rendered is the one stored on the stage (including added scenes), so attempt 2 sees the same prompts. The planner is not asked for "patched" scenes in the general case (no located failing scene exists for a content failure); that part of the requirement is covered only for timing and Task 5's single-defect repair.
4. The regeneration cap (2) is unchanged; the allowance is under R8.

**Picture calls per attempt (real-FFmpeg replay, stub narration and pictures, counted by the run cache's key rule):**

| Case | Before this change | After |
|---|---|---|
| E2 replay: one scene held 16 s, limit 7.5 s | attempt 1: 6, attempt 2: 6 (new plan) | attempt 1: 6, **attempt 2: 0**, narration calls 0 |
| Chapter with too few scenes (5 scenes planned, 6 needed) | attempt 1: 5 pictures, the review fails on shot length, attempt 2 plans again: 5 more (10 in all) | the check adds the missing scene up front: 6 pictures in one attempt, no failure; against a cache that already holds the old plan, **exactly 1** new picture |

## R4. Provider errors are not defects

Classes: provider limit, rate limit, auth, our own spend limit, transient network, content or quality. The first four park the run with the provider's own message, keep everything, use no regeneration; Retry reruns the blocked step only. New: `provider_auth` (401/403) and the 400 "credit balance is too low". Test (`state-machine.review-provider-limit.test.ts`): a quota error during Video Review leaves the video and pictures untouched, writes no review log and no step back to generation, and a Retry reviews the same file (two review attempts, same path).

## R5. Honest attempt status

Per stage row: `outcome` in `completed | failed_review | blocked | failed_error | cancelled | skipped | rejected | revised | running | pending`, with `reasonCode`, `reason`, `errorClass`. Per video attempt: the same values from its generation and its review. A review stage with a failing verdict is `failed_review` (carries "longest shot 8.3 s, limit 7.5 s"). Video Review stores `reasonCode` (`shot_length`, `duration`, `narration_gap`, `loudness`, ...).

## R6. No brand logos or lettering

1. Every picture prompt now carries the no-marks rule (text, numbers, signs, logos, brand names, branded packaging, unstated decay imagery) for every style, switched off only when the brief itself asks for logos or on-screen text. The scene writer got two new rules (no brand marks even for a brand topic; no implied facts).
2. Each picture is checked once before the render on the cheap vision tier, six per call, shrunk to 640 px, results cached with the picture; a failing picture is made again once with a stronger instruction; a second failure is flagged (`flaggedStills`) to Video Review and the run. Budget about $0.012 per 2-minute video against the $0.02 of D3 (24 stills, 4 calls; asserted in a test).
3. Video Review keeps its own sample and is told about flagged pictures.

**Real-picture evidence** (16 Lego-brief scene prompts written the way the planner writes them, real image model, contact sheets in `reports/task8-assets/`, judged by eye): **before 7 of 16** show readable text or brand names (factory sign, "Riverdale Theme Park" arch, "Financial Report" page with figures, LEGO CITY / TECHNIC / STAR WARS boxes with a "Build Create Imagine" sign, two company towers with names); **after 0 of 16** show readable text at contact-sheet size (charts have no figures, signs and arches are blank). Image cost $0.079 before, $0.084 after. **Not verified:** the vision check against the real model, and a scene-contradiction count, because the Anthropic account has no credit; the planner could not be run either, which is why fixed prompts were used.

## R7. Length lands near the target

`LONG_WORDS_PER_MINUTE` stays the default; the script writer now plans words from the voice's latest measured pace (`resolveVoicePace`, range-checked 100 to 220), threaded through the target line, the length repair and the range check. `forecastLength` judges the approved text: 273 words at Coral's 167 gives 98.1 s, 18% under, "short" (inside the 96 s floor by 2 s), with a message; below 80% of target it says "under the minimum" and how many words to add. The floor and the 10% tolerance are unchanged. `runs.get.expectedLength` (approved text, else the draft) and `runs.expectedLength({runId, scriptText})` for the Gate 1 edit screen. **New data from Part A:** pace differs a lot by voice (Coral 176, Marin 160, Ballad with direction 139.5 words per minute on the same 90 words), so a single pace could not have been right for a voice change.

## R8. Cost

1. Estimate returns `retryAllowanceUsd` (2 x, D1) and `rangeUsd {minUsd, maxUsd}`; the default spend limit is the allowance rounded up to $0.50 (was 1.5 x); the estimate now includes the Video Review call. Stored on the run as `estimateUsd` and `retryAllowanceUsd`.
2. The spend limit is checked before a picture that would pass it (`assertWithinRunLimit(..., nextCallUsd)`), so no overshoot for pictures; a narration chunk cannot be priced in advance for the guard and can still overshoot by up to one chunk (at most about $0.12 for a 4,000-character chunk). Past the allowance a failed review pauses for a person instead of regenerating; Retry lifts it.
3. "unknown / unknown": written by the video-generation failure path when nothing was spent yet (long-form books every paid call separately, so its summary row legitimately has no cost). It now records `openai` and the real speech and transcription models, with `callFailed` and the failure kind.
4. The two `tts-1-hd+whisper-1` $0 rows are the long-form summary rows with `costsBookedSeparately`. Each narration chunk books its own event (speech: model and amount; transcription: `whisper-1` and amount) through `onNarrationPaid`, covered by the existing narration tests. **The Lego run's actual voice and transcription amounts were not read** (no database here); by the formula they are about $0.056 and $0.012 for a clean 2-minute video. Please read them from the Admin cost list.
5. A call that failed on a provider limit is booked at $0 with `callFailed: true` and `failureKind`.
6. Pricing: every model in use has an entry; an unknown model throws (existing test, extended to the planner).
7. `runs.get`: `cost {spentUsd, estimateUsd, limitUsd, retryAllowanceUsd, attemptsUsd, otherStagesUsd, unattributedUsd}`, `videoAttempts[].costUsd` and `stages[].costUsd`; a test replays the Lego run and checks the parts add up.

## R9. Sonnet 5.5

Stages on `claude-sonnet-5` were **script writing and the planner** (`script-generation`, `video-production-planning`); the task named script review and video review too, but both run on Haiku and are not affected. Both now resolve to `claude-sonnet-5-5` through the registry (nothing hard-coded), priced at $2 / $10 per million tokens, **the same as Sonnet 5 by assumption**; Task 6's branch records the same price from the official overview on 18 Oct. The old id stays priced for old usage rows. **Not done:** confirming the API accepts the id and rerunning the script fixtures on 5.5 (Anthropic out of credit); the acceptance script `scripts/task8-acceptance.ts r9` does it when credit is back (one script on each model, about $0.05).

## R10. Voice samples and the voice list

**Part A.** The same 90 words (a reconstruction of chapter 2 from the brief's allowed facts; the founder's edited script is not in the repository), files in `reports/task8-assets/`. ElevenLabs was **not** tested: no key is configured.

| File | Model, voice | Direction | Seconds | Words per minute | Sample cost | One 2-minute video |
|---|---|---|---|---|---|---|
| `sample-tts-1-hd-coral.mp3` | tts-1-hd, coral | none | 30.6 | 176 | $0.0143 | about $0.056 |
| `sample-gpt-4o-mini-tts-ballad.mp3` | gpt-4o-mini-tts, ballad | calm documentary narrator, human pauses, heavier on loss, lifting at recovery | 38.7 | 140 | $0.0077 | about $0.024 |
| `sample-gpt-4o-mini-tts-marin.mp3` | gpt-4o-mini-tts, marin | same | 33.7 | 160 | $0.0077 | about $0.027 |

The newer model costs about half (priced at $0.015 per audio minute, an estimate the repository already used; the bill will show the real rate) and takes a direction line, which the current `synthesizeSpeech` cannot pass (it has no `instructions` field). Listening and choosing is yours.

**Part B: built after your confirmation (config file), on top of #104's mapping.**
- **Fields** per voice: `id`, `displayName`, `provider`, `model`, `providerVoiceId`, `toneTags[]`, `defaultDirection`, `licenceNote`, `enabled`, `previews {sad, hopeful}` (R2 keys) and an optional per-channel preview (R2 key cached by a hash of voice, direction and the channel's text).
- **Storage (D2):** a config file in the repository (JSON beside `media/registry.ts`), no migration. R0 says it can hold previews because they are R2 keys, not files. A database table only becomes necessary if people must add or disable voices without a deploy.
- **API:** `options.voices` lists enabled voices with signed preview URLs; a channel and a run refer to a catalog id; only voices valid for their model are enabled (R1's table is the check); `VoiceConfig` gains `direction`. Seed: the 13 current voices plus the Part A voices. Per-channel settings stay config-driven.
- **What was built:** `studio/src/media/voice-catalog.config.ts` holds the catalog: 15 entries, the 13 current voices keeping their ids (no stored setting changes) plus `ballad-documentary` and `marin-documentary` (the Part A voices with the sampled direction). The speech model is **not stored** in the catalog: it is #104's `resolveMediaPurpose` applied to the entry's provider voice, so there is one source for it. `media/registry.ts` builds and validates the table at load (unique ids, an enabled entry must name a voice OpenAI offers, a direction only with the newer model); a bad edit fails on boot, never after spend. `TTS_VOICES` and `TTS_VOICE_KEYS` now come from the catalog, so run create, channel update and the profile schema accept exactly the enabled ids. The speech client sends the provider voice name and the direction (`instructions`, `gpt-4o-mini-tts` only), and narration chunk caching includes the direction. `options.list` returns each enabled voice with `key` (the stored id), `label`, `provider`, `model`, `toneTags`, `defaultDirection`, `licenceNote` and `previews {sad, hopeful}` as signed R2 links. `scripts/generate-voice-previews.ts [--upload] [--only id,id]` makes the two fixed sentences per voice through the same speech path (about $0.003 per voice). Tests: `voice-catalog.test.ts` (seed, validation, what reaches the provider) and `options.voices.test.ts`.
- **Previews:** generated and uploaded on 19 Oct after your go-ahead, for all 15 voices, to the configured R2 bucket under `voice-previews/<id>/sad.mp3` and `hopeful.mp3` (30 files, spend $0.0426 including one retry after a network error). Keys follow the voice id, so the catalog sets them for every entry and a new voice needs only `generate-voice-previews.ts --upload --only <id>`. Checked: signed links for `alloy` and `marin-documentary` return 200, `audio/mpeg`. Local copies are in `studio/data/voice-previews/` (not committed).
- **Not done:** the optional per-channel preview from the channel's own text is **not built** (optional in the spec; it needs a paid call and an R2 write per request, so it waits for the picker). Voice stays config-driven per channel, never hard-coded.

### Overlap with PR #104

Both tasks touched voices and speech pricing. Reused from #104, not rebuilt: the voice-to-model mapping (`resolveMediaPurpose`, `NEWER_VOICES`), `assertSupportedVoice` and its two call sites, the `gpt-4o-mini-tts` pricing row and duration-based booking (`probe.ts`, `costBasis`), and its report (`reports/voice-model-mapping.md`, not edited). Dropped from my branch: my own mapping field, `TTS_MODEL_VOICES`, the model-mismatch guard and my first pricing test. Kept as additions: preflight (parks cleanly before #104's check), the speech probe, and the catalog. Merge resolution: `media/registry.ts`, `client.ts`, `index.ts` and `registry.test.ts` took `main`'s version, then the catalog was added on top; `state-machine.ts` keeps #104's early voice check, moved after preflight. #104's report also confirms my pace finding (Ballad and Verse speak slower), which R7 now handles.

## R11. Carry-over fixes

1. **Scripts (E10).** A Gate 1 edit is stored (`gate1.output.sanctionedScriptText`, with chapters) and used (the video input equals it). The Script tab read the writer's draft. `runs.get.scripts {draft, approved, usedByVideo}` and the `chapters` / `scriptEditText` fields now come from the approved script once there is one.
2. **Stale running rows.** `failInterruptedStages` closes `running` attempts: on startup for runs that are no longer running (parked, failed, cancelled, done; a cancelled run's row reads "Cancelled by user"), and before a resumed stage creates its new attempt (gates excluded). Publishing keeps its own receipt-based reconciliation and is excluded. Tests in `resume-on-startup.test.ts`.
3. **`quality-spec-row.test.ts`: not reproducible.** All 7 assertions pass on main and on this branch. Commit `2ac19f4` already changed the Length row to the shared hard tolerance (20%) and the test expects 20%, so source and test agree. The architect text says the shared policy is 10% (PR #75): the **Length row still warns at +/-20%** while the script range and the new forecast use 10%. I left the row as it is (a decision, not a test fix); tell me if the row should be 10%.
4. **Compare:** `dashboard.comparison` now returns `longFormWatch {videosMeasured, avgViewDurationSec, avgViewPercentage, estimatedMinutesWatched}` per video kind and per format (long only, null otherwise; averages over measured videos; a metric the API did not return stays null). `chapterWarning` is declared on the `runs.get` type.
5. **Thumbnail 403.** Cannot be reproduced here (no YouTube access). The scopes the app requests (`youtube.upload`, `youtube.force-ssl`) are enough for `thumbnails.set`; the usual cause of this 403 is a channel that has not completed phone verification in YouTube Studio, which no code can fix. The publish already ignores the failure; it now says so plainly in `coverFrameMessage` on the publishing output (403: verify the channel; 401: reconnect; other: set it by hand). Please check the channel's verification.
6. **Title, description, tags.** `metadata-claims.ts`: figures with a magnitude, currency or percent sign must appear in the approved script or the brief, and a figure the script hedges keeps a hedge. The Lego title "$220M" is flagged ("roughly 220 million dollars" in the script). One regeneration with the problem named, then the publish is held back (Retry regenerates). Years and small counts only warn. **Coordination caveat:** Task 6 (PR #105) owns the number rules in `script-review/numbers.ts`; I did not depend on an unmerged file, so this is a small deliberate copy behind one function (`checkMetadataClaims`). When #105 merges, swap `figuresIn` and `HEDGES` for its exports.
7. **Failed filter.** `runs.list` with `statuses: ['failed']` returns every failed run, with and without `channelId` (tested over 75 runs). Rejected and cancelled runs also have status `failed`; every list row now carries `endReason` (`failed | rejected | cancelled | channel_deleted`) so the app can separate them.

## R12. Runs list

`runs.list` has no limit, no cursor and orders by `updatedAt` (which is never updated on writes); it returns every run of the tenant. It is **not** the cause of E11. The Inbox is built from `notifications.list`, which returns the newest 50 notification rows; each run produces several (request, re-sends, result), so 50 rows are 7 or 8 runs. Added without changing either existing query: `runs.listPage` ({statuses, stage, channelId, limit up to 200, cursor} -> {items, nextCursor, total}, newest first by `createdAt`) and `notifications.listPage` ({limit up to 500, cursor} -> {items, nextCursor, total}). Tested with 75 runs and 160 notification rows (no row lost or repeated, tenant isolation, clamping, defaults).

## R13. Change a waiting run's settings (`runs.updateSettings`)

Added after the first report (founder and architect request; contract from the Task 7 report, R4). `runs.updateSettings({ runId, voice?, audioLayer?, visualSource?, privacyStatus?, maxCostUsd?, retry? })` returns `{ run, changes[{label, from, to}] }`.

- **Who and when:** same owner and tenant rules as retry (`assertGateOwnership`), an active channel, and the run in `needs_attention`, `paused_gate1` or `paused_gate2`. `retry: true` is only for `needs_attention`.
- **Per-stage rules, enforced on the server** (`run-pipeline/run-settings.ts`). Voice, music and pictures are free at Gate 1 and for a failed stage at or before video generation (including a regeneration-cap or allowance pause, because that Retry makes a new video). They are **refused with a one-line reason** once the video is made: at Gate 2, after a blocked review, after a failed publish ("The video is already made, so the voice can't change here. Use Revise at Gate 2 to redo it."). Visibility is allowed at any waiting point until the video is on YouTube, and only `private` when the channel's Gate 2 is off (the existing `channels.update` invariant). Max spend is always allowed. A long video still refuses stock footage with run creation's message. A save that changes nothing is refused ("Nothing to change").
  **Deviation from the table in the Task 7 report:** that table says voice, music and pictures at Gate 2 are "Yes, as a revision". The request here says to refuse changes that would invalidate finished work, so the server refuses them and points to Revise at Gate 2. Say if you want a change at Gate 2 to start a revision itself.
- **Max spend: one way.** `validateMaxCostUsd` is the rule `runs.retry` already used (long videos only, under the per-video ceiling); both calls use it, and a Retry in the same call lifts a retry-allowance pause as before.
- **Validate, preflight, one write.** Run creation's own messages first (voice check, spend limit, stock footage), then the rules, then `settingsPreflightIssues`: the same preflight as before spend, run against the options as they would be, for each stage the change or the retry touches (voice check left out, already applied), nothing written. Then a single `updatePipelineRun`: with `retry: true` the settings, the history entry and the retry (status, stage, count) land in one write via `prepareRetry` and `commitRetry`, which `runs.retry` now uses too. A refused call changes nothing. One case is not combined: a run in legacy planner recovery must be Retried on its own (one-line message).
- **Visibility without a migration.** `creationOptions.privacyStatus` (JSON). Publishing reads it before Gate 2's recorded choice; Gate 2 writes its own choice into it when approving, so an explicit choice at Gate 2 is never overridden by an earlier one, and a change after a failed upload is what publishes. The Gate 2 call defaults to it when no explicit choice is sent. No schema change was needed.
- **History.** `creationOptions.settingsChanges[{at, by{userId, name}, changes[{label, from, to}]}]`, returned as `runs.get.settingsChanges` (oldest first, empty when none). `resolvedOptions` is refreshed for the voice, pictures and music so the run screen shows the run's own choice. `runs.rerun` does not copy the history.
- **Also:** a music mood changed after a plan was made applies to a timing-repair re-render (it reuses the old plan).
- **Tests:** `run-settings.test.ts` (9) and `runs.update-settings.test.ts` (16): free at Gate 1, refused at Gate 2 with the reason and no write, retry in one write with the count, the cap and the budget refusals, preflight message blocks the save, max spend rules, Gate 2 off, already uploaded, nothing to change, and the Gate 2 default.
- **Contract for the app:** `runs.get.settingsChanges`; the response `changes[]` can be shown as the confirmation; errors are BAD_REQUEST with the sentence to show (preflight messages are the same ones the run screen shows), CONFLICT when the run is not waiting or the retry cap is reached.

## Real-model checks (ceiling $2)

Spent **$0.1928** in total, no database, no publish (`reports/task8-assets/spend-ledger.json`, `scripts/task8-acceptance.ts`):
- Voice samples $0.030 and before/after pictures $0.163 (OpenAI).
- **Not run: the Anthropic checks** (script on Sonnet 5 and 5.5, the planner, the picture check). The Anthropic account returned 400 "Your credit balance is too low" on 19 Oct. This is the same family as E4 and now parks a run for Retry; the preflight caught it live. Re-run `npx tsx scripts/task8-acceptance.ts r9 r6` once credit is added (about $0.45).

## Deviations and things to decide

- Overlap with #104 is resolved by reuse (see the Part B section); no part of its mapping or pricing was rebuilt.
- **Default spend limit changed** from 1.5 x to 2 x the estimate (D1), so the brief screen's "suggested limit" is higher; the estimate itself rose slightly (Video Review is now in it).
- Music check: the bed loops with a crossfade, so a track shorter than the video is not an error; a missing, unlicensed or absent mood is. (The task asked for a track at least as long as the video.)
- Re-planning "patches only failing scenes" is done for timing failures and Task 5's single located defect; a content failure with no located scene still plans all scenes again.
- Narration chunks cannot be priced in advance, so the spend cap can still pass by one chunk (R8.2).
- Quality-spec Length row policy (20% versus 10%), see R11.3.
- Title/description check is a copy until Task 6 merges (R11.6).
- `PREFLIGHT_DISABLED` exists so tests and stubbed dry runs do not probe accounts; never set it in production.

## App contract for Task 7 (field names are stable)

- `runs.get`: `stageSummaries[] {stageId, stageName, attemptNumber, status, outcome, reasonCode?, reason?, errorClass?, retryStep?, costUsd, videoAttempt?}`; `videoAttempts[] {attempt, outcome, reasonCode?, reason?, errorClass?, retryStep?, costUsd, stages[]}`; `cost {spentUsd, estimateUsd?, limitUsd?, retryAllowanceUsd?, attemptsUsd, otherStagesUsd, unattributedUsd}`; `scripts {draft, approved, usedByVideo}`; `expectedLength {wordCount, wordsPerMinute, paceSource, expectedSeconds, targetSeconds, floorSeconds, deviation, status, warn, message}`; `flaggedStills[] {sceneIndex, sceneId, issues[]}`; `preflightBlock {stage, at, issues[]} | null`; `chapters` and `scriptEditText` are the approved script after Gate 1; `chapterWarning` is typed.
- Outcome words: show "failed review" (not "done") for `failed_review`; show "waiting for provider, retry this step" for `blocked` with `errorClass` and `reason` (the provider's own words, including a return date).
- `runs.estimateCost` adds `retryAllowanceUsd` and `rangeUsd {minUsd, maxUsd}` (show the range); `runs.expectedLength({runId, scriptText})` for the Gate 1 edit screen.
- A run paused by the retry allowance has `lastError` starting "Automatic retry allowance used"; Retry accepts `maxCostUsd` and lifts the allowance.
- `runs.list` rows have `endReason`; `runs.listPage` and `notifications.listPage` for the Inbox and the Queue (use `nextCursor`, show `total`).
- `options.list.voices[]` has `key` (catalog id, store this), `label`, `provider`, `model`, `toneTags`, `defaultDirection`, `licenceNote`, `previews {sad, hopeful} | null` (signed links, valid 1 hour); publishing output may have `coverFrameMessage`; video review output has `reasonCode`.
- `dashboard.comparison` rows have `longFormWatch`.

## Tests

`npm run typecheck`, `npm run lint`, `npm run build` clean; `npx vitest run`: 132 files passed, 12 skipped (database tests, as before), 1,054 tests passed, 65 skipped. New: preflight (12) and gate (5), shot balance and plan (9), timing repair (4), review provider limit and allowance (8), still check (7), metadata claims (10), length forecast (8), script versions (6), runs.get outcomes and cost (3), list paging (5 + 2), long-form replay with real FFmpeg (2), plus extended registry, run-budget, cost-estimate, scene-prompt, resume and publishing tests. Skipped: the Anthropic real-model checks, live YouTube, any run against a database.
