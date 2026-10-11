# Sprint 4 Task 9: Long-Form Video Foundation (Backend)

**Date**: 2026-10-11
**Status**: PR A complete (API contract). PR B (R2 to R7 pipeline work) not started.
**Branch**: `SPRINT4_TASK9A_BE` (worktree `D:\Study Material\7AI-SPRINT4_TASK9A_BE`), cut from `main` at `b764b40`.
**Tests**: `npm run build`, `npm run lint`, `npm run typecheck` clean; `npx vitest run` 80 files passed, 544 tests passed (9 files / 49 tests skipped, the DB-backed ones).

This report is shared by both PRs. PR B adds its sections below; the R0 table is filled for the files PR A touched and
marked "PR B" for the rest.

## PR A: what was done

- **R1 `videoKind`**: `runs.create` takes `videoKind?: 'short' | 'long'` (default short) and `targetDurationSec` as an integer.
  Short keeps 30/45/60; long must be whole minutes from 120 to 900, else `BAD_REQUEST` "Video length must be a whole number of minutes from 2 to 15".
  `videoKind` is inferred from `formatKey` when not sent; a disagreeing pair is `BAD_REQUEST`. A request with neither field is
  byte-identical to before (no `creationOptions` written; asserted in a test). A long run stores `videoKind: 'long'` and the
  resolved `targetDurationSec` (600 by default) in `creationOptions`, so later stages read one place.
- **Format manifest**: `ContentFormat.videoKind`; new generic long format `chaptered-explainer` (600 s, 4 chapters, cold open, closing line).
- **Resolver**: `ResolvedChannelConfig` gains `videoKind`, `offeredFormatKeys`. Precedence unchanged (run, format, profile, default).
  The 60 s cap now applies to short only; long defaults to 600 s; the profile's `script.targetSeconds` (a Shorts setting) is ignored for long;
  a format of the other kind contributes nothing.
