# Frontend Track Status: Mobile App (API Layer, App Scaffold, Dashboard)

**Track status**: All three initial tasks (API layer, app scaffold, dashboard) complete. Sprint 3
frontend work — all three tasks (real sign-in, Channels screen, in-app notifications/push/post-hoc
tagging) — is now also complete; `SPRINT3_FE` is marked ready for review (existing PR, not merged),
one real founder-action item carried forward (Frontend Task 3/FE11's on-device push verification —
see that section below). Task specs and reports for the Sprint 3 work live under
`docs/execution/sprint3/` (`tasks/frontend-taskN.md`, `reports/frontend-taskN.md`), this file stays
the ongoing cross-sprint summary per the frontend track's own "not sprint-numbered" convention.
**Last updated**: 2026-09-21 (Sprint 3 Frontend Task 3 — Sprint 3 frontend track closed).

| Task | Name | Status | Owner | Notes |
|---|---|---|---|---|
| 1 | API Layer (tRPC + Fastify, Auth, Gate Resolution, Run Creation) | Done | Claude Code | Gate 2 endpoint implemented but not independently proven end-to-end this session (video-generation stub kept tripping the 60s Shorts-length check before reaching Gate 2) — see `reports/task1.md` Deviation 7. |
| 2 | App Scaffold + Core Screens | Done | Claude Code | Real E2E proof (New Brief → Gate 1 approve → Postgres-confirmed advance) done via `expo start --web` in the Browser tool, not a real Expo Go simulator/device (none available in this environment) — see `reports/task2.md` Deviation 1. Gate 2/video playback UI implemented and type-checked but not live-proven, same underlying reason as Task 1. |
| 3 | Dashboard Screen | Done | Claude Code | All four groups verified against real data and cross-checked directly against Postgres (all four matched exactly). Discovered and fixed a real gap along the way: Task 1's dashboard endpoints weren't channel-scoped — added an optional `channelId` to all four. Same simulator/screenshot environment constraints as Task 2 — see `reports/task3.md` Deviations. |

## Sprint 3 (branch `SPRINT3_FE`, task specs/reports under `docs/execution/sprint3/`)

| Task | Name | Status | Owner | Notes |
|---|---|---|---|---|
| Frontend 1 | Real Sign-In (Magic Link) | Done | Claude Code | Real, magic-link session auth replaces the old shared-token login screen. Real E2E: manual-paste sign-in, deep-link sign-in (`sevenai://verify` / web `/verify`), replay rejection, expiry rejection, sign-out — all live, all cross-checked against Postgres. Two real findings: (1) the task spec's "`/auth/*` exposed as a tRPC procedure" claim is inaccurate — they're plain REST routes; (2) `SPRINT3_FE` (branched from `main`) has no Sprint 3 backend code at all (`SPRINT2_BE`/`SPRINT3_BE` are separate, unmerged branches), so real testing needed a throwaway worktree pinned to the backend track's own commits. See `docs/execution/sprint3/reports/frontend-task1.md`. |
| Frontend 2 | Channels Screen — Create, View, Connect YouTube | Done | Claude Code | **`SPRINT3_FE` merged `origin/SPRINT3_BE` between tasks** — the classifier block from Task 1 was a one-off; retried successfully, `app/`'s tRPC types now resolve against the real backend directly, no more throwaway worktree needed. Real channel creation and the real 7-channel cap boundary (8th attempt rejected with the real error, Postgres-confirmed the count held at 7). Real OAuth connect-URL generation confirmed reaching Google's actual consent screen; `hasYoutubeCredential` flipping true/false confirmed via the app's own UI, using the same `upsertForChannel` technique backend Task 6 already established (completing a real Google login is out of scope for this agent, same limit backend Task 5 already hit). Found a real, pre-existing environment gap: the OAuth `redirect_uri` points at port 3000, but the callback route only exists on port 4000 — not a bug in this task. See `docs/execution/sprint3/reports/frontend-task2.md`. |
| Frontend 3 | In-App Notifications + Real Push Registration + Post-Hoc Tagging | Done — one real founder-action item remains | Claude Code / **Founder** (on-device push verification) | Sprint 3 frontend's last task. Real Notifications screen (FE10) with gate resolution reusing Run Detail's own `GateActionBar` — a real `paused_gate1` notification resolved from this screen, Postgres-confirmed advance. Real post-hoc tagging (FE12) — a new tag submitted through the app produced a real `ReviewLog` row, Postgres-confirmed, coexisting with (not replacing) a pre-existing tag. Found the spec's "tag picker constrained to a real tag vocabulary" claim inaccurate — the real backend (`post-hoc-tag.ts`) enforces no vocabulary; replaced with quick-pick suggestion chips over free text, not an invented restriction. Real push registration (FE11') wired into sign-in — verified up to the physical-device boundary: the web-platform skip guard fired live on a real sign-in, and the server endpoint itself was independently proven with a real session token and a real (test) push-token round trip through Postgres. **Real on-device push delivery could not be verified** — no physical device in this environment, the same limit backend Task 7/O1's own send-side proof already hit. See `docs/execution/sprint3/reports/frontend-task3.md`. |

