# Sprint 3 Task 2: Gate Ownership

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.**

**Objective**: Now that a real signed-in user exists (Task 1), decide and enforce who is actually
allowed to resolve a given channel's Gate 1/Gate 2 — today any authenticated caller can resolve any
tenant's gate, which was harmless when "authenticated" meant "holds the one shared token" but stops
being harmless the moment real per-user sessions exist.
**Duration**: 3-4 hours
**Depends On**: Task 1 (User model + session auth) — hard dependency, this task has nothing to check
ownership against without it.
**Owning Component**: Shared Schema, API layer (`api/routers/runs.ts`), Orchestrator.
**Success Criteria**: (1) A channel has a real, persisted owner. (2) A real gate-resolution attempt
from a session belonging to a different tenant's user is rejected. (3) The channel's own owner (or
any `owner`-role user on the same tenant) resolves it exactly as before — no regression for the
founder's existing single-user flow.

## Task Requirement

`MVP_PART2_MULTI_USER_AND_FLEXIBLE_CREATION.md` Section 1: "Right now 'the founder' approves every
gate for the one channel that exists. Multi-user needs an explicit answer to 'who can approve gates
for this channel'... currently there's no concept of ownership to check at all." Task 1 makes
"a real signed-in user" exist; this task is what actually restricts a gate resolution to the right
one.

### K1 — A real `ownerUserId` on `Channel`
**Where**: `api/routers/runs.ts`'s `gate1`/`gate2` mutations call
`founderChannel.resolvePendingApproval(input.runId, replyText)` directly — no check at all on who
`ctx.userId` is relative to the run's channel, confirmed by reading the full mutation bodies (no
`ctx` read anywhere in the file today, since Task 1 is what first gives `ctx` real content).

**Schema**: `Channel.ownerUserId String? @db.Uuid` (nullable FK to `User` — nullable so a channel
created before this migration, or a channel whose owning user was since removed, degrades to "tenant
owner may resolve" rather than becoming permanently unapprovable; see Fix below). No backfill
needed as a hard requirement, but this task's own migration should set every existing `Channel` row's
`ownerUserId` to its tenant's seeded `owner` user (Task 1's J1 seed) — never leave a real, currently-
working channel with a null owner it didn't have to have.

**Fix**: `manage-channels/channel-cap.ts`'s `createChannelWithCapCheck` (and `channels.ts`'s future
`create` mutation, Task 6/O) sets `ownerUserId` to the creating user by default at channel-creation
time. `runs.ts`'s `gate1`/`gate2` mutations, before calling `resolvePendingApproval`, load the run's
`channel` (already fetched via `findChannelById` elsewhere in this file — reuse that, don't add a
second query) and check: `ctx.tenantId === channel.tenantId && (ctx.userId === channel.ownerUserId ||
ctx.role === 'owner')`. Fail closed — a `null` `ownerUserId` is **not** treated as "anyone may
resolve it"; it falls through to the `ctx.role === 'owner'` check only, same as a channel with a real
owner would for a different tenant's `owner`-role user (which is still correctly rejected by the
`tenantId` check first). Reject with `TRPCError({ code: 'FORBIDDEN' })` on failure — a clear,
specific error, not the existing `CONFLICT` (which today means "already resolved," a genuinely
different failure mode a real caller needs to tell apart from "you're not allowed to").

**Verify**: (1) a real gate opened for Tenant A's channel, resolved via a real session belonging to
a Tenant B user → rejected `FORBIDDEN`. (2) The same gate resolved via the channel's real
`ownerUserId`'s session → succeeds exactly as today. (3) The same gate resolved via a different
`owner`-role user on Tenant A (not the channel's specific `ownerUserId`) → succeeds (the "owner role
can do everything" half of Task 1's two-role decision). (4) The founder's own existing single-user
flow (their seeded `owner` user resolving their own seeded channel's gates) is unaffected — the
regression check that matters most, since this is the only real flow that's actually been exercised
against production data so far.

## Schema Impact

### Tables Modified
- `channels` — new `ownerUserId` column (nullable FK to `users`), backfilled to each tenant's seeded
  owner for every existing row.

### Migration File
A real Prisma migration; state the backfill explicitly in the report (this is one of the few Sprint
3 migrations that isn't purely additive-and-untouched for existing rows).

## Business Logic / State Transition

### What this task implements
No new `PipelineRun`/`PipelineStage` states. A new authorization check in front of the existing
`gate1`/`gate2 → resolvePendingApproval` call — the gate-resolution transition itself is unchanged;
only who is allowed to trigger it changes.

### Preconditions
A `PipelineRun`'s `channel` row exists with a resolvable `ownerUserId` (or `null`, handled per Fix
above) and the resolving request carries a valid session (Task 1).

### Postconditions
A gate is never resolved by a request that fails the ownership check — the existing
`resolvePendingApproval` call (and therefore the pipeline's own state transition) is never reached
for an unauthorized caller; today's "resolved: false on conflict" contract is preserved for the
already-resolved case, now joined by a distinct `FORBIDDEN` case for the not-your-gate case.

### Failure Modes & Handling
A malformed or missing `ownerUserId` on an old row degrades to "the tenant's `owner`-role users may
still resolve it" rather than becoming permanently stuck — no channel this migration touches should
become unapprovable by anyone as a side effect of adding this check.

### Reference
`sprint2/BUSINESS_LOGIC.md`'s Task 6 section — `resolvePendingApproval`'s existing "whichever caller
arrives first wins, synchronous check-and-delete" design is unchanged by this task; this task only
adds a check *before* that call, never touches its internals.

## Testing
```bash
npm run build && npm run lint && npm run typecheck && npm test
```
Plus K1's four real-session scenarios above.

## Documentation reconciliation
- `docs/execution/sprint3/SCHEMA.md`, `BUSINESS_LOGIC.md`, `STATUS.md`.
- `docs/design_doc/MVP_PART2_MULTI_USER_AND_FLEXIBLE_CREATION.md`: note the gate-ownership item as
  picked up by this task.

## Report Template
`execution/sprint3/reports/task2.md`, standard shape.
