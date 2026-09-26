# Bugs Task 1: First Device Test — Login Unreachable, Wrong Host Default, Stale Build, Empty Channel Picker

**Date**: 2026-09-26
**Status**: Code complete and confirmed on `main` — real-device verification pending (founder action needed)
**Files Created**: 1 (this report — the first durable copy; see **Note on this report's history** below)
**Files Modified**: 0 in this commit (all code changes landed separately, directly on `main`, via the
founder — see below)
**Tests**: Confirmed by direct read against `origin/main`; real-device checks not performed (no `adb`/
`eas` device session available in this environment — same gap as originally noted).

## What Was Done

This task's 4 items (R1, R2, R3, R4) were implemented across two hot-fixer sessions and landed on `main`
through a mix of a hot-fixer PR and the founder's own direct pushes. As of this report, all code is
**confirmed present on `origin/main`** by direct read:

- **R1 — Android cleartext-traffic block** (`APP`): `app/app.json`'s `plugins` array includes
  `["expo-build-properties", {"android": {"usesCleartextTraffic": true}}]` on `origin/main` (confirmed
  via `git show origin/main:app/app.json`). Landed via commit `2d3ecde` ("Add EAS build configuration for
  Android") and follow-up commits `fd6c9df`/`f98d4e7`.
- **R2 — Login screen's wrong `localhost` default** (`FE`): `app/app/login.tsx` line 32 on `origin/main`
  reads `const [apiUrl, setApiUrlField] = useState(storedApiUrl ?? '');` — the wrong default is gone.
  Confirmed via `git show origin/main:app/app/login.tsx`.
- **R3 — Stale build** (process, no code): see **R3 confirmation** below.
- **R4 — Channel picker loading/empty state** (`FE`): `app/app/(app)/new-brief.tsx` on `origin/main`
  destructures `isLoading: channelsLoading` from `useChannels()` and branches the channel section into
  loading / empty / populated states, with a code comment explicitly attributing it to "Bugs Task 1/R4."
  Confirmed via `git show origin/main:app/app/(app)/new-brief.tsx`. Landed via commit `947d81d` ("Update
  app configuration and enhance loading states in NewBriefScreen and LoginForm").

### R3 confirmation (process check)
Checked `D:\Study Material\7AI-frontend` (7fe) directly as of 2026-09-26: the merge conflict that
blocked this checkout during the first hot-fixer session (see this report's history, below) **is now
resolved** — 7fe is clean apart from two unrelated, uncommitted local modifications
(`app/package-lock.json`, `docs/execution/templates/TASK_TEMPLATE.md`), currently checked out to
`SPRINT3_FE` (`65e82ff`), which is fully merged into `origin/main` via PR #15. Before the next `eas
build`, whoever runs it should `git checkout main && git pull` in 7fe first, to confirm the exact commit
about to ship — same instruction the task doc already gives, just reconfirmed as still the right process
given 7fe's now-clean state.

## Files Created/Modified
- Created (this commit): `docs/execution/bugs/reports/task1.md`
- Modified (this commit): `docs/execution/bugs/STATUS.md` (final status/branch update)
- All actual code changes (`app/app.json`, `app/app/login.tsx`, `app/app/(app)/new-brief.tsx`,
  `app/package.json`, `app/package-lock.json`) are **already on `main`**, landed outside this commit —
  see **What Was Done** above for the exact commits.

## Schema Changes Applied
None.

## Test Results
Direct-read confirmation against `origin/main` (see **What Was Done** above) stands in for re-running
`npm run build`/`lint`/`typecheck` here, since no code in this commit changes `app/` — those commands
were already run and passed in the session that authored the `947d81d`-era code (see this report's prior
draft, superseded). No `adb logcat` output, no EAS build, no physical-device sign-in has been performed
by any hot-fixer session — this environment has no `adb`/`eas` device session available.

## Deviations from Spec

### Note on this report's history
This is the **first version of this report that has ever been committed to git**. An earlier hot-fixer
session wrote a draft of this report and a related code implementation on a branch/worktree
(`BUGS_FE` / `D:\Study Material\7AI-bugs-fe`), but that work was **superseded** — the actual R1/R2/R4 code
that shipped to `main` landed through a different path (the founder's own direct pushes, confirmed
deliberate and out of scope for this protocol's no-direct-push rule, which binds hot-fixer sessions, not
the founder), not through that branch. That branch/worktree is now considered dead per
`HOTFIXER_AGENT_PROTOCOL.md`'s Coordination §6. This report supersedes that draft entirely; the draft is
not linked from here since it no longer reflects what actually shipped.

### Worktree note
This report is committed from a **newly created** shared worktree, `D:\Study Material\7AI-bugs`, per the
protocol's Coordination §4 (a single shared worktree for this whole track, not one per branch/role). The
prior worktree, `D:\Study Material\7AI-bugs-fe`, could not be renamed to `7AI-bugs` as instructed — every
attempt (`git worktree move`, plain filesystem move, PowerShell `Rename-Item`) failed with "device or
resource busy" / "used by another process," and neither a process-list nor a command-line search turned
up anything with an open handle in that path. This is most likely a transient OS-level lock (Windows
Search indexing or Defender scanning the ~1,200 files just installed into that worktree's
`node_modules`), not an actual in-progress edit — but since it didn't clear after several retries, and
the protocol itself allows creating `7AI-bugs` fresh when renaming isn't clean, that's the path taken
here. **`D:\Study Material\7AI-bugs-fe` is still on disk and should be deleted once the lock clears** —
its content is already superseded (see above), so nothing is lost by removing it.

### Branch note
This commit (report + `STATUS.md` only, no app code) is on a new branch, `BUGS_TASK1_REPORT`, rather than
`BUGS_FE` — `BUGS_FE` was still checked out (and thus locked) in the old, un-renameable
`D:\Study Material\7AI-bugs-fe` worktree at the time this branch was created, so reusing that name would
have collided. This is a docs-only closure commit, not a `BE`/`FE`/`APP` code change, so it doesn't
cleanly fit the three-role naming convention — flagging this explicitly rather than silently picking a
role that doesn't really apply.

### No functional deviation from the task doc
R1, R2, R3, and R4 all match the task doc's Fix sections as actually shipped — nothing about *what* was
built differs from spec, only *how* the paper trail around it was reconstructed after the first session's
report never made it into git.

## Sign-Off
- Task Objective: Met — all 4 items' code is confirmed present on `main`.
- Schema Impact: None
- Business Logic: No new control flow
- Tests: Confirmed via direct read against `origin/main`; automated build/lint/typecheck not re-run in
  this commit (no `app/` code changed here)
- Real device end-to-end sign-in: **Still not confirmed.** This remains founder-action-pending, same
  honest posture as this report's original draft — nothing in this closure pass changes that.
- Ready for Integration: Yes, for the documentation/paper-trail closure this commit represents. The
  underlying code has already been integrated (it's on `main`).

## Known Issues / Future Improvements
- R2's fix (empty default + hint) still relies on the founder typing the right LAN IP by hand — unchanged
  limitation, out of scope here.
- `D:\Study Material\7AI-bugs-fe` needs manual deletion once its OS-level lock clears (see Deviations
  above) — not urgent, but leaving two worktrees around invites the exact confusion the protocol's
  single-shared-worktree rule exists to prevent.

## Links & References
- [TASK_TEMPLATE.md](../../templates/TASK_TEMPLATE.md)
- [HOTFIXER_AGENT_PROTOCOL.md](../HOTFIXER_AGENT_PROTOCOL.md)
- `docs/execution/bugs/STATUS.md`
- `docs/execution/bugs/tasks/task1.md`
