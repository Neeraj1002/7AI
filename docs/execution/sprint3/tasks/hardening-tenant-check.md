# Sprint 3 Hardening: Run Creation-Time Tenant Ownership Check

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** Branch: continue on
`SPRINT3_BE` if that branch is still open/unmerged (check `git log`/`git status` first, don't assume)
— this is a direct hardening follow-on to Task 2 (K1), not new sprint scope, so it belongs on the same
branch if that branch still exists. If `SPRINT3_BE` has already been merged to `main` by the time this
starts, open a small standalone branch off `main` instead and say so in the report.

**Objective**: close the one real, live-demonstrated, still-open gap
`KNOWN_ISSUES_AND_BLOCKERS.md` §3 flags: `runs.create` checks that a target `channelId` *exists*
(`findChannelById`) but never checks that channel actually belongs to the caller's own tenant. A
signed-in user's session can today create a real run against *any* tenant's channel if they know its
id. Task 2 (K1) already closed the matching gap on gate *resolution* (`assertGateOwnership`) — this
closes the equivalent gap on gate/run *creation*, explicitly deferred at the time as a distinct,
separate check. Flagged as "worth closing before real multi-tenant testers exist" — with Sprint 3
closed and ~10 real testers imminent, this is that moment.
**Duration**: 1-2 hours — a single authorization check plus real, live verification, not a feature.
**Depends On**: Sprint 3 Task 1 (`ctx.tenantId` threading) and Task 2 (`assertGateOwnership`'s error
shape/pattern — reuse it directly, don't invent a second authorization convention for the same class
of check).
**Owning Component**: `api/routers/runs.ts`'s `create` mutation.
**Success Criteria**: a real, second tenant's session attempting `runs.create` against a real first
tenant's `channelId` gets a real, structured `403 FORBIDDEN` — not a generic error, not a silently
accepted run — and a direct Postgres read confirms no `PipelineRun` row was created for that attempt.
A real same-tenant `runs.create` (the regression check) still succeeds exactly as before.

## Task Requirement

**Where**: `runs.create` (`api/routers/runs.ts`) calls `findChannelById(input.channelId)` and only
checks the result is non-null before proceeding — confirmed live during both Task 1/J3's and Task
2/K1's own verification, which deliberately used a second tenant's channel to prove `ctx.tenantId`
threading works, and found nothing stops that same session from passing a *different* tenant's real
`channelId`.

**Fix**: immediately after the existing not-found check, add
`if (channel.tenantId !== ctx.tenantId) throw new TRPCError({ code: 'FORBIDDEN', message: ... })` —
reuse `assertGateOwnership`'s exact error shape/message convention (same `FORBIDDEN` code, same style
of message) rather than a new one, so a client sees one consistent authorization-error shape across
every tenant-boundary check in this API, not two slightly different ones. No schema change — every
piece of data this check needs (`channel.tenantId`, `ctx.tenantId`) already exists; this is a pure
authorization gap, not a data-modeling one.

**Verify**: real, live, the same bar every Sprint 3 task used — not a unit test standing in for it.
(1) A genuinely separate second tenant/user (reuse `scripts/invite-tenant.ts` from Task 4, or an
already-seeded second tenant if one still exists in the dev DB from earlier testing) attempts a real
`runs.create` against the first tenant's real `channelId` → real `403 FORBIDDEN`, confirmed both via
the API response and a direct Postgres read showing no new `PipelineRun` row exists for that attempt.
(2) The same second tenant's `runs.create` against its *own* real channel still succeeds normally —
the regression check, since this is a one-line change touching a hot path every run creation goes
through. (3) A real same-tenant call from the first tenant against its own channel is unaffected.

## Schema Impact
None — this is a pure authorization check against data that already exists on `Channel`.

## Business Logic / State Transition
None new — mirrors Task 2 (K1)'s existing `canResolveGate`/`assertGateOwnership` design, applied one
step earlier in the run's lifecycle (creation, not resolution).

## Testing
```bash
npm run build && npm run lint && npm run typecheck && npm test
```
Plus the real, live cross-tenant verification above.

## Documentation reconciliation
- `docs/execution/KNOWN_ISSUES_AND_BLOCKERS.md` §3: move this item's "Still open" line to closed,
  citing this task's report.
- `docs/execution/sprint3/STATUS.md`: a short addendum noting this hardening fix landed after Sprint
  3's own close-out — not a new numbered task (Sprint 3's own 1-7 numbering is done; reopening a third
  time for a one-line authorization check would overstate its size), just a dated note pointing at the
  report.
- `docs/execution/sprint3/BUSINESS_LOGIC.md`: a one-line addition next to Task 2/K1's existing
  ownership-check documentation, noting the creation-time check now exists alongside the
  resolution-time one.

## Report Template
`docs/execution/sprint3/reports/hardening-tenant-check.md`, standard shape — short, matching the
size of the actual change. State plainly which branch this landed on (per the Branch note above) and
whether a genuinely separate second tenant was reused from earlier testing or created fresh for this
verification.
