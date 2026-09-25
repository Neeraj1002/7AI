# Sprint 3 Hardening: Run Creation-Time Tenant Ownership Check

**Date**: 2026-09-22
**Status**: Complete
**Branch**: `SPRINT3_BE` — confirmed still open and unmerged (`git log origin/main` doesn't include it;
`gh pr view 11` reports `state: OPEN`, `mergedAt: null`) before starting, per the task's own
instruction to check rather than assume. This is a direct hardening follow-on to Task 2 (K1), not new
sprint scope, so it lands on the same branch.
**Files Modified**: 1 (`studio/src/api/routers/runs.ts`)
**Tests**: All Passing (`npm run build && npm run lint && npm run typecheck && npm test` — 104 tests,
all clean)

## What Was Done

`runs.create` (`api/routers/runs.ts`) checked that the target `channelId` exists (`findChannelById`)
but never checked that channel actually belongs to the caller's own tenant — the one real,
live-demonstrated gap `KNOWN_ISSUES_AND_BLOCKERS.md` §3 has tracked since Task 1's own J3
verification (which deliberately used a second tenant's channel to prove `ctx.tenantId` threading
works, and found nothing stopped that same session from passing a *different* tenant's `channelId`).

Fix: immediately after the existing not-found check, a new check —

```ts
if (channel.tenantId !== ctx.tenantId) {
  throw new TRPCError({
    code: 'FORBIDDEN',
    message: `You are not allowed to create a run against channel ${input.channelId}`,
  });
}
```

— reusing `assertGateOwnership`'s exact `FORBIDDEN` code and message style (the same file already
defines it, a few lines up, for gate resolution) rather than inventing a second authorization-error
shape for the same class of check. No schema change — every piece of data this check needs
(`channel.tenantId`, `ctx.tenantId`) already existed. The stale comment directly above (explicitly
noting this gap as "remains open, tracked in KNOWN_ISSUES_AND_BLOCKERS.md §3") was removed and
replaced with a comment noting the invariant now holds.

## Verification — real, live, per the task's own bar

Reused two already-seeded tenants from earlier Sprint 3 testing rather than creating a fresh one —
both still present and valid in the dev DB: `00000000-0000-0000-0000-000000000001` (the founder's own
tenant, channel `5c6312d5-...`, "Dry-run test channel") and `93150449-6273-489b-922f-e40b6992776f`
("Second Test Tenant," seeded during Task 1's own J3 verification, channel `3462b504-...`, "Second
Tenant Channel," owner user `second-test-user@example.com`).

To avoid disturbing another session's own running dev-server process already bound to port 4000 in
this shared working directory, verification ran against a separate, isolated instance of the exact
same code (`API_PORT=4055 npx tsx src/index.ts`, same repo checkout, same uncommitted fix already in
the working tree), stopped immediately after.

1. **Real cross-tenant attempt, rejected.** A real session token for the second tenant's real owner
   user called `runs.create` against the first tenant's real `channelId`. Response: a real, structured
   `403 FORBIDDEN` — `"You are not allowed to create a run against channel 5c6312d5-..."` — not a
   generic error. A direct Postgres read (`SELECT * FROM pipeline_runs WHERE "briefText" LIKE '%Sprint
   3 Hardening%'`) confirmed **zero** rows exist for this attempt.
2. **Regression check — same tenant, own channel.** The same second tenant's session called
   `runs.create` against its own real channel (`3462b504-...`) — succeeded normally, returned a real
   `PipelineRun` with `tenantId` correctly matching the second tenant, not the first.
3. **Regression check — the first tenant, unaffected.** A real session token for the first tenant's
   own user (the founder) called `runs.create` against its own real channel (`5c6312d5-...`) —
   succeeded normally, returned a real `PipelineRun` with the correct `tenantId`/`channelId`.

## Files Created/Modified

- Created: `docs/execution/sprint3/reports/hardening-tenant-check.md`
- Modified:
  - `studio/src/api/routers/runs.ts` — the tenant-ownership check itself
  - `docs/execution/KNOWN_ISSUES_AND_BLOCKERS.md` §3 — moved from "still open" to closed
  - `docs/execution/sprint3/STATUS.md` — a dated addendum, not a new numbered task row
  - `docs/execution/sprint3/BUSINESS_LOGIC.md` — Task 2 (K1)'s "not fixed this task" note updated to
    point at this fix

## Schema Changes Applied

None. Pure authorization check against data (`Channel.tenantId`, `ctx.tenantId`) that already existed.

## Test Results

```
npx tsc --noEmit -p .   -> clean
npm run lint             -> clean
npx vitest run           -> 17 test files passed (17), 104 tests passed (104)
npm run build            -> clean
```

Plus the real, live cross-tenant + regression verification described above.

## Deviations from Spec

None. The fix is exactly as scoped — a single authorization check reusing an existing convention, no
schema change, no new control flow.

## Sign-Off

- Task Objective: Met. A real second tenant's session attempting `runs.create` against a real first
  tenant's channel gets a real, structured `403 FORBIDDEN`; a direct Postgres read confirms no
  `PipelineRun` row was created. Same-tenant creation (both tenants, both directions) is unaffected.
- Schema Impact: None.
- Business Logic: `sprint3/BUSINESS_LOGIC.md` updated in place next to Task 2 (K1)'s own ownership-check
  documentation, not as a new section.
- Tests: Passing (104/104), plus the real, live verification above.
- Ready for Integration: Yes.
