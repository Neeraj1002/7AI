# Sprint 4 Business Logic Changes

Incremental, not cumulative. Updated in place by each task that changes control flow.

## Task 1: Channel profile snapshot and resolution order

- `createRun` (`run-pipeline/state-machine.ts`) reads the target channel's `activeProfileVersionId` and
  copies it to `PipelineRun.profileVersionId` once, at creation. It is never re-read: changing a channel's
  profile mid-run does not change what an in-flight run is produced against. Stage code that needs the
  profile loads it by `findProfileVersionById(run.profileVersionId)`, not through the channel.
- `resolveChannelConfig()` (`studio/src/channel-profile/resolve.ts`, pure) resolves each field as:
  run override -> profile -> legacy `Channel` field -> platform default. It cannot throw. A channel with no
  profile resolves to exactly today's behavior (legacy `styleGuide`/`defaultVoice`, platform defaults:
  45 s target, `brief-plus-common` fact policy, `selfDeclaredMadeForKids: false`). Task 6 adds a
  `formatKey` level between run override and profile.
- `channels.createProfileVersion` is ownership-checked (`canResolveGate`), validates `data` strictly
  (a typo'd key is a `BAD_REQUEST`), takes a row lock on the channel so concurrent creates get distinct
  versions, and moves the channel's active pointer in the same transaction.

## Task 7: none (purely additive read).

Tasks 2-6: update here as each lands.

## Task 2: Script stages read the resolved config

- `runScriptGenerationStage` and `runScriptReviewStage` load the run's own snapshotted profile
  (`run-pipeline/resolved-config.ts`) and pass the resolved guide, `targetSeconds`, fact policy and banned
  lists to the agents, plus `run.briefText` always. Target precedence: run `targetDurationSec` > profile
  `script.targetSeconds` > platform default 45 (replaces the old "30-60 seconds" literal; a profile-less
  channel now aims at 45 s).
- `script_review` output gains `styleGuideViolations`. Gate 1 reads `factualConcerns` and
  `styleGuideViolations` from the latest completed `script_review` output and `sources` from
  `creationOptions.sources`, and renders each as a labelled block before the Reply line (omitted when
  empty, so the message is byte-identical when none exist).
- Closes the pre-existing gap where `factualConcerns` reached Gate 1 only as a sentence inside the
  ReviewLog rationale. That sentence is no longer written; `runs.get` returns `scriptReview` instead.
- No new transitions or failure modes.

## Task 3: Video stage reads the resolved config

- `runVideoGenerationStage` resolves voice, visual source override and audio layer through
  `loadResolvedConfig` (run override > profile > legacy > default; identical to before for a profile-less
  channel). A profile's `visual.secondsPerStill` gives `desiredStillCount = clamp(ceil(targetSeconds /
  secondsPerStill), 3, 20)` to the planner, replacing Task 8's `estimateStillCount` only when set.
- AI-still scene prompts get the profile's style/negative text, plus the platform safety clause when
  `AI_VISUALS_SAFETY_NEGATIVES_ENABLED=1`; Video Intelligence then also checks AI stills (not stock) for
  logos, baked-in text, photoreal real people and gore. A violation is a normal review fail and regen.
- No new transitions or failure modes.

## Task 6: Format precedence level

- Resolution order is now run override > format > profile > legacy `Channel` field > platform default.
  A valid `creationOptions.formatKey` (from `formats/manifest.ts`) sets `targetSeconds` from the format
  (still beaten by an explicit run `targetDurationSec`) and passes the format's `scriptStructure` to Script
  Generation as one extra prompt line. An unknown or absent key changes nothing.
- No new transitions or failure modes.

## Task 4: Approver identity on gate decisions

- A gate reply and the user who gave it travel together (`{ reply, userId }`) from `runs.gate1/gate2`
  (`ctx.userId`) through `resolvePendingApproval` and the notification channels into `Gate1Outcome` /
  `Gate2Outcome.approvedByUserId`, and from there into the human `ReviewLog` row. Ops/script resolutions
  carry `userId: null`. No gate outcome logic changed.
- `findGate1ApproverForRun(runId)` is the read side Task 5 uses for the `{editor}` credit.

## Task 5: Packaging, upload fields and the repeat-topic warning

- Metadata Generation receives the run's resolved packaging (title guidance, description template, base
  hashtags, editor credit). `{editor}` = the Gate 1 approver's name/email (`findGate1ApproverForRun`), else
  "the team"; `{sources}` = `creationOptions.sources` or removed. Credits are enforced on the model's reply,
  never left to prompt-following. A failed approver lookup is logged and falls back; it never blocks a publish.
- `videos.insert` always carries `status.selfDeclaredMadeForKids` (resolved, default false) and
  `snippet.categoryId`/`defaultLanguage` only when the profile sets them; the publishing stage output
  records `selfDeclaredMadeForKids`.
- After Intake completes, the topic is compared with the channel's last 20 runs; a likely repeat is written
  to the intake stage output as `repeatTopic`, shown at Gate 1 and returned by `runs.get`
  (`scriptReview.repeatTopic`). Non-blocking; a failure of the check never fails the run.

## Task 9 (PR A): Video kind, offered formats and the cost estimate

- `runs.create` resolves the video kind (explicit `videoKind`, else the format's, else short), validates the length per kind (short 30/45/60; long whole minutes 120..900), refuses a format of the other kind, a format outside a non-empty `offeredFormatKeys`, stock footage on a long run, and a bad `maxCostUsd`. Shorts requests are unchanged.
- `runs.estimateCost` is read-only: per-attempt and worst-case estimate from the real unit prices, the suggested per-video limit (1.5x the estimate, next $0.50) and the channel's remaining weekly budget. `maxCostUsd` is stored but not yet enforced during the run (PR B).
- No new run statuses or stages.

## Task 10: Long-form review, preview, publishing and analytics

- **Script Review**: `videoKind = 'long'` switches to the long-form rubric (chapter flow, cold open, open loops, closing line, length within +/-20% including `lengthOutOfRange`). Output adds optional `chapterNotes`. Shorts use the old prompt and stage input byte for byte.
- **Video review**: a long run uses `qualityProfileFor('long', secondsPerStill)`: 1920x1080, 30 fps, 120 to 900 s, video within 2% of the narration (`chapterTimings` last `endSec`), no caption check, longest shot allowed `1.5 x secondsPerStill`. Visual review samples one frame inside every chapter (cap 12). Blocking rules are the Shorts kinds (audio, resolution, fps, loudness) plus duration range and narration match.
- **Before Gate 2**: after a passing long review the stage creates the 1280x720 preview copy and checks `captions.srt` exists; both are stored beside the draft (R2 when configured, local files always). A missing SRT or a failed ffmpeg is a stage failure with the normal retry. Gate 2 follows the channel toggle; nothing forces a stop.
- **Gate 2 message** gains `Warning:` lines; a long run whose chapters break YouTube's rules (fewer than 3, one under 10 s, not starting at 0) gets one, and is published without the chapter list.
- **Publishing (long)**: description = generated text + chapter list (`00:00 <first title>`, then `m:ss`/`h:mm:ss`) + `Music:` lines for beds whose license requires attribution; no `#shorts` anywhere; category defaults to 27. After the upload succeeds the SRT is uploaded with `captions.insert` (scope `youtube.force-ssl`, 400 quota units); a failure never fails or retries the publish, and is recorded with a plain message (403 permission: reconnect; anything else: upload by hand).
- **Analytics**: long snapshots also record `longFormMetrics`; if the Analytics API is not reachable the snapshot still records views/likes/comments. `dashboard.comparison` takes an optional `videoKind`; rows carry `videoKind`; a channel with both kinds has `avgViewsPerVideo = null` and per-kind averages in `byVideoKind`.
- No new run statuses or stages.

