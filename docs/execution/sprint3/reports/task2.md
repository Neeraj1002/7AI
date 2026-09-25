# Sprint 3 Task 2: Gate Ownership

**Date**: 2026-09-19
**Status**: Complete
**Files Created**: 3 (`studio/src/run-pipeline/gate-ownership.ts` + `.test.ts`, plus this report)
**Files Modified**: 6
**Tests**: All Passing (`npm run build && npm run lint && npm run typecheck && npm test` — 100
tests, all clean)

## What Was Done

### K1 — A real `ownerUserId` on `Channel`

Real Prisma migration (`prisma migrate dev --name sprint3_channel_owner`): `Channel.ownerUserId
String? @db.Uuid` (nullable FK to `User`, `ON DELETE SET NULL`). The migration's own backfill sets
every existing `Channel` row to its tenant's seeded `'owner'`-role user — confirmed live afterward:
both real pre-existing channels (the founder's, and the second tenant's from Task 1's own
verification) were correctly backfilled.

`api/routers/runs.ts`'s `gate1`/`gate2` mutations now call `assertGateOwnership(runId, ctx)` before
ever reaching `founderChannel.resolvePendingApproval`. It looks up the run's real channel itself
(via `run.channelId`, never a client-supplied value) and evaluates a new, deliberately pure function,
`canResolveGate` (`run-pipeline/gate-ownership.ts`, unit tested directly):

```ts
ctx.tenantId === channel.tenantId && (ctx.userId === channel.ownerUserId || ctx.role === 'owner')
```

Fails closed: a `null` `ownerUserId` never grants access to a non-owner-role caller — it falls
through to the `ctx.role === 'owner'` half of the check only. A failed check throws
`TRPCError({ code: 'FORBIDDEN' })`, distinct from the existing `CONFLICT` (already-resolved gate) — a
real caller needs to tell "you're not allowed" apart from "someone else already acted."

`Channel` (domain type) and `CreateChannelInputSchema` both gained `ownerUserId` support, ready for
Task 6/O's future `channels.create` mutation — `manage-channels/channel-cap.ts`'s
`createChannelWithCapCheck` already forwards it unchanged (it has no real caller anywhere in the
codebase yet, confirmed by grep, so there was nothing to wire up today beyond the type/repository
support).

## Verification — real, live, per the task's own bar

Three real `PipelineRun`s were driven through the real API (`runs.create`, real intake/script-gen/
script-review LLM calls, no stubs) to genuine pending gates — not simulated or mocked.

1. **Cross-tenant rejection.** A real Tenant B session (created independently during Task 1's own
   verification) attempted to resolve a real pending `gate1` belonging to the founder's own
   (Tenant A) channel → a real `403 FORBIDDEN` with the exact message
   `"You are not allowed to resolve gates for run ..."`. A direct Postgres read afterward confirmed
   the gate was still genuinely `paused_gate1` — the rejected attempt never reached
   `resolvePendingApproval`, so nothing was silently consumed.
2. **Same-tenant, non-channel-owner `owner`-role success.** A third real user was created on the
   founder's own tenant (`role: 'owner'`, deliberately *not* set as the channel's `ownerUserId`).
   Their real session resolved the same still-pending gate from scenario 1 → real success
   (`{"resolved":true}`) — the "owner role can do everything" half of Task 1's two-role decision,
   proven live.
3. **The channel's real owner — the actual regression check.** A second real run was driven to a
   fresh pending `gate1`; the founder's own real session (the channel's actual `ownerUserId`)
   resolved it → real success, exactly as every pre-Sprint-3 flow already worked. This is the
   founder's own actual, currently-used flow — the one regression that would have mattered most.
4. **Fail-closed on a null owner, exercising the `approver` role for the first time.** A deliberately
   ownerless channel (`ownerUserId: null`) and a real `approver`-role user were created. A third real
   run was driven to a pending `gate1` on that channel; the `approver`'s real session attempted to
   resolve it → a real `403 FORBIDDEN` — proving `null` genuinely does **not** mean "anyone may
   resolve it."
