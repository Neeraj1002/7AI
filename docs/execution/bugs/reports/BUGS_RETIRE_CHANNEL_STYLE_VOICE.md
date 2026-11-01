# BUGS_RETIRE_CHANNEL_STYLE_VOICE: report

Retires `Channel.styleGuide` and `Channel.defaultVoice`. The channel's active content profile owns the script guide (`script.guide`) and the default voice (`audio.defaultVoice`). One commit, backend and app together.

## Step 0 findings

| Claim | Result |
|---|---|
| Readers/writers: schema, channel.repository, channel.types (type and create input), channels.ts update input and patch, resolved-config, resolve, admin-tenants, admin-planner-diagnostics, set-channel-default-voice script, new-brief, run/[id], admin/tenant/[id] | Confirmed |
| `runs.ts` four places | Confirmed with a correction: three `resolveChannelConfig`/`buildResolvedOptions` calls passed the legacy fields (create, rerun, preview), and three `loadResolvedConfig` stand-ins plus one more call passed the channel. Two of the stand-in sites loaded the channel only for that argument. |
| Anything else | `resolved-options.ts` (voice source label `channel`) and its tests; the planner-diagnostics repository selected both fields; callers of `loadResolvedConfig` in state-machine (7), packaging-stage (2), preflight-gate (2) passed a channel only for the fallback; comments in `invite-tenant.ts` and `migrate-founder-youtube-credential.ts` pointed at the deleted script. |
| Runs resolve at read time or store per run | Read time and at execution (`loadResolvedConfig`: the run's snapshotted profile version plus the live channel columns). Only the creation-time `resolvedOptions` source labels are stored. |
| Would any existing run change | Yes. Preview data: 52 runs have no profile snapshot (23 completed, 28 failed, 1 needs_attention); 2 runs have a snapshot with no voice (1 failed, 1 paused_gate2). Start to Shelf's profile had no voice (the founder is setting it in the app). The architect accepted the change. |
| `channels.update` zod input non-strict | Confirmed: plain `z.object`, unknown keys are stripped, so an old app build sending `styleGuide` / `defaultVoice` does not error. |
| Open PRs / unmerged branches on the four files | None open. `SPRINT6_TASK2_BE2` (closed PR 126, unmerged `runs.ts` edits) treated as abandoned on the architect's word. |

## What changed

- Resolver: `scriptGuide = profile.script.guide ?? null`; `audioDefaultVoice = runOverride ?? profile.audio.defaultVoice ?? DEFAULT_TTS_VOICE`. Legacy parameters removed from `resolveChannelConfig`, `buildResolvedOptions`, `loadResolvedConfig` and every caller.
- API reads keep the field name `defaultVoice` (installed app builds keep working). Its value now comes from the channel's ACTIVE PROFILE (`audio.defaultVoice`, else the platform default). `channels.list` fetches the profiles for all channels in one query (`findActiveProfileDataByChannelIds`); `get` and `update` use the same helper for one channel. The admin tenant list reads the active profile in the same query as the channels.
- Removed both fields from: `channels.update` input and patch, create input, repository, channel type, admin repositories, the stand-ins, and `scripts/set-channel-default-voice.ts` (deleted).
- Migration `20261102000000_retire_channel_style_voice` drops both columns.
- App: `new-brief.tsx` and `run/[id].tsx` already read `channel.defaultVoice` from the server, so they now show the resolved value with no code change. The admin tenant screen no longer needs its `?? '—'` fallback (the server always sends a voice).
- Incidental: `channels.create` spread an un-awaited promise, so its response had only `budgetWarning`. It now awaits, so the response also carries the channel fields.

## What a NEW channel with no profile now gets

No script guide (`scriptGuide = null`) and the platform default voice (`DEFAULT_TTS_VOICE`). The architect may want channel creation to require a profile.

## Backup before the merge click (the migration cannot be undone)

**Merging to main deploys** (`deploy.yml` deploys on every push to main), and the deploy runs `prisma migrate deploy`, which **drops two columns** (`channels.styleGuide`, `channels.defaultVoice`). Take the `pg_dump` **before** the merge click, not after.

```
pg_dump -Fc -h 127.0.0.1 -U sevenai_app sevenai_preview > sevenai_preview_before_retire_style_voice.dump
```
Use the real preview database name and host. `deploy.sh` runs `migrate deploy`; nothing was run on the VPS.

## Docs that still name the old fields (not edited)

`docs/channel_bibles/` (COLD_OPEN, NIYT, START_TO_SHELF), `docs/decisions/PROMPT_LAYERS.md`, `docs/design_doc/MVP_PART2_MULTI_USER_AND_FLEXIBLE_CREATION.md`, `docs/execution/admin/sprint1/be/task1.md`, `docs/execution/sprint4/` (BUSINESS_LOGIC, SCHEMA, reports task2/task3, tasks task1/task2/task9), `docs/execution/sprint5/reports/` (task6, voice-model-mapping), `docs/execution/sprint6/tasks/task4.md`, `docs/execution/bugs/reports/BUGS_CHANNEL_SETTINGS_DUPES.md`.

## Tests

- Resolver: a profile with guide and voice resolves to them; no profile gives no guide and the platform default voice; a profile without a voice gives the platform default; voice precedence run > profile > default.
- New `channels.default-voice.test.ts`: the API's `defaultVoice` comes from the profile (list with one profile query, get, and a profile without a voice).
- Updated: resolved-options, runs long-form / run-screen / actions tests, planner diagnostics test, state-machine test stand-ins. The stale-voice test now sets the voice on the profile.

## Results (final pushed head; code identical across the amends that only touched this report)

**CI (PR 157; the green run on the code head, 63e1fe2, run 41336390807; the final head differs only in this report):** Typecheck, lint and build: pass. App typecheck, lint and tests: pass. Deploy to VPS: skipped (deploys only on push to main). **CI does not run the studio vitest suite**, so the numbers below are the only backend test evidence (follow-up row at the end).

**Studio vitest, sandbox database `sevenai_retire_sandbox`** (migrations applied through the new one), every full run, one after another, nothing else running:

| Run | Result | Failing tests |
|---|---|---|
| Clean main, run 1 | 1901 passed, 9 skipped, 0 failed | none |
| Clean main, run 2 | 1901 passed, 9 skipped, 0 failed | none |
| Branch, run 1 | 1903 passed, 3 failed | `media/voice-catalog.test.ts` > every catalog voice is sent as a voice its model accepts (5 s timeout); `stock-footage/client.test.ts` > assigns a different sourceId when the first is excluded (30 s); `agents/video-generation/long-form.replay.test.ts` > one scene over the limit is retimed before any picture (300 s) |
| Branch, run 2 | 1904 passed, 2 failed | `stock-footage/client.test.ts` (same test, 30 s); `packaging/lettering.test.ts` > draws the lettering where the picture is calm and reports both zones (5 s) |
| Branch, run 3 | 1906 passed, 9 skipped, 0 failed | none |

Every failure is a timeout (not an assertion). Each passes when its file is run alone: voice-catalog, stock-footage and long-form replay passed alone twice (19 of 19 tests); lettering and stock-footage passed alone twice (13 of 13). None failed on clean main in two full runs, but the set of timeouts differed between branch runs 1 and 2 and run 3 was clean, none of the files touch code changed here (media voice catalog, stock footage stub, video generation replay, lettering), and they are CPU/ffmpeg heavy. I read this as intermittent timeouts under full-suite load on this machine, but I could not reproduce them on main, so the claim is: passes alone, intermittent on the branch, not seen on main in two runs. CI cannot confirm it because it does not run these tests.

**Static checks on the pushed head:** studio `tsc --noEmit` 0 errors (the known `@napi-rs/canvas` error did not appear on this machine); studio `eslint .` 0 problems; app `tsc --noEmit` 0 errors; app `eslint .` 0 errors, 2 `array-type` warnings (in `app/lib/gate2-packaging.ts`, a file this PR does not touch). App build: not rerun, since no app file changed after the last successful `expo export --platform web`.

## Zero behaviour change for a profile with both values

Ran the old resolver (from `origin/main`) and the new one on three fixture profiles (guide + voice, as the live channels hold), with and without legacy channel values, and with a run voice override, a long video kind and a format key: 24 cases, identical resolved config (`deepStrictEqual`). No model call. The only changes in behaviour are for runs or channels that were relying on the fallback (above), which the architect accepted.

## Added to this PR: the STORY_TESTS_ENABLED switch is removed (founder, 2026-11-01)

The story tests (angle step before the script, cold read of the finished script) are now always on.

**Every place the switch was read**
- `config/env.ts`: the `STORY_TESTS_ENABLED` variable (removed).
- `run-pipeline/story-tests-stage.ts`: `storyTestsEnabled()` (removed), plus its guards in `runAngleStepForRun` (intake, Part A) and `runScriptCheckForRun` (script review, Part B).
- `run-pipeline/state-machine.ts`: the pipeline tags at intake (now always `storyTests: 'on'`) and the chosen-angle read in script generation (now always reads the intake stage).
- `api/routers/runs.ts` (`runs.get`): passed `switchOn` to `buildStoryTestsView`; the `switchOn` parameter in `story-tests/view.ts` is removed, so the "running" card shows for any run in intake.

**Unchanged:** the contract field `storyTests.enabled` is still `true` whenever a record exists, and the app is untouched. Old runs (no record) still read `storyTests` as `null`. The skip rules are as before (Gate 1 off skips the angle step; a brief that fixes its own structure skips it). Part B still runs with Gate 1 off. `pipelineTags` keeps its `on | off` shape so old tagged runs still read.

**Tests:** removed the two switch-only cases (the `switchOn: false` view case, the "switch off: intake not read" case) and renamed the "feature off" cases, which now test that a step returning no record leaves the stage as for an old run (tags now read `on`). Tests that an old run reads `storyTests` as null are kept.

**For the founder:** the `STORY_TESTS_ENABLED=1` line in the server `.env` is now unused. Leave it or delete it.

**Task 3 docs now wrong (not edited; architect to update):**
- `docs/execution/sprint6/reports/task3.md` line 7 (rollout rule), lines 46-47 (rollout step 3 and the "Switch" bullet), line 148 ("Feature switch ... With it off ...").
- `docs/execution/sprint6/tasks/task3.md` line 233 (Rollout).
- `docs/execution/sprint6/reports/task3-fe-finish.md` line 9 (`storyTestsEnabled()`).
- `docs/execution/sprint6/PLAN.md` line 140 and `docs/STATUS.md` line 71 (the switch "stays off"; off limits for this task).
- The rollout order still matters: the app PR (angle card) must be live before this backend deploys, since an old app shows a waiting run as "In progress" with no way to answer.

## Confirmations (architect review)

- The migration drops only `channels.styleGuide` and `channels.defaultVoice` (two `ALTER TABLE ... DROP COLUMN` lines; applied to a sandbox database, the remaining `channels` columns are the expected ones).
- A channel or run with no content profile gets `DEFAULT_TTS_VOICE` and no script guide (`null`) without throwing: tested in `channel-profile/resolve.test.ts` and the new `run-pipeline/resolved-config.test.ts`; the state-machine tests run script generation with no guide.
- Old runs (no record) still read `storyTests` as `null`: `story-tests/angle-step.test.ts` (view null for an old run), `learning.test.ts` (old intake output is untagged), `runs.paused-angle.integration.test.ts` (no record leaves intake as for an old run).
- The `pg_dump` command is above.

## Follow-up for the architect (not fixed here)

| Item | Detail |
|---|---|
| CI does not run the studio vitest suite | `.github/workflows/deploy.yml` runs studio typecheck, lint and build, and only the app's vitest. The local numbers in this report are the only backend test evidence for this PR. Suggest adding a studio vitest job (needs a `_test` Postgres service for the sandbox-gated tests). |