## Founder action needed
The three initial tasks (API layer, app scaffold, dashboard) need no founder action to be considered
done — all deviations there are environment constraints (no simulator/device in this dev environment),
not missing credentials or blocked decisions. **Recommended founder follow-up, not blocking**: a real
device/simulator pass through Expo Go to close Task 2/3's one open gap (Gate 2 resolution + video
playback have never been exercised live, only Gate 1's identical mechanism has) — see `reports/task1.md`
Deviation 7 and `reports/task2.md` Deviation 3.

**Sprint 3 frontend Task 3 carries one real, blocking-for-full-proof founder action**: real on-device
push notification delivery (Frontend Task 3/FE11') needs verification against a real physical device —
simulators don't deliver real push, and this is the task's own required success bar, not an
optional nice-to-have. Every piece of the path up to that boundary (permission request, token
registration, the server endpoint, the web-platform skip guard, and the tap-to-deep-link handler) is
implemented and proven for real. See `docs/execution/sprint3/reports/frontend-task3.md`.

## Merge history

**2026-09-10 — merged `origin/main` (`WEEK4_BE` merged, PR #5) into `FRONTEND_FE`.** `WEEK4_BE` had already merged to `main` by the time this happened; `FRONTEND_FE` and `main` had diverged from the same base (the Week 3 merge, `4c6b4c4`). A real `git merge` (not a rebase — this branch was already pushed with an open PR, and rebasing would have required a force-push, which is never authorized on this track) resolved three genuine content conflicts, all the same shape — both tracks independently appended new content at the same insertion point in a shared file:

- `studio/src/config/env.ts` — both sides added new env-schema fields (this track: `API_AUTH_TOKEN`, `API_PORT`; Week 4: `PEXELS_API_KEY`, `STOCK_FOOTAGE_STUB`, `YOUTUBE_*`, `ANALYTICS_POLL_INTERVAL_MS`, `PUBLISHING_TEST_KILL_DELAY_MS`). No semantic overlap — kept both blocks.
- `studio/src/index.ts` — both sides added a new boot-sequence call right before the final "orchestrator ready" log line (this track: `await startApiServer()`; Week 4: `startPerformanceAnalyticsPoller()`, a new `setInterval`-based poller). No semantic overlap — kept both; verified post-merge that the orchestrator boots with both subsystems live (`[boot] Performance Analytics poller started...` and `[api] listening on port 4000...` both appear in the same boot log).
- `studio/src/types/index.ts` — both sides appended one new `export *` line at the end of the file (this track's `dashboard.types`, Week 4's `performance-snapshot.types`). Kept both.

One more file both tracks touched (`studio/src/models/repositories/pipeline-stage.repository.ts`) merged automatically with no conflict — the two additions (`listStagesForRun` here, `recordStageProgress` from Week 4) landed far enough apart in the file. `package.json`/`package-lock.json` and `schema.prisma` did **not** conflict at all: Week 4 added no new npm dependencies, and this track has never touched `schema.prisma` (Task 1 deliberately reads Week 4's `performance_snapshots` table via raw SQL rather than adding a Prisma model, specifically to avoid this kind of collision — see `reports/task1.md` Deviation 5). Prisma's migration state was already in sync with the shared dev database (`prisma migrate status` reported "up to date") — no migration action was needed.

Post-merge, everything this track had already proven was re-verified and still passes: `npm run build`/`lint`/`typecheck` clean in both `studio/` and `app/`; the double-resolution race test (`scripts/test-double-resolution-race.ts`) still PASSes against the real DB and Telegram bot; a fresh brief submitted via `POST /runs` still reaches and resolves Gate 1 through the API with the advance confirmed directly in Postgres; all four `/dashboard/*` endpoints still return real data, cross-checked against a direct Postgres query (`totalSpendUsd` matched exactly: `$0.9345` both ways). One new, unrelated observation surfaced during re-verification, not a merge regression: Week 4 rewrote `video-generation`'s agent to use a real Pexels stock-footage call instead of a plain background, so a run now fails at `video_generation` with `Pexels API call failed: 401 Unauthorized` in this environment (no `PEXELS_API_KEY` configured) — this happens *after* Gate 1 correctly resolves and advances the run, so it doesn't affect anything this track owns; noting it here so it isn't mistaken for merge fallout later.

## Full detail
Per-task reports: `reports/task1.md`, `reports/task2.md`, `reports/task3.md`. Full narrative: `reports/frontend-summary.md` (not yet written — optional given the per-task reports already cover the full track).

## Working-directory note

This track's work happens in a separate git worktree, `../7AI-frontend` (branch `FRONTEND_FE`), not the original `D:\Study Material\7AI` checkout — the concurrent Week 4 backend session shares that same physical directory and briefly collided with this session's branch switch early in Task 1 (no work was lost; both sessions' in-progress changes were protected via `git stash` before the worktree was created). Both worktrees share the same `.git` history, so this doesn't affect branches, commits, or the eventual PR — only where the files live on disk during development. `docs/execution/frontend/` is duplicated (untracked task specs) in both directories for convenience; the tracked, canonical copy is whatever's committed on `FRONTEND_FE`.
