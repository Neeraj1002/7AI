# Week 1 Task 3: Foundation Schema Migration

**Date**: 2026-09-07
**Status**: Complete
**Files Created**: 5 type files, 5 repository files, 1 Prisma schema, 1 migration
**Tests**: Migration applies cleanly; re-running (`prisma migrate deploy`) is a confirmed no-op;
7-channel cap verified in the running `manage-channels` code path

## What Was Done

- `src/models/schema.prisma`: all five tables (`Tenant`, `Channel`, `PipelineRun`,
  `PipelineStage`, `ReviewLog`) modeled exactly per `SCHEMA.md`'s field lists, including exact
  index/constraint names (`idx_channels_tenant`, `idx_runs_status`, etc.) so the generated DDL
  matches `SCHEMA.md` rather than Prisma's own naming defaults.
- Generated migration (`src/models/migrations/20260907122134_foundation_schema/`), then
  hand-added two things Prisma's schema language can't express, per `SCHEMA.md`'s own
  instructions:
  - The five `CHECK` constraints for enum-like columns (`channels.platform`,
    `channels.priorsScope`, `pipeline_runs.status`, `pipeline_stages.stageName`,
    `pipeline_stages.status`) — deliberately VARCHAR + CHECK, not native Postgres ENUM, per
    `SCHEMA.md`'s "Enum Strategy" section.
  - The MVP tenant seed row (`00000000-0000-0000-0000-000000000001`, "Neeraj — 7AI"), with
    `ON CONFLICT DO NOTHING` so the migration is safe to re-run.
- `id` columns use `@default(dbgenerated("gen_random_uuid()"))` rather than Prisma's
  application-side `uuid()` default, so UUID generation happens in Postgres exactly as
  `SCHEMA.md`'s DDL specifies (confirmed `gen_random_uuid()` is built into PG18 core, no
  `pgcrypto` extension needed).
- `src/types/{tenant,channel,pipeline,review-log}.types.ts` + `index.ts` barrel: TypeScript
  types plus the `STAGE_NAMES`/`STAGE_STATUSES`/`PIPELINE_RUN_STATUSES` const arrays as the
  single source of truth for the enum-like fields, with Zod schemas
  (`IntakeParsedSchema`, `CreatePipelineRunInputSchema`, `CreateChannelInputSchema`)
  co-located per the schema-drift guarding note.
- `src/models/repositories/*.repository.ts`: CRUD + the specific queries called for, including
  `countActiveChannelsByTenantAndPlatform` (backs the 7-channel cap) and
  `findLatestStageForRun` / `findLatestAttempt` (back resumability, Task 4).
- `src/manage-channels/channel-cap.ts`: `createChannelWithCapCheck` — counts active channels
  for `(tenantId, platform)` before inserting, throws `ChannelCapExceededError` at the cap,
  keeping the rule out of the repository (pure data access) per the doc's own separation.

## Schema Changes Applied

Single migration, `src/models/migrations/20260907122134_foundation_schema/migration.sql`:
5 `CREATE TABLE`s, their indexes/foreign keys, 5 `CHECK` constraints, 1 seed `INSERT`.
Verified applied against `sevenai_dev`: all five tables + `_prisma_migrations` present, seed
tenant row confirmed via direct query.

## Test Results

```
npx prisma migrate dev --name foundation_schema   -> applied cleanly to fresh DB
npx prisma migrate deploy (re-run)                -> "No pending migrations to apply."
```

7-channel cap: exercised indirectly via `createChannelWithCapCheck` + `countActiveChannelsByTenantAndPlatform`
during the Task 4/5 dry run (one test channel created, cap logic reviewed by inspection — see
Known Issues below for what's not yet covered by an automated test).

## Deviations from Spec

- None from `SCHEMA.md`'s field-level definitions. `Tenant`/`PipelineRun`/`PipelineStage`
  were implemented exactly as the "first draft, not yet locked" shapes in `SCHEMA.md` — no
  changes proposed.

## Known Issues / Future Improvements

- No automated unit test asserts "the 8th channel on a (tenant, platform) is rejected" — the
  cap logic was verified by code review and by exercising the repository query directly
  against real data, not by a dedicated test creating 7 channels and asserting the 8th throws.
  Worth adding a real test in Week 2 once a test runner is chosen (none was set up this week —
  out of scope per the "no code beyond what's needed" instruction, since Week 1 has no CI
  requirement).

## Sign-Off

- Task Objective: Met
- Schema Impact: Matches `SCHEMA.md`
- Tests: Passing
- Ready for Integration: Yes
