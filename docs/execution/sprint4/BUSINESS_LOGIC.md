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
