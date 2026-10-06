# Sprint 4 Task 1: Channel Profile Model + Shared Resolver

**Date**: 2026-10-06
**Status**: Complete
**Files Created**: 9 (migration, 4 in `channel-profile/` incl. test, repository, SCHEMA.md, BUSINESS_LOGIC.md, this report)
**Files Modified**: 8 (schema.prisma, channels router, channel and pipeline-run repositories, state-machine, 2 type files, STATUS.md)
**Tests**: All passing (174 / 174; 9 new)
**Branch**: `sprint4_be`

## What Was Done

- Migration `20261006080445_sprint4_channel_profiles` (applied to `sevenai_dev`; `migrate status` up to date):
  `channel_profile_versions`, `channels.activeProfileVersionId`, `pipeline_runs.profileVersionId`, all
  nullable, no backfill.
- `studio/src/channel-profile/`: `schema.ts` (strict zod `ChannelProfileDataSchema`, incl. R18 packaging
  fields), `resolve.ts` (pure `resolveChannelConfig`), `index.ts`, `resolve.test.ts`.
- Repository `channel-profile-version.repository.ts`: `insertProfileVersion` (transaction, row lock on
  the channel, version = max + 1, moves the active pointer), `findActiveProfileForChannel`,
  `listProfileVersionsForChannel`, `findProfileVersionById`.
- API (exact names the app depends on): `channels.createProfileVersion`, `channels.getActiveProfile`,
  `channels.listProfileVersions`.
- `createRun` snapshots the channel's active version onto `PipelineRun.profileVersionId`.
- Domain types gained `Channel.activeProfileVersionId` and `PipelineRun.profileVersionId`, so both come
  back from `channels.*` and `runs.get`.

## Schema Changes Applied

`20261006080445_sprint4_channel_profiles` (see `SCHEMA.md`).

## Test Results

```
npx vitest run            -> 27 files, 174 tests passed
npx tsc --noEmit, npm run lint, npm run build -> clean
npx prisma validate / migrate status -> valid / up to date
```

Live check on `sevenai_dev` through the real router (`appRouter.createCaller`) with a throwaway tenant,
user and channels (`ZZ_TASK1_*`, all deleted; leftovers 0):
- no profile: `getActiveProfile` returns `null`; a run created on that channel has `profileVersionId = null`.
- `createProfileVersion({script:{guide:'test'}})` -> version 1; direct DB read shows 1 row,
  `activeProfileVersionId` points at it, `createdByUserId` set, `getActiveProfile` returns it.
- A run created after v1 snapshots v1. A second version -> 2, `listProfileVersions` returns `[2, 1]`,
  the active pointer moves, and the earlier run still points at v1.
- Two concurrent creates got distinct versions (3 and 4).
- Rejections: typo'd key and invalid voice -> `BAD_REQUEST` with a readable message; another tenant ->
  `NOT_FOUND` (create and read); a non-owner member -> `FORBIDDEN`. Row count unchanged by rejects.

## Deviations from Spec

- **Regression check scope**: the doc asks for a brief through `runs.create` completing the pipeline. I
  verified the changed code path (`createRun` on a profile-less channel gives `null`) but did not run a
  full paid pipeline: no stage reads the resolver or the new column yet, so there is no behavior to
  diverge, and a full run costs real money. Task 2 is the first consumer.
- Migration was generated with `prisma migrate dev --create-only` and applied with `migrate deploy`
  (the shell is non-interactive).
- The repository takes a `FOR UPDATE` lock on the channel row, which the doc did not specify, so that
  concurrent creates cannot compute the same version (the unique constraint remains the backstop).
- `getActiveProfile` is also shipped (in the doc's R2); the app-facing names `createProfileVersion` and
  `listProfileVersions` are exact.

## Sign-Off

- Task Objective: Met
- Schema Impact: Matches `SCHEMA.md` (created by this task)
- Business Logic: Matches `BUSINESS_LOGIC.md` (created by this task)
- Tests: Passing
- Ready for Integration: Yes
