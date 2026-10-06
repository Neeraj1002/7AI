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
