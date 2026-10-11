# Sprint 4 Task 6: Format Library + Channel Setup API (Backend)

**Date**: 2026-10-06
**Status**: Complete (Advanced-only slice)
**Files Created**: 3 (`formats/manifest.ts`, `manifest.test.ts`, this report)
**Files Modified**: 9
**Tests**: All passing (210 / 210; 9 new)
**Branch**: `sprint4_be`

## What Was Done

- `studio/src/formats/manifest.ts`: the static, typed 9-format manifest (`CONTENT_FORMATS`, `FORMAT_KEYS`,
  `findFormat`), same pattern as `audio-bed/manifest.ts`.
- Resolver precedence is now run override > **format** > profile > legacy > platform default:
  `resolveChannelConfig` takes `formatKey`; a valid format's `targetSeconds` beats the profile's, an
  explicit run-level `targetDurationSec` still beats the format, and an unknown/absent key changes nothing.
  `ResolvedChannelConfig.formatScriptStructure` carries the format's hint.
- Script Generation adds a `Format structure: ...` line (only when a format is set).
- API (names the app depends on): `channels.listFormats` (any valid session; returns the 9 formats) and
  `runs.create`'s `formatKey: z.enum(FORMAT_KEYS).optional()`, stored as `creationOptions.formatKey`
  (a bad key is `BAD_REQUEST` at the edge).
- `channels.createProfileVersion`, `listProfileVersions` and `getActiveProfile` already exist from Task 1,
  so the Advanced setup screen has its full API.

## Schema Changes Applied

None (`formatKey` in the existing `creationOptions` Json).

## Test Results

```
npx vitest run -> 32 files, 210 tests passed; tsc, lint, build clean
```
Unit tests: manifest (9 unique keys, 15-60 s bounds, non-empty fields, `findFormat`); resolver precedence
(countdown 45 s beats a profile 20 s; run override 30 beats the format; unknown/none unchanged; format
without a profile); format-structure prompt line.

Live on `sevenai_dev` through the real router (throwaway tenant, deleted, leftovers 0): `listFormats`
returns the 9 keys; `runs.create` with an invalid key is rejected `BAD_REQUEST`; on a channel whose profile
sets `targetSeconds: 20`, a run created with `formatKey: 'countdown'` persists `{"formatKey":"countdown"}`
and resolves to **45 s** with the structure hint; the same plus `targetDurationSec: 30` resolves to 30; a
run with no format resolves to the profile's 20 s with no structure. Task 7's `dashboard.comparison`
groups that channel's runs as `["countdown", null]`, so the two tasks agree on the key.

## Deviations from Spec

- A valid `runs.create` with a `formatKey` was not called end to end (it starts the paid pipeline and
  needs a connected YouTube credential). Persistence and resolution were checked via `createRun` plus
  `loadResolvedConfig`, the code `runs.create` and the stages use; only the edge validation went through
  the router.
- The doc's `findFormat(key: string)` was widened to accept null/undefined so the resolver can pass
  `creationOptions.formatKey` directly.

## Scope note (explicitly deferred, not dropped)

This is the **Advanced-only** slice. The AI-drafted profile setup, the guided multi-step wizard with
example galleries, and a DB-backed no-deploy-editable format table are deferred follow-on work, as named
in `STATUS.md`.

## Sign-Off

- Task Objective: Met
- Schema Impact: None
- Business Logic: `BUSINESS_LOGIC.md` updated
- Tests: Passing
- Ready for Integration: Yes
