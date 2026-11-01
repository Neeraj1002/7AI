# Sprint 6 Task 3 (app): finish (PR 153, branch SPRINT6_TASK3_FE_TYPES)

**Date**: 2026-11-01
**Status**: Complete, one commit. This is PR 153: the router-types change plus dropping the flag, all in the one PR.
**Branch / worktree**: `SPRINT6_TASK3_FE_TYPES`, `D:Study MaterialAI-SPRINT6_TASK3_FE_FINISH`, from `origin/main` (backend #143 at 3794bdd). PR 153.

## Step one: what the server does

- `storyTestsEnabled()` is `env.STORY_TESTS_ENABLED === '1'` (`run-pipeline/story-tests-stage.ts`). With it off, the angle step returns null, so nothing is stored on the run.
- `runs.get.storyTests` comes from `buildStoryTestsView` (`story-tests/view.ts`). It is **null** when nothing is stored and the switch is off (an old run, or a run made with the feature off). When a record is stored, or the switch is on and the run is running at intake, it returns an object whose `enabled` is always `true`.
- One thing to know: a stored record is returned even if the switch is turned off later, so a run made while the switch was on keeps showing its cards. The app follows what the server sends.
- `runs.chooseAngle`: input `{ runId: uuid, angleId: string (min 1) | null }`, output `{ resolved: true }`. `paused_angle` is in `PIPELINE_RUN_STATUSES`, so `runs.list` accepts it.

## What changed

- Types: `app/lib/story-tests.ts` infers every storyTests type from `AppRouter`; `chooseAngle` is called typed in `run/[id].tsx`. **No differences** between the router types and the screens (tsc passes with the screens unchanged), so nothing was reshaped.
- Flag `storyTestsCards` is deleted from `lib/feature-flags.ts` and every read of it. The cards show when `storyTestsOf(data)` is non-null and `enabled`; the "Waiting for your angle choice" wording, the Inbox "Angle" step and button, and the Queue and badge lists use the `paused_angle` status, which the server sets only for a run with story tests. `storyTestsOf` no longer takes a flag argument.
- The Queue and tab-badge queries now always ask for `paused_angle` (constants `QUEUE_STATUSES_WITH_ANGLE`, `QUEUE_BADGE_STATUSES`). This needs the Task 3 backend deployed, since an older server rejects the unknown status.
- Tests: a run with `storyTests` null, disabled or missing draws no angle card and no check card in any status; other statuses keep their wording and Inbox steps; `paused_angle` reads as the angle wait in the chip, Queue, Inbox label and step.
- Left alone: `directionPresets`, `lib/direction.ts`, the `creativeDirection` flag.

## Commands and results (final commit, same code)

```
cd studio && npx vitest run --root ../app -> 33 files, 234 tests passed
cd app && npx tsc --noEmit                   -> 1 error, the known one: ../studio/src/packaging/lettering.ts cannot find '@napi-rs/canvas'. Nothing else.
cd app && npx eslint .                       -> 0 errors, 2 warnings (existing, lib/gate2-packaging.ts)
cd app && npm run build (expo export web)    -> succeeded, "Exported: dist"
```

`npm run lint` (`expo lint`) fails in a folder whose path has a space, so ESLint was run directly.

## Not verified

- No screen was rendered and `runs.chooseAngle` was not called against a server.
- Wording drift for the architect (not a type): the backend writes reader tags as "Reader would click · read 1/read 2/both reads" (`readerTagsFor`), the board says "first try / second try". The app shows labels as given.
- The Queue now needs the backend deployed: the app asks for `paused_angle` unconditionally.
