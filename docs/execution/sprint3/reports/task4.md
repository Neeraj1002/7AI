# Sprint 3 Task 4: Per-Tenant Budget Provisioning + YouTube Quota Headroom Check

**Date**: 2026-09-19
**Status**: Complete — L2 leaves one real, quick founder verification item (not a blocking request)
**Files Created**: 2 (`studio/scripts/invite-tenant.ts`, plus this report)
**Files Modified**: 3
**Tests**: All Passing (`npm run build && npm run lint && npm run typecheck && npm test` — 105 tests,
all clean)

## L2 status — read this first

**No quota increase requested, and none is warranted by the real numbers.** The task's own text
assumed a real upload costs "roughly 1,600 units" against the shared daily pool. Live research
against Google's own current developer documentation (fetched directly, not summarized secondhand)
found this is stale: `videos.insert` dropped to ~100 units on 2025-12-04, then moved into its **own
dedicated 100-calls/day bucket** — entirely separate from the shared pool — on 2026-06-01. At a
realistic ~10-tester cadence, uploads are a non-issue either way. The real, non-obvious cost driver is
Performance Analytics' own polling design (see below), not uploads.

**What could not be checked live**: this project's *actual* Google Cloud Console quota
ceiling/usage. That page requires the founder's own Google login — confirmed live (via the Browser
tool) that no authenticated session exists in this environment; navigating to the Console redirected
straight to `accounts.google.com`. Entering credentials on the founder's behalf is out of scope
regardless. This report's estimate uses the documented *default* allocation; a real, quick founder
check (2 minutes, no increase request implied) confirms whether this project's real numbers match.
Tracked in `KNOWN_ISSUES_AND_BLOCKERS.md` §1.

## What Was Done

### L1 — Auto-seed `AgentQuota` for every new tenant

`agent-quota.repository.ts` gained `insertAgentQuota` (the real gap: only `findAgentQuota` existed
before — confirmed by reading the file in full, matching the task's own claim). `tenant.repository.ts`
gained `insertTenant`; `user.repository.ts`'s existing `insertUser` gained an optional
`client: DbClient` parameter so it can participate in a transaction. A new
`scripts/invite-tenant.ts` (mirroring `scripts/set-channel-default-voice.ts`'s shape) creates a real
`Tenant` + owning `User`(`role: 'owner'`) + `AgentQuota` in one `prisma.$transaction` — a `Tenant`
is never left without a budget row.

**Default ceiling: $2.00/day**, stated plainly per the task's own instruction. Reuses the exact
figure Week 2 Task 4 picked for the founder's own original `AgentQuota` row (itself never explicitly
confirmed) rather than inventing a new number — consistency over a fresh guess, but **this still
needs real founder confirmation**, same as the original did.

### L2 — Real YouTube API quota headroom check

Confirmed this project's real endpoint usage by grep (not assumed): `videos.insert` (Publishing,
upload), `thumbnails.set` (Publishing, Sprint 2 Task 5), `videos.list` (Performance Analytics stats
polling, `youtube-stats-client.ts`). Fetched Google's own current documentation
(`developers.google.com/youtube/v3/determine_quota_cost`) directly for real, current per-operation
costs — not estimated from memory or a secondary source.

**Real current default allocation** (confirmed via direct fetch of Google's own page): 100
`videos.insert` calls/day (own dedicated bucket, 1 unit/call) + 100 `search.list` calls/day (own
dedicated bucket, unused by this project) + 10,000 units/day shared across every other endpoint.
`thumbnails.set` costs ~50 units (shared pool, confirmed via a direct fetch of its own docs page).
`videos.list` costs 1 unit (shared pool).

**Real estimate at ~10 testers, 1-2 uploads/day/tester**: uploads (10-20/day) sit trivially inside
the dedicated 100/day bucket. Thumbnails (10-20/day × ~50 units) cost 500-1,000 units/day from the
shared pool. Stats polling is the real driver worth naming: `runPeriodicPoll` polls **every**
completed run with a published video on every tick (default every 6h = 4 ticks/day) — the cumulative
total, not just today's new uploads. At ~300 accumulated videos (roughly 3-4 weeks at the above
cadence), that's already ~1,200 units/day, growing without bound as more videos accumulate. Combined
near-term estimate: ~1,500-2,200 units/day against the 10,000/day shared ceiling — comfortable
headroom today. The real medium-term risk is the unbounded polling design, not upload volume.

## Verification — real, live, per the task's own bar

