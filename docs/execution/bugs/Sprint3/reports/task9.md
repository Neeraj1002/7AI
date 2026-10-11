# Bugs Task 9: Second Pipeline Bug-Fix Pass (Root-Caused the Data-Path Bug)

**Date**: 2026-09-27
**Status**: Code complete, PR open — **not yet merged**. R1/R2/R4 backend live/real-reproduction
verified; R3 (both items) typechecked/linted only, never clicked through.
**Branch**: `BUGS_TASK9` — cut from `main`, no naming collision this time. **`main` at this point does
not include PR #36** (Task 8's R5/R6 follow-up, still open) — PR #37 is independent of it, touches
different files, but both are open PRs stacked on `main` and need their own review/merge.
**PR**: [#37](https://github.com/Neeraj1002/7AI/pull/37), open, "merges cleanly, no CI checks ran."
**Dispatch**: ad hoc — six new reports found (four high-priority pipeline: `c13da242`, `178b6fdf`,
`18a5e2f5`, `dfcc3cfe`; one UI-docs-only, `7894d971`; one design-feedback, `7b8f1adc`, skipped per
founder instruction), prioritizing the four pipeline ones.

## Important environment finding — read before assuming a fix is live

Investigating why two founder-approved Gate 2 runs (`3e120e13`, `e162acec`) stayed stuck at
`paused_gate2`, the hot-fixer found that **the app's actual dev server is a long-running instance
started via VS Code's debugger (cwd = repo root, `D:\Study Material\7AI`), separate from the
short-lived servers a hot-fixer session starts in its own worktree to live-verify a fix.** Both write to
the same shared `sevenai_dev` DB, so a fix "live-verified" against a hot-fixer's own ad-hoc server is
**not automatically proven against the server the tester's app is actually talking to** — this is
exactly what caused R1 below (a bug that depends on server cwd, which differs between the two). Worth
keeping in mind for any future cwd/path-sensitive fix; API-logic fixes (R2-R4) aren't affected by this
distinction.
**Founder action, blocking**: once PR #37 merges, **the real server (VS Code-debugger) needs a
restart** — the one currently running is on old code. `3e120e13` and `e162acec` will stay stuck at Gate
2 until that restart; after it, R2's auto-reopen fix reopens Gate 2 on both automatically and they need
re-answering.

## Findings and fixes

**R1 — root-caused `2e3b0078` (video generation failing), first reported in Task 8.** Task 8's own R1
only captured and logged the error better; it didn't find the root cause. This pass found it: VS Code's
"Debug Studio" launch config starts the server with the repo root as cwd, not `studio/`, so `data/` and
`.env.local` resolve relative to the wrong directory — `7AI/data` instead of `studio/data`. The audio
beds only exist in `studio/data/`; from the wrong cwd every bed path is missing, ffmpeg fails silently,
retries 3×, and reports the exact "Stage attempt failed after 3 retries" signature Task 8 saw. **Fix**:
`data/` and `.env.local` now resolve relative to the studio package itself (a shared constant, accounting
for `config/` sitting two directory levels down in both `src/` and the mirrored `dist/` build output),
not cwd. **Verified**: typecheck/lint/all 108 tests pass. Live run verification was blocked twice — a
throwaway test-tenant run was skipped by the budget gate, and tenant `9190494a` had no old finished run
to retry — so verification fell back to a direct check: resolving every audio-bed path in the manifest
from a repo-root cwd. Old code: every path missing. New code: every path resolves correctly. Solid but
indirect — no live ffmpeg run was actually completed end-to-end under the new path logic.

**R2 — `178b6fdf` (cancelling `e162acec` returned Prisma P2028, run stuck at `paused_gate2`).**
Root cause: a gate decision (Approve/Reject/Cancel) is applied inside a short DB transaction; if
something delays it past Prisma's 5s default timeout, the write fails with P2028 — but the gate's
"waiting for a reply" state had already been consumed, so nothing is left listening. The run sits stuck
at the gate until a full server restart. Likely also explains the original `f7db3cf5` from Task 8's
first pass. **Fix**: (a) a gate now reopens itself automatically if its decision-save transaction fails,
so a fresh decision can be submitted without a restart; (b) the transaction timeout raised from 5s to
20s for headroom. **Verified by real reproduction**: held a row lock from a second DB connection on a
test-tenant run to force Gate 1's decision transaction into a genuine P2028 (using a local 5s-timeout
override to keep the repro fast) — confirmed the gate reopened and a second Approve succeeded normally.
The throwaway test run was set to `failed` afterward so nothing else picks it up.