## Task 9 (PR B): Long-form pipeline

- **Same stages and gates.** `videoKind = long` changes what each stage does, not the state machine. Preconditions for `video_generation`: Gate 1 approved with chapters, plan present, the per-video limit and the weekly budget not reached.
- **Script**: chaptered prompt (about 145 words a minute, 3-6 chapters of at least 25 words, cold open, open loops, forward-pointing close; facts only from the brief and `sources`); one repair for an unusable reply, one for a word count outside +-20%; a still-out-of-range script continues with `lengthOutOfRange`. Gate 1 edit sheet = `## Title` + text per chapter; `runs.gate1` refuses an edit with fewer than 3 chapters.
- **Video generation order**: narration per chapter (chunks under 4,000 characters; Whisper per chunk; 250 ms/80 ms gaps) -> mixed, -14 LUFS audio (music chain with 3 s crossfades; license must be cleared for monetised public use) -> SRT from the exact script text -> stills (landscape, cached by prompt hash, paid and booked one by one) -> one video segment per chapter -> join and mux. Every step that can be resumed is: finished narration chunks, stills and chapter segments are reused after a crash or Retry.
- **Spend**: `runs.create` rejects a video that does not fit the channel's remaining weekly share (both numbers in the message) or a `maxCostUsd` below the estimate. During the run the stage stops with `needs_attention` when the run's booked spend reaches `maxCostUsd` (checked before narration, before the stills, before the render and after every paid call) or when the channel's weekly budget is gone (before the stills and before the render). `runs.retry({ maxCostUsd })` raises the limit.
- **Failure handling**: a transient TTS/Whisper failure retries that chunk only (3 tries); a moderation-blocked still is skipped and its scene reuses the neighbouring image; SRT that cannot be aligned to the script, a music license that is not cleared, or a chapter without scenes fails the stage loudly.
- **Restart**: a running long-form `video_generation` stage is resumed after a restart up to 3 hours after it started (the default 30-minute window would have parked it).