- **`runs.get`** returns `videoKind` and `targetSeconds` (from the run's own snapshotted profile via `loadResolvedConfig`), plus `chapters`
  when the latest completed script attempt has them. `previewUrl`, `subtitlesUrl`, `subtitlesUploaded`, `subtitlesMessage` are typed
  (`LongFormRunFields`) and absent until PR B / Task 10 fill them; nothing is faked.
- **R1b offered formats**: `ChannelProfileDataSchema.offeredFormatKeys` (known keys only, no duplicates, any short/long mix).
  `channels.listFormats({ channelId?, videoKind? })`: no input returns all formats exactly as before (each with `videoKind`); with `channelId`, the
  profile's formats in the profile's order (`[]` for none/older version/no profile); `videoKind` filters after. `runs.create` rejects a format outside a
  non-empty list ("That format is not offered by this channel"); an empty list accepts any known format; Freeform (no `formatKey`) is unaffected.
- **R7 contract**: new `runs.estimateCost({ channelId, videoKind, targetDurationSec?, options? })` returns
  `{ estimateUsd, worstCaseUsd, suggestedMaxUsd, remainingWeeklyUsd }`. `runs.create` takes `maxCostUsd` (long only; default `suggestedMaxUsd`),
  rejects one below the per-attempt estimate or above `LONGFORM_MAX_RUN_USD_LIMIT` (new env, default 10), and stores it. Not yet enforced during the run (PR B).
- **Also in A**: `runs.create` refuses an explicit `visualSource: 'stock-footage'` for a long run (R5.3); `ScriptGenerationOutput` type gains optional
  `chapters` (type only; the Zod schema and so the Shorts structured-output request are untouched).

## Estimator (first numbers, planning assumptions, to be calibrated in PR B)

`run-pipeline/cost-estimate.ts` prices stills through `resolveImagePricing`, narration through `resolveTtsPricing`, Whisper through `resolveTranscriptionPricing`,
LLM calls through `resolvePricing` (per purpose). Token and character counts are assumptions until PR B measures them.

| Length | Stills | Per attempt | Worst case (3 attempts, stills paid once) | Suggested limit |
| --- | --- | --- | --- | --- |
| 2 min | 24 | $0.41 | $0.61 | $1.00 |
| 10 min | 120 | $1.98 | $2.81 | $3.00 |
| 15 min | 180 | $2.95 | $4.18 | $4.50 |

The 10-minute figure matches the task's "about $2.0 to $2.2" and is above the playbook's $1.55 pilot (100 stills, narration only).

## R0: "What exists" versus the real code

| Line in the task | Result |
| --- | --- |
| `targetDurationSec` is a union of 30/45/60 (Sprint 3 Task 9 R4) | **Confirmed** (`CreationOptionsSchema` and `runs.create`); widened to an integer, rule checked in the mutation |
| Resolver defaults to 45 and never exceeds 60 | **Partly wrong**: default 45 is right, but there was no 60 cap in `resolveChannelConfig`; the bound only came from input validation and the profile schema (max 60). The cap is now explicit and short-only |
| `runs.create` takes `formatKey` (Task 6) | **Confirmed** (`z.enum(FORMAT_KEYS)`) |
| `ChannelProfileDataSchema`, `ChannelProfileVersion` (Task 1) | **Confirmed**; the profile lives in a Json `data` column, so no migration is needed |
| 9 seed formats and `channels.listFormats` | **Confirmed**; `listFormats` took no input and returned the manifest as is |
| New tenants get $10 a week split across connected channels (Task 12) | **Confirmed** (`DEFAULT_WEEKLY_BUDGET_USD = 10`, `loadChannelBudgetView`) |
| "The pre-check runs before render" | **Wrong for `runs.create`**: `create` does no budget check today; the gate runs in `retry`, Gate 2 revise and inside the stages. The create-time pre-check is new work (PR B, R7.2) |
| `generateScript` rewritten, Task 2 fields | PR B (not opened yet) |
| TTS and Whisper calls; `ai-visuals/client.ts` and `registry.ts`; `STILL_SIZE`; `estimateStillCount` cap 20 | PR B. Seen so far: `resolveImagePricing` does throw for an unknown model (**confirmed**); `estimateStillCount` is clamped 6-20 by `QUALITY_SPEC.pacing`, and `computeDesiredStillCount` has its own 3-20 clamp, so both must change for long (**confirmed**) |
| `video-generation/index.ts`, `captions-ass.ts`, `audio-mix.ts`, `audio-bed/manifest.ts`, stage resume (Task 12 R5) | PR B |

## Schema changes applied

None. `videoKind`, `targetDurationSec`, `maxCostUsd` live in the existing `creationOptions` Json; `offeredFormatKeys` lives in the existing profile `data` Json.

## Deviations and open items

- `getActiveProfile` / `listProfileVersions` return the stored `data` as is, so an older version has no `offeredFormatKeys` key (absent, not `[]`). The resolver and
  `listFormats` treat absent as `[]`. Say if the app wants the repository to normalise it to `[]`.
- `maxCostUsd` on a Short is refused with `BAD_REQUEST` (the spec only defines it for long). Easy to relax if the app sends it for every brief.
- `estimateCost`'s `options.secondsPerStill` is honoured by the estimate but `runs.create` does not accept it yet, so a UI that sets it would see an estimate that
  differs from the one `create` checks. Leave unset until PR B decides where per-run `secondsPerStill` lives.
- The weekly-share pre-check at `runs.create` and the in-run `maxCostUsd` enforcement are PR B (R7.2, R7.3); `estimateCost` already returns `remainingWeeklyUsd`.
- `docs/STATUS.md` and the sprint STATUS tracker were not edited, per the task. The branch name is recorded here instead.
- Added re-exports `resolvePurpose`/`resolvePricing` (`llm/index.ts`) and `resolveTtsPricing`/`resolveTranscriptionPricing` (`media/index.ts`) because the lint rule forbids importing the registries directly.
- The Prisma client in a fresh worktree was stale; `npx prisma generate` was needed before `tsc` passed.