1. **A real new tenant, created through the real invite script, has a real `AgentQuota` row
   immediately.** `npx tsx scripts/invite-tenant.ts "Real Test Tenant..." task4-verification@example.com
   "Task 4 Test Owner"` created `tenantId=5f6a6eb9-...`. A direct Postgres read confirmed a real
   `AgentQuota` row: `{"tenantId":"5f6a6eb9-...","platform":"youtube","budgetCeilingUsd":"2", ...}`.
2. **A first real brief submission from that tenant succeeds past the budget gate.** A real channel
   was created for the new tenant; its real owner logged in via the actual magic-link flow (real
   `POST /auth/request-link`, real `GET /auth/verify`); a real `runs.create` API call submitted a
   real brief. A direct Postgres read confirmed the run reached `script_generation: completed` (the
   real budget-gate check, and a real LLM call — not a stub) rather than throwing
   `NoBudgetConfiguredError` or being skipped for insufficient budget. The run continued naturally to
   a genuine pending `gate1`, resolved by that same tenant's real owner via a real API call —
   incidentally re-confirming Task 2 (gate ownership) and Task 3 (notification routing) both work
   correctly for a third, fully independent real tenant, not just the two used in their own reports.
3. **The real quota-cost model claim was verified against Google's own current documentation, fetched
   directly**, not assumed or taken from a secondary summary — see the two `WebFetch` calls against
   `developers.google.com/youtube/v3/determine_quota_cost` and `.../thumbnails/set` cited above.
4. **The "founder-only" blocker was confirmed live, not assumed.** Navigating to
   `console.cloud.google.com/apis/api/youtube.googleapis.com/quotas` in this environment's browser
   redirected to `accounts.google.com` with no authenticated session — a real, observed fact, not an
   assumption that Console access would be unavailable.

## Files Created/Modified

- Created:
  - `studio/scripts/invite-tenant.ts`
  - `docs/execution/sprint3/reports/task4.md`
- Modified:
  - `studio/src/models/repositories/agent-quota.repository.ts` — `insertAgentQuota`
  - `studio/src/models/repositories/tenant.repository.ts` — `insertTenant`
  - `studio/src/models/repositories/user.repository.ts` — `insertUser` gained `client: DbClient`
  - `docs/design_doc/MVP_PART2_MULTI_USER_AND_FLEXIBLE_CREATION.md` — §0's two items closed
  - `docs/execution/KNOWN_ISSUES_AND_BLOCKERS.md` — L2 verification item (§1), two design findings (§4)

## Schema Changes Applied

None. `AgentQuota`'s shape is unchanged — this task only adds a missing write path. See
`sprint3/SCHEMA.md`.

## Test Results

```
npm run build       -> clean
npm run lint         -> clean
npm run typecheck    -> clean
npm test             -> 17 test files passed (17), 105 tests passed (105)
```

Plus the real, live tenant-creation-through-budget-gate verification and the real, primary-source
quota-cost research described above.

## Deviations from Spec

- **No quota-increase request was filed** — the task's own text explicitly allows this outcome
  ("this task is explicitly allowed to conclude 'headroom is fine, no request needed'"), and the real
  numbers (once corrected for the stale cost assumption) support it.
- **This project's actual Cloud Console quota numbers could not be checked live** — genuinely
  founder-blocked (their own Google login), not skipped for convenience; confirmed live via the
  Browser tool rather than assumed. Tracked as a real, quick verification item in
  `KNOWN_ISSUES_AND_BLOCKERS.md` §1, distinct from a blocking request.
- **A real, unexpected finding reshaped L2's actual conclusion**: the task's own assumed cost model
  (~1,600 units/upload) is stale by a real API change in the last year — this significantly lowers
  the real near-term risk from what the task text anticipated, while surfacing a different, real
  medium-term risk (Performance Analytics' unbounded polling) the task text didn't anticipate at all.
  Documented plainly rather than silently reported against the outdated assumption.

## Sign-Off

- Task Objective: Met. A real new tenant has a real `AgentQuota` row immediately, confirmed by direct
  Postgres read. A first real brief submission from that tenant succeeds past the budget gate. The
  real, current YouTube Data API quota structure is stated plainly, with the real per-operation costs
  cited from Google's own current documentation and a real estimate computed — no increase request
  filed, since the real numbers don't call for one, with the one genuinely founder-blocked
  verification step tracked explicitly, not silently skipped.
- Schema Impact: None. See `sprint3/SCHEMA.md`.
- Business Logic: `sprint3/BUSINESS_LOGIC.md` updated with the transactional seeding design and the
  full L2 investigation, including the stale-assumption correction and the unbounded-polling finding.
- Tests: Passing (105/105), plus real live tenant-creation-through-pipeline verification.
- Ready for Integration: Yes. One real, quick founder verification item (Cloud Console quota check),
  not a blocker — tracked plainly, not silently left for someone else to rediscover.
