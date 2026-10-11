# Bugs Task 8: Urgent Pipeline-Run Bug-Fix Pass + Follow-Up Decisions

**Date**: 2026-09-27
**Status**: **Two PRs under one doc task.** PR #33 (R1-R4) **merged to `main`**. PR #36 (R5-R6, the two
decisions below) is **open, not yet merged**. R1-R3 and R5-R6's backend are live-verified; R4 and the
app UI for R3/R5/R6 are typechecked/linted only, never rendered on a device — founder should verify live
once PR #36 merges.
**Branch**: **two branches for this one doc task** — `BUGS_TASK7` (PR #33, merged) and `BUGS_TASK8`
(PR #36, open). This is a deviation from the usual one-branch-per-release convention, itself a
downstream consequence of the original naming collision: `BUGS_TASK7` was taken by this task instead of
doc Task 7 (Bug-Report Triage Fields, unrelated, still unstarted — see `bugs/STATUS.md`'s collision
warning), so the follow-up build picked the next free sequential branch number, `BUGS_TASK8`, without
knowing it wasn't reserved for a "Task 9." No actual conflict resulted, but match by PR number (#33 vs
#36), not branch-name digit, if in doubt.
**PR**: [#33](https://github.com/Neeraj1002/7AI/pull/33) (merged, cut from `main` after PR #32 landed) +
[#36](https://github.com/Neeraj1002/7AI/pull/36) (open, cut from `main` after #33 merged; "merges
cleanly, no CI checks ran" per the hot-fixer).
**Dispatch**: both ad hoc — no task doc filed first for either, deliberately, to move fast. PR #33:
triage-and-fix-top-5 pass. PR #36: direct follow-through once the founder decided both of PR #33's open
product questions (2026-09-27).

## What was asked

**PR #33**: Triage all open `bug_reports` rows (no list endpoint exists yet — queried the table
directly), root-cause by reading code first rather than reproducing live, and fix the 5 most recent bugs
specifically about pipeline runs immediately, before anything else.
**PR #36**: Bug 7 (`1a6510b5`) — block starting a run on a channel with no YouTube connection, per
founder decision. Bug 8 (`6fc6b6d6`) — fix the app hanging forever when the server is down, per founder
go-ahead to touch `auth.tsx`.

## Findings — 15 open reports, resolved as follows

**Priority 5 (pipeline-run bugs, spanning runs `cdc65ae4`, `3e120e13`, `e162acec`):**

1. **`f7db3cf5`** ("breaking at gate1, `updatePipelineRun` error", run `cdc65ae4`) — the original error
   didn't reproduce on replay. What the investigation did find, and fixed: after a server restart, a
   resumed/reopened gate1 approval never actually drove the run forward — `resume-on-startup.ts` called
   `runGate1Stage` directly instead of routing through the pipeline runner loop, so nothing continued
   execution afterward. Best guess for the original symptom: `npm run dev`'s auto-restart-on-file-edit
   killed an approve mid-write. **Fix: R2.**
2. **`2e3b0078`** ("where is video generation failing", run `3e120e13`) — partially diagnosed. The real
   error was being thrown away; `failStageAndEscalate` only ever stored a generic "Stage attempt failed
   after 3 retries" message. All three failed attempts died ~12s in with an untyped error (points at
   ffmpeg/filesystem, not the LLM/TTS calls), but re-running video generation on the identical code and
   DB succeeded both times — the original failure looks environment-specific or transient and couldn't
   be reproduced. **Fix: R1** (the real error is now captured and logged, so a recurrence will be
   diagnosable).
3-5. **`155a6e4f`, `3c926202`, `05325e3a`** (all run `e162acec`, "no way to resolve or cancel Needs
   attention") — root cause: the app genuinely had no action for a `needs_attention` run, and the error
   sat behind a collapsed "Details" toggle. (`3c926202`'s own claim that the run "has no stage rows" was
   checked and found wrong — it does have stage rows; that report's diagnosis, not the underlying bug,
   was off.) **Fix: R3.**

**Other open reports:**

- **`ff01766a`** ("run didn't show in Queue until I refreshed") — root cause: the Queue only shows
  gate/needs-attention runs and never refetches on its own. **Fix: R4.**
- **`1a6510b5`** ("channel not linked to YouTube, run still worked") — root cause: publishing uses each
  channel's own YouTube credential with no shared fallback, so an unlinked channel could run the full
  pipeline and only fail at the publishing step. **Fixed: R5** (founder decided 2026-09-27: block it).
- **`6fc6b6d6`** ("server down, app loads forever") — root cause: no request timeout plus 3× retry, so a
  dead server spun forever. **Fixed: R6** (founder go-ahead given 2026-09-27 to touch `auth.tsx`).
- **`5ffdd70c`** ("text area covered by keyboard") — **not fixed, ambiguous**. The report is filed from
  the Queue screen, which has no text area at all — can't tell which screen was actually meant. Founder
  is personally checking (2026-09-27) whether this is already fixed incidentally; pending confirmation.
- **`e016fb7e`, `5e104f03`, `149cf265`, `45483757`, `3baa4c08`, `22278f32`** — the founder's own
  test/verification rows. No action needed; can be closed.

## Fixes shipped

- **R1** — `failStageAndEscalate` now preserves and logs the real underlying error instead of a generic
  "failed after 3 retries" message.
- **R2** — the most consequential fix. After a restart, a resumed run now keeps moving through the same
  loop a fresh run uses, instead of stalling silently at `status: running`. **Live-verified**: after the
  fix, run `cdc65ae4` autonomously cycled `video_generation` → `video_review` → two more regen attempts
  → landed at the video-review regen cap (`needs_attention` — a normal quality outcome, not a bug),
  entirely on its own across a real restart.
- **R3** — new `runs.retry` and `runs.cancel` mutations (retry re-runs the failed stage and rejects
  archived channels; cancel marks the run `failed` with "Cancelled by user", no schema change), plus an
  app "What went wrong" card with Retry/Cancel buttons (Cancel asks for confirmation) on `needs_attention`
  runs. Also fixed a broken word-count regex that made the Run screen's approximate script length always
  wrong. **Live-verified over the API** (ops token, default tenant): retry started a new attempt that
  correctly hit the budget gate and returned to `needs_attention`; cancel set a run to `failed`;
  wrong-status calls, other-tenant calls, and archived-channel retries were all correctly rejected.
  **Not verified before PR #33's merge**: the new app UI itself.
- **R4** — the Queue now polls every 15s; the Run-detail screen polls every 5s while its run is in
  progress. **Verified**: typecheck only. Polling-based, not push/websocket-based — a working fix, not
  an architecturally ideal one.
- **R5** (`1a6510b5`, PR #36) — `runs.create` now refuses to start a run on a channel with no YouTube
  connection (using the existing `hasYoutubeCredential` field). New Brief shows "This channel isn't
  connected to YouTube yet. Connect it →" (links to the channel screen) and disables Create Run for an
  unlinked channel. **Live-verified**: creating a run on unlinked channel `c91ce243` was refused, no run
  row written. **Not tested**: the linked-channel path — deliberately skipped, since a successful create
  starts a real, paid pipeline run.
- **R6** (`6fc6b6d6`, PR #36) — tRPC requests now time out at 10s and a "server down" failure isn't
  retried; the app pings the existing `/health` route on launch; when the server can't be reached, the
  signed-in app routes to a new "Can't reach the server" screen (Try again / Sign out). **Live-verified**
  against a running server: dead port detected in 17ms, unreachable host detected at the 10s timeout,
  and — after a first version got this wrong — a live server rejecting a bad token (plain 401, not
  tRPC's normal error shape) is correctly **not** classified as "down."

## Also touched (PR #36)

- `main` had picked up a new dependency, `@fastify/multipart` (from the merged UI Enhancement 2 work),
  not yet installed in this worktree — installed from the lockfile to get a clean typecheck.
- A CRLF-line-ending file broke a scripted find/replace; switched to manual edits for that file.
- `checkServer`'s state update was flagged as a lint false-positive (state set after an `await`, read as
  synchronous); fixed by inlining the ping in a promise callback with a cancel flag to avoid stale
  results after unmount.
- Two lint errors pre-existing on `main`, in `lib/channel-context.tsx` and `lib/use-video-source.ts`,
  unrelated to this change — left alone, noted for awareness.
- Everything in PR #36 is JS/React-Native-logic-only — **ships via OTA**, no new build/reinstall needed
  once merged (per the shipping-boundary note in `STATUS.md`).

## Limits / what's not verified

- **App UI for R3-R6 was typechecked only, not rendered, before their respective merges** — the
  worktree's `app/node_modules` was incomplete for R3/R4; minting a session token was blocked for R5/R6.
  **Founder should click through all four on a real device once PR #36 merges and OTA lands**: Retry/
  Cancel on `e162acec` or `cdc65ae4`; the New Brief unlinked-channel hint; the server-down screen
  (stop the server and confirm "Can't reach the server" with working Try again / Sign out).
- **Couldn't test R3 as the actually-affected tenant** — minting a session token for tenant `9190494a`
  was blocked by the permission classifier, so R3's live HTTP verification ran against the
  default/ops-token tenant's runs instead of the real affected tenant's.
- R1's real original error (for `3e120e13`) was never actually observed — it didn't reproduce, so R1's
  fix is a genuine improvement (a recurrence will now be diagnosable) but not proof the original cause is
  understood.
- **R5's linked-channel (success) path was never tested** — deliberately, to avoid starting a real, paid
  pipeline run.

## Real dev-DB side effects (disclosed)

- `3e120e13` and `e162acec` had video generation re-run during diagnosis; both are now waiting at Gate 2.
- `cdc65ae4` progressed on its own after the R2 fix and ended at the video-review regen cap
  (`needs_attention`).
- Run `90e2b9a3` was cancelled and run `9d43eada` failed as "Channel deleted" (its channel had been
  archived) as part of live-verifying R3.
- Every gate reopened during the multiple server restarts this investigation required re-sent the founder
  real Telegram gate prompts and reminders.
- All servers started during these sessions were stopped afterward.

## Bug-report DB status

8 reports marked `fixed` via `updateBugReportStatus`: `f7db3cf5`, `2e3b0078`, `155a6e4f`, `3c926202`,
`05325e3a`, `ff01766a` (PR #33, already merged) plus `1a6510b5`, `6fc6b6d6` (PR #36). **Caveat**: the
last two are marked `fixed` in the dev DB *now*, but the actual fix only takes effect once PR #36
merges — DB status is currently ahead of what's live. `5ffdd70c` is left `open`, pending the founder's
own check. The 7 founder test/verification rows are also left `open`.

## Needs founder

1. ~~Review/merge PR #33~~ — **done, merged to `main` 2026-09-27**.
2. Review/merge PR #36.
3. Live-click Retry/Cancel on `e162acec` or `cdc65ae4` from the app now that PR #33 has merged.
4. Once PR #36 merges and OTA lands: verify the New Brief unlinked-channel hint and the "Can't reach the
   server" screen on a real device.
5. Clarify which screen `5ffdd70c`'s keyboard-overlap report actually meant (not the Queue screen, which
   has no textarea). **Founder is checking personally.**
6. The 7 test/verification `bug_reports` rows can be marked closed/resolved directly in the DB or once
   Task 7's triage endpoint exists.
7. Optional: two pre-existing lint errors on `main` (`lib/channel-context.tsx`,
   `lib/use-video-source.ts`), unrelated to this work — no action needed unless picked up separately.

## Links & References
- `docs/execution/bugs/STATUS.md` — Task 8's row, and the branch-name collision/drift warnings
- `docs/execution/bugs/HOTFIXER_AGENT_PROTOCOL.md` — the stop-and-ask rule this pass correctly followed
  for `auth.tsx` (PR #33), later answered by the founder go-ahead that unblocked R6 (PR #36)
- `docs/execution/bugs/Sprint3/tasks/task7.md` — the unrelated, unstarted task whose "Task 7" identifier this
  branch accidentally collided with