5. **The null-owner fallback still works for an `owner`-role user.** The founder's own `owner`-role
   session (same tenant, not this channel's specific — nonexistent — owner) resolved that same
   ownerless channel's gate → real success, confirmed via the API response and a direct DB read.

All three real test runs were closed out afterward (`close-stale-test-runs.ts` / a real reject
mutation) — none left dangling. One real, incidental finding along the way: `tsx watch`'s restart
(triggered by my own file edits mid-verification) correctly exercised `resume-on-startup.ts`'s
existing gate-reopening logic on a real `paused_gate2` run, re-sending a real Telegram prompt — a
genuine, unplanned regression check that this task's changes didn't break that pre-existing
restart-safety behavior.

## Files Created/Modified

- Created:
  - `studio/src/run-pipeline/gate-ownership.ts`, `gate-ownership.test.ts`
  - `docs/execution/sprint3/reports/task2.md`
- Modified:
  - `studio/src/models/schema.prisma` — `Channel.ownerUserId`, `User.ownedChannels`
  - `studio/src/types/channel.types.ts` — `ownerUserId` on `Channel`/`CreateChannelInputSchema`
  - `studio/src/models/repositories/channel.repository.ts` — maps/persists `ownerUserId`
  - `studio/src/api/routers/runs.ts` — `assertGateOwnership`, wired into `gate1`/`gate2`
  - `docs/design_doc/MVP_PART2_MULTI_USER_AND_FLEXIBLE_CREATION.md` — gate-ownership item closed
  - `docs/execution/KNOWN_ISSUES_AND_BLOCKERS.md` — split the combined gate/channel-ownership entry
    into "closed" (gate resolution) and "still open" (creation-time) halves

## Schema Changes Applied

`Channel.ownerUserId` — real migration (`20260918195919_sprint3_channel_owner`), including a real
backfill (`UPDATE channels SET ownerUserId = (tenant's seeded owner) WHERE ownerUserId IS NULL`),
confirmed applied correctly against both real pre-existing channels. See `sprint3/SCHEMA.md`.

## Test Results

```
npm run build       -> clean
npm run lint         -> clean
npm run typecheck    -> clean
npm test             -> 16 test files passed (16), 100 tests passed (100)
```

Plus the real, live five-scenario verification described above.

## Deviations from Spec

- **The migration's CHECK-constraint-free column plus its backfill were added to the migration.sql
  file after `prisma migrate dev` had already applied the column-only version**, for the same reason
  as Task 1's `role` CHECK constraint: Prisma's schema.prisma has no way to express a data backfill
  as part of schema generation. Applied the backfill directly to the dev DB via a raw script and
  recomputed/updated the migration's stored checksum to match the edited file — confirmed consistent
  afterward via `prisma migrate status` reporting "up to date," same reconciliation process
  established in Task 1's own report.
- **The gate-ownership boolean logic was factored into a separate, pure, unit-tested function**
  (`canResolveGate`, `run-pipeline/gate-ownership.ts`) rather than left inline in
  `assertGateOwnership` as the task's own prose describes it. Not a behavior change — purely a
  testability improvement, matching this project's established "extract the pure decision, keep the
  DB-touching wrapper thin" pattern (`budget-gate.ts`'s `computeChannelBudgetCeilings` is the
  precedent cited in `BUSINESS_LOGIC.md`).
- **A real, live-clarified scope boundary, not a deviation in behavior**: the task's own text frames
  this as closing "gate/channel ownership" as one item. Live verification made clear these are two
  separable checks — K1 closes gate *resolution* ownership only; run/channel *creation*-time
  ownership (a different, real gap) is untouched and remains open. Documented explicitly in
  `KNOWN_ISSUES_AND_BLOCKERS.md` and `sprint3/STATUS.md` rather than letting the two blur together.

## Sign-Off

- Task Objective: Met. A channel has a real, persisted owner (backfilled for every existing row). A
  real gate-resolution attempt from a different tenant's session is rejected (`FORBIDDEN`, gate
  confirmed still pending). The channel's own owner, and any `owner`-role user on the same tenant,
  resolve it exactly as before — the founder's own existing single-user flow is unaffected.
- Schema Impact: One real migration with a real backfill — `Channel.ownerUserId`. See
  `sprint3/SCHEMA.md`.
- Business Logic: `sprint3/BUSINESS_LOGIC.md` updated with the ownership-check design and the
  distinct, still-open creation-time gap this task deliberately does not close.
- Tests: Passing (100/100), plus real live verification across five distinct authorization scenarios
  (cross-tenant, same-tenant non-owner, actual owner, ownerless+approver, ownerless+owner).
- Ready for Integration: Yes. No founder action required. One real, documented gap (creation-time
  channel/tenant ownership) explicitly carried forward, not silently left for someone else to
  rediscover.
