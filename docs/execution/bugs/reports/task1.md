# Bugs Task 1: First Device Test — Login Unreachable, Wrong Host Default, Stale Build, Empty Channel Picker

**Date**: 2026-09-26
**Status**: Code complete — real-device verification pending (founder action needed)
**Files Created**: 1 (this report)
**Files Modified**: 4 (`app/app.json`, `app/app/login.tsx`, `app/app/(app)/new-brief.tsx`, `app/package.json` + `app/package-lock.json`)
**Tests**: Build, lint, typecheck all passing. Real-device verification (R1/R3) not yet performed — see below.

## What Was Done

### R1 — Android cleartext-traffic block
Installed `expo-build-properties` (`npx expo install expo-build-properties` in `app/`) and added it to
`app.json`'s `plugins` array with `{ "android": { "usesCleartextTraffic": true } }`, matching the task
doc's fix exactly.

### R2 — Login screen's wrong `localhost` default
Changed `login.tsx`'s `apiUrl` initial state from `'http://localhost:4000'` to `''`, and added a
persistent (not placeholder-only) hint under the API base URL field: "Use your computer's LAN IP (e.g.
192.168.1.23:4000) — this device can't reach your computer's own localhost."

### R3 — Stale build (process, no code)
No code change, as the task doc specifies — this is a build-process item. See **Deviations from Spec**
below for an important change to *where* this fix lives, which affects how R3's own "always build from
7fe" instruction applies right now.

### R4 — Channel picker has no loading/empty state
`new-brief.tsx` now destructures `isLoading` (aliased `channelsLoading`) from `useChannels()` and
branches the channel section into three states: a loading indicator while `channelsLoading`, a real
empty-state message ("No channels set up yet." + a link to `/channels`) when `!channelsLoading &&
channels.length === 0`, and the existing chip list otherwise — unchanged from before.

## Files Created/Modified
- Created: `docs/execution/bugs/reports/task1.md` (this report)
- Modified: `app/app.json`, `app/app/login.tsx`, `app/app/(app)/new-brief.tsx`, `app/package.json`,
  `app/package-lock.json` (dependency lockfile update from installing `expo-build-properties`)

## Schema Changes Applied
None.

## Test Results
```
$ npm run build   (expo export --platform web)
Web Bundled 11986ms node_modules\expo-router\entry.js (1027 modules)
Exported: dist                                                        → PASS, no errors

$ npm run lint    (expo lint)
(no output — no warnings/errors)                                      → PASS

$ npm run typecheck   (tsc --noEmit, app/ + referenced studio/ types)
(no output — no errors)                                               → PASS
```
No `adb logcat` output, no EAS build, no physical-device sign-in — see **Deviations from Spec**. This
environment has no `adb` or `eas` CLI available, and no physical Android device attached, so R1's and
R3's own verification steps (real device, real cleartext check, real installed-app confirmation)
genuinely could not be performed here.

## Deviations from Spec

1. **Work happened on a new branch/worktree, not 7fe.** The task doc assumes edits land directly in 7fe
   (`D:\Study Material\7AI-frontend`). When I went to start there, 7fe had an **unresolved merge in
   progress** — real conflict markers in `app/eas.json` and `app/package-lock.json` (`both
   added`/`both modified`), local `main` diverged from `origin/main` by 1 local / 6 remote commits, and a
   large staged-but-uncommitted changeset (sprint2/3/4 docs, a new Prisma migration, `studio/src/api/`
   changes, `app/app.json` itself already modified). Per the protocol's Coordination §3 ("if the working
   tree isn't clean... stop and report the discrepancy rather than guessing — another chat may be
   mid-edit"), I stopped and asked the founder rather than touching that worktree. The founder directed
   me to work from a **separate worktree on a fresh branch off `origin/main`** instead.

   Result: a new worktree at `D:\Study Material\7AI-bugs-fe`, branch `BUGS_FE`, created fresh from
   `origin/main` (`4ad91df`, which already includes all of `SPRINT3_BE` merged via PR #13). All 4 fixes
   are implemented and committed there, verified via `npm run build`/`lint`/`typecheck`, **not** via a
   real device.

   **What this means for closing out R1/R3's live-verification bar**: the founder needs to either (a)
   resolve or abandon 7fe's in-progress merge, then merge/rebase `BUGS_FE` (or `main`, once this PR
   lands) into 7fe and build from there, or (b) run `eas build --platform android --profile preview`
   directly from this `BUGS_FE` worktree (it already has `app/eas.json`) instead of 7fe, if getting a
   verifiable build out sooner matters more than building specifically from the 7fe checkout. Either way,
   7fe's unresolved merge is a separate, real problem this task did not create and this report is not
   the place to resolve it silently.

2. **`docs/execution/bugs/` itself was uncommitted before this task.** The protocol doc, `STATUS.md`, and
   `task1.md` existed only as untracked files in the `D:\Study Material\7AI` checkout (no branch, no
   history) — apparently written by a prior session that never committed them. I copied them into this
   worktree/branch and committed them as this task's claim commit, so the track's own paper trail now
   actually exists in git.

3. **No functional deviation from the task doc's Fix sections** — R1, R2, and R4's code changes match
   the task doc exactly (same plugin config, same default-value change, same three-state branching for
   the channel picker).

## Sign-Off
- Task Objective: Code complete for all 4 items; **live on-device verification not yet done** (blocked
  on tooling/device access this session doesn't have — see above).
- Schema Impact: None
- Business Logic: No new control flow
- Tests: Build/lint/typecheck passing
- Real device end-to-end sign-in: **Not confirmed** — needs the founder's device, per this repo's own
  "never 'should work', always real verification" bar. Do not treat this report as closing R1/R3's
  verification requirement.
- Ready for Integration: Code yes; full task sign-off no, pending the founder's on-device pass.

## Known Issues / Future Improvements
- R2's fix (empty default + hint) still relies on the founder typing the right LAN IP by hand each time
  the API's address changes — unchanged from the task doc's own noted limitation, out of scope here.
- 7fe's unresolved merge (see Deviations #1) is a pre-existing problem independent of this task; flagging
  it here since it blocks the normal "build from 7fe" path until someone resolves it.

## Links & References
- [TASK_TEMPLATE.md](../../templates/TASK_TEMPLATE.md)
- [HOTFIXER_AGENT_PROTOCOL.md](../HOTFIXER_AGENT_PROTOCOL.md)
- `docs/execution/bugs/STATUS.md`
- `docs/execution/bugs/tasks/task1.md`
