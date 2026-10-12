# Sprint 4 Schema Changes

Incremental, not cumulative: only what Sprint 4 changes. Updated in place by each task that touches the schema.

## Task 1: Channel Profile Model (migration `20261006080445_sprint4_channel_profiles`)

All additive and nullable; no backfill.

- **New table `channel_profile_versions`**: `id uuid pk`, `channelId uuid` (FK `channels`, RESTRICT),
  `version int`, `data jsonb` (validated against `studio/src/channel-profile/schema.ts`
  `ChannelProfileDataSchema` at write time), `createdByUserId uuid?` (FK `users`, SET NULL),
  `createdAt`. Unique `(channelId, version)`, index on `channelId`. Rows are immutable: a change is a new
  row with `version = max + 1`.
- **`channels.activeProfileVersionId uuid?`** (FK `channel_profile_versions`, SET NULL). `null` (every
  existing channel) means "no profile": resolve from legacy `Channel` fields and platform defaults.
- **`pipeline_runs.profileVersionId uuid?`** (FK `channel_profile_versions`, SET NULL). Snapshot of the
  channel's active version at run creation; `null` for every existing run and for runs on a profile-less
  channel.

## Task 7: none (read-only aggregation over existing tables).

Tasks 2-6: none expected yet; update here if that changes.

## Task 2: none (Json-column additions only)

`PipelineRun.creationOptions.sources` and `PipelineStage.output.styleGuideViolations` (script_review).

## Task 3: none (prompt text and one env flag).

## Task 6: none (`creationOptions.formatKey` in the existing Json column).

## Task 4: `review_logs.approvedByUserId` (migration `20261007085716_sprint4_review_log_approver`)

`approvedByUserId uuid NULL REFERENCES users(id) ON DELETE SET NULL`. The real signed-in user who resolved
a gate; `null` for non-human rows, rows that predate the column, and gates resolved via the ops/script
path. No backfill.

## Task 5: none (`intake` stage output gains optional `repeatTopic`; publishing stage output gains `selfDeclaredMadeForKids`; both Json).

## Task 9 (PR A): none (Json-column additions only)

`PipelineRun.creationOptions` gains `videoKind` (stored only for long), a widened integer `targetDurationSec` (long: 120..900 whole minutes, stored as resolved) and `maxCostUsd` (long only). `ChannelProfileVersion.data` gains optional `offeredFormatKeys: string[]`; an older version without it means "none offered". `PipelineStage.output` for script_generation may carry `chapters` (written by PR B).

## Task 9 (PR B): none (Json-column additions only)

- `PipelineStage.output` (script_generation) gains `chapters: {title, text}[]` and, when the length stayed outside +-20% after the one repair, `lengthOutOfRange: true`. (gate1) gains `chapters` (the approved or edited chapters).
- `PipelineStage.output` (video_generation, long only) gains `videoKind`, `width`, `height`, `fps`, `frameCount`, `chapterTimings: {title, startSec, endSec}[]`, `subtitlesPath`, `r2SubtitlesKey`; its `plan` gains `longScenes: {chapterIndex, words, prompt}[]`.
- `PipelineRun.creationOptions.maxCostUsd` can be raised by `runs.retry({ maxCostUsd })` (written with the existing creationOptions merge).
- `UsageEvent` rows of a long run: one per narration request (`metadata.part` = `tts` / `transcription`), one per still (`part` = `still`) and one per planner call, written as each is paid for. The summary `video-generation` row carries `$0` and `metadata.costsBookedSeparately = true`.
- Files (not DB): `data/ai-visuals-cache/<runId>/` and `data/videos/<runId>/work/` (narration chunks, chapter segments, mixed audio) are removed when the run ends (completed or failed). The finished videos and the SRT stay.
