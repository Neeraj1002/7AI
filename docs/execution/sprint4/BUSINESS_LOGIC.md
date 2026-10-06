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