**R3 — `dfcc3cfe` (Approve stayed clickable, second tap on `3e120e13`'s Gate 2 returned "not currently
pending") + `c13da242` (no YouTube-upload confirmation, no post-publish screen).** Same underlying
dynamic as R2: `3e120e13`'s Gate 2 approval was consumed server-side without its write landing, so the
button stayed live for a second, now-invalid tap. Separately, nothing on the Run screen ever showed a
run had actually published. **Fix**: gate buttons lock/hide once a decision is sent, replaced by a
"Decision sent" card with an "Answer again" option for if the flow stalls; Run screen adds a "Published
to YouTube" card (title, visibility, link) sourced from the publishing stage's stored `youtubeVideoId`/
`metadata`. **Not verified**: typecheck and lint only — no click-through, no real publish exercised.

**R4 — `18a5e2f5` (`cdc65ae4` hit the video-regen cap; Retry just re-reviewed the same video and hit the
cap again).** Root cause: Retry on a regen-capped run re-ran review on the already-capped video instead
of generating a new one. **Fix**: Retry on a regen-capped run now starts a genuinely new video-generation
attempt. **Verified live**: called the real `runs.retry` tRPC procedure in-process against a test-tenant
run sitting at the regen cap — correctly routed back to `video_generation` and started attempt #4 (the
attempt itself was then skipped by that test tenant's own budget ceiling, but the routing/step logic is
confirmed correct).

## Not fixed, by design or instruction

- **`7b8f1adc`** — design feedback, skipped per the founder's explicit earlier instruction.
- **`7894d971`** — raw system names (`stageName · attempt · status`) shown in the Run screen's "Details"
  disclosure. Checked against `docs/execution/ui-ux/tasks/task1.md` (item E3), which specifies this
  format intentionally, for debugging. Left unchanged — **working as designed, not a bug**.

## Also touched

- UUID columns don't support prefix matching in Postgres; the bug-report lookup-by-short-id switched to
  matching in JS instead. **Worth feeding into Task 7's design** (the real list/triage endpoint) — a
  future list endpoint filtering by partial ID will hit the same limitation.
- A TypeScript null-narrowing issue inside a hoisted function declaration (R2's gate-reopen logic) was
  fixed by redefining it as a `const` arrow function declared before the `try` block, which TypeScript
  narrows correctly.

## Bug-report DB status

The four new pipeline reports (`c13da242`, `178b6fdf`, `18a5e2f5`, `dfcc3cfe`) are marked `fixed` in the
dev DB. **Caveat, same as Task 8's R5/R6**: this is ahead of reality until PR #37 actually merges and the
real server (see the environment finding above) is restarted. `2e3b0078` was already `fixed` in the DB
from Task 8 — correctly left untouched, now genuinely root-caused rather than just better-logged.
Still `open`: `5ffdd70c` (founder's own check, unrelated to this pass), `7894d971`, `7b8f1adc`, and the
six test/verification rows from this batch.

## Needs founder

1. Review/merge PR #37 (independent of PR #36, which is still open from the prior round — both need
   their own review).
2. **Restart the real dev server** (the VS Code-debugger instance, not a hot-fixer's ad-hoc one) once
   PR #37 merges — `3e120e13` and `e162acec` are stuck at Gate 2 until then; after the restart, re-answer
   Gate 2 on both.
3. No action needed on `7b8f1adc` (your call, design feedback) or `7894d971` (by design per the UI/UX
   spec) — flagged here only for the record.

## Links & References
- `docs/execution/bugs/STATUS.md` — Task 9's row
- `docs/execution/bugs/Sprint3/reports/task8.md` — the earlier pass whose `2e3b0078` and `f7db3cf5` this one
  finally root-causes
- `docs/execution/ui-ux/tasks/task1.md` (item E3) — the spec confirming `7894d971` is by design
