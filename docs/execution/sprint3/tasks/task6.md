# Sprint 3 Task 6: Channel #2/#3 Expansion — Real Channel Creation

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.**

**Objective**: Expose real channel creation through the API for the first time (today it's
`list`-only), wire a newly created channel into Task 5's OAuth connect flow so it's actually usable
rather than silently broken until someone remembers to connect it, and finally exercise the
already-built 7-channel cap against real app-created channels instead of just a unit test.
**Duration**: 4-6 hours
**Depends On**: Task 1 (session/tenant), Task 2 (channel ownership defaults), Task 5 (a channel needs
somewhere to send a user to connect YouTube). Natural last task of the sprint.
**Owning Component**: API layer (`api/routers/channels.ts`), `manage-channels/`.
**Success Criteria**: (1) A real second and third channel are created through the API for the same
tenant, confirmed active in the database. (2) A real attempt at an 8th channel on one
(tenant, platform) is rejected by the existing cap check. (3) A newly created channel correctly
reports it has no connected YouTube credential until Task 5's real connect flow completes for it.

## Task Requirement

`SPRINT_ROADMAP.md`: "Channel #2/#3 expansion (deferred from Sprint 1)... naturally lands here too,
since multi-channel becomes the default shape." Unlike most of this sprint, the hard part here is
already built — `manage-channels/channel-cap.ts`'s `createChannelWithCapCheck` already enforces the
real 7-channel-per-(tenant, platform) cap (`AGENT_FLEET_DESIGN.md` §6.2.1: "a permanent product rule,
not a scope limit"), confirmed by reading it in full. What's missing is simply that nothing calls it
through the app.

### N1 — A real `channels.create` mutation
**Where**: `api/routers/channels.ts` has exactly one procedure, `list` — confirmed by reading the
whole file (12 lines). `insertChannel`/`createChannelWithCapCheck` and `CreateChannelInputSchema`
(`types/channel.types.ts`) already exist, fully built and already unit-tested (Sprint 1's pending-
items doc flagged only "no automated test [against real DB fixtures]," not "doesn't exist") — this
task's own job is exposure and real-user wiring, not rebuilding the cap logic.

**Fix**: `channels.create` — input validated against the existing `CreateChannelInputSchema` minus
`tenantId` (never client-supplied; taken from `ctx.tenantId`, Task 1 — the same "never trust a
client-supplied tenant id" posture this sprint's auth work establishes everywhere else), calling
`createChannelWithCapCheck`. On success, sets `ownerUserId` (Task 2) to `ctx.userId` by default — the
creating user owns what they create, matching Task 2's own "owner at creation time" note. `list`
is updated to read `ctx.tenantId` instead of the hardcoded `MVP_TENANT_ID` it uses today (Task 1's J3
should have already caught this file in its audit; if J3 landed first, this is a no-op check, not a
duplicate fix — confirm rather than assume).

**Verify**: (1) a real second and third channel created through the API for the same tenant,
confirmed active via a direct DB read (`isActive: true`, correct `tenantId`, correct `ownerUserId`).
(2) A real attempt at creating an 8th active channel on the same (tenant, platform) is rejected with
the existing `ChannelCapExceededError` — surfaced as a structured `TRPCError` (`BAD_REQUEST` or a
more specific code), not a raw 500. This is the real, live exercise Sprint 1's pending-items doc
flagged as missing ("7-channel cap has no automated test... needs real DB fixtures") — closing it
for real, not just adding another unit test of the pure function.

### N2 — Surface a channel's real YouTube-connection status
**Where**: nothing today distinguishes "a channel exists" from "a channel is actually usable" — a
freshly created channel (this task) has no `AgentCredential` row (Task 5) and would fail at its
first real publish attempt with no earlier warning anywhere in the app.

**Fix**: `channels.list`/`channels.get` (add `get` if it doesn't exist as a single-channel query yet
— check `channels.ts` before assuming) gain a derived `hasYoutubeCredential: boolean`, computed from
whether Task 5's `agent-credential.repository.ts` has a row for that channel — a plain existence
check, not a validity check (a revoked-but-still-present token is Task 5's failure-handling concern,
not this task's). This is backend scope only — the actual "connect your channel" UI prompt is the
frontend track's job once this field exists to build against, noted here so that track isn't blocked
guessing at a shape.

**Verify**: a real newly created channel (N1) reports `hasYoutubeCredential: false` immediately after
creation; the same channel reports `true` immediately after a real Task 5 connect flow completes for
it — a direct, observable before/after against the real API response, not just the underlying DB
row.

## Schema Impact

None. `hasYoutubeCredential` is a derived field, computed at query time from Task 5's
`agent_credentials` table — no new column, no migration.

## Business Logic / State Transition

### What this task implements
No new `PipelineRun` states. This task's only real behavioral addition is exposing an existing,
already-correct authorization/validation path (`createChannelWithCapCheck`) through the API for the
first time — the cap-enforcement logic itself is unchanged.

### Preconditions
A real session (Task 1) with a real `tenantId`, submitting a valid `CreateChannelInputSchema` body.

### Postconditions
A successfully created channel always has `ownerUserId` set (Task 2's default, never left null for a
channel created through this new path) and always correctly reports its real credential status
(N2) — never a channel that silently looks "ready" when it isn't.

### Failure Modes & Handling
An 8th-channel attempt fails at `createChannelWithCapCheck` before any row is inserted — no partial
channel row is ever left behind by a rejected creation attempt (the existing function already
guarantees this by checking count before inserting; this task doesn't change that guarantee, just
exercises it for the first time against a real API caller).

### Reference
`week5/BUSINESS_LOGIC.md` Section 3 — the 7-channel cap's original enforcement design, unchanged by
this task. `sprint3/BUSINESS_LOGIC.md`'s Task 2 (K1) and Task 5 (M1-M3) sections — `ownerUserId`
default and `AgentCredential` existence, both directly consumed here.

## Testing
```bash
npm run build && npm run lint && npm run typecheck && npm test
```
Plus N1/N2's real multi-channel creation and cap-rejection verification above.

## Documentation reconciliation
- `docs/execution/sprint3/SCHEMA.md`, `BUSINESS_LOGIC.md`, `STATUS.md` — this task should also be
  where `sprint3/STATUS.md` gets its final row, closing out the sprint per `SPRINT_ROADMAP.md`.
- `docs/roadmap/SPRINT_ROADMAP.md`: mark Sprint 3's channel-expansion item closed.
- `docs/execution/week5/SPRINT1_PENDING.md`: close the "7-channel cap has no automated test" line
  under Sprint 1's tech-debt section — this task is what finally exercises it for real.

## Report Template
`execution/sprint3/reports/task6.md`, standard shape. If this is the sprint's last task, mark the
`SPRINT3_BE` PR ready for review per `TASK_TEMPLATE.md`'s Git Workflow — don't merge.
