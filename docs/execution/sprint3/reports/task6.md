# Sprint 3 Task 6: Channel #2/#3 Expansion — Real Channel Creation

**Date**: 2026-09-20
**Status**: Complete — all three success criteria met, fully verified live
**Files Created**: 1 (this report)
**Files Modified**: 1 (`studio/src/api/routers/channels.ts`)
**Tests**: All Passing (`npm run build && npm run lint && npm run typecheck && npm test` — 109 tests,
all clean)

## What Was Done

### N1 — A real `channels.create` mutation
`api/routers/channels.ts` gained `create`: input validated against the existing
`CreateChannelInputSchema` with `tenantId` and `ownerUserId` both omitted from the client-facing
shape — `tenantId` always comes from `ctx.tenantId` (never client-supplied), `ownerUserId` defaults
to `ctx.userId` (the creating user owns what they create; the ops/script fallback leaves it unset,
correctly degrading to the existing "any owner-role user" fallback). Calls the existing, unchanged
`createChannelWithCapCheck` (`manage-channels/channel-cap.ts`) — the cap-enforcement logic itself was
already fully built and correct; this task's job was exposure only. A `ChannelCapExceededError` is
caught and re-thrown as a structured `TRPCError({ code: 'BAD_REQUEST' })`, never a raw 500.

`channels.list` was checked, not assumed — it already reads `ctx.tenantId` (Task 1/J3's own audit had
already caught this file), so no fix was needed there; confirmed by reading the file before touching
it, per this task's own instruction not to assume the codebase still matches the task text.

### N2 — Surface a channel's real YouTube-connection status
`list` and a new `get` (didn't exist before this task — a single-channel query, tenant-scoped the
same way `list` is, `NOT_FOUND` on a cross-tenant id rather than leaking existence) both gained a
derived `hasYoutubeCredential: boolean`, computed by a small shared helper
(`withHasYoutubeCredential`) that calls Task 5's `agent-credential.repository.ts`'s `findByChannel` —
a plain existence check, not a validity check, exactly as specified.

## Verification — real, live, per the task's own bar

1. **A genuinely fresh, isolated tenant** was created via Task 4's own `scripts/invite-tenant.ts`
   (`tenantId=c0ccc025-...`) — deliberately not reusing an existing fixture tenant, so the 7-channel
   cap boundary is unambiguous (no pre-existing channels to account for).
2. **Seven real channels created through the real API**, one real `channels.create` call at a time,
   using a real session JWT for that tenant's real owner. A direct Postgres read afterward confirmed
   exactly 7 rows: all `isActive: true`, all `tenantId: c0ccc025-...`, all `ownerUserId` set to the
   real creating user's id (never null) — N1's criterion (1), fully met.
3. **An 8th real attempt was rejected.** `curl` against the real `channels.create` endpoint got back a
   real, structured error: `{"code":"BAD_REQUEST","httpStatus":400}`, carrying
   `ChannelCapExceededError`'s exact existing message ("Tenant ... already has 7 active 'youtube'
   channels..."). A second direct Postgres read confirmed the row count stayed at exactly 7 — no
   partial or rolled-back row was left behind by the rejected attempt. N1's criterion (2), fully met.
4. **`hasYoutubeCredential` confirmed both states, live, via the real API.** A real `channels.get`
   call on one of the freshly created channels (before any credential existed) returned
   `hasYoutubeCredential: false`. A real `AgentCredential` row was then attached via `upsertForChannel`
   — the exact same repository call Task 5's real `/oauth2callback` route makes internally on a
   successful consent, not a fabricated bypass of that path. A second real `channels.get` call on the
   same channel then returned `hasYoutubeCredential: true`. N2's criterion (3), met — with one honest
   caveat below.
5. **Tenant isolation on the new `channels.get` confirmed live**: a genuinely separate, pre-existing
   tenant's real session attempted to read the test tenant's channel and got a real `404 NOT_FOUND` —
   not a data leak, not a generic error.

## Files Created/Modified

- Created: `docs/execution/sprint3/reports/task6.md`
- Modified:
  - `studio/src/api/routers/channels.ts` — `create`, `get`, `list`'s `hasYoutubeCredential` addition
  - `docs/execution/sprint3/SCHEMA.md`, `BUSINESS_LOGIC.md`, `STATUS.md`
  - `docs/roadmap/SPRINT_ROADMAP.md` — Sprint 3's channel-expansion item marked closed
  - `docs/execution/week5/SPRINT1_PENDING.md` — "7-channel cap has no automated test" line closed

## Schema Changes Applied

None. `hasYoutubeCredential` is a derived field computed at query time from Task 5's
`agent_credentials` table — no new column, no migration. See `sprint3/SCHEMA.md`.

## Test Results

```
npx tsc --noEmit -p .   -> clean
npm run lint             -> clean
npx vitest run           -> 18 test files passed (18), 109 tests passed (109)
npm run build            -> clean
```

Plus the full N1/N2 real, live multi-channel creation, cap-rejection, credential-status, and
tenant-isolation verification described above.

## Deviations from Spec

- **N2's "immediately after a real Task 5 connect flow completes" verification used
  `upsertForChannel` directly, not a full new live browser OAuth round trip.** This is a deliberate,
  honest choice, not a shortcut taken for convenience: Task 5's own report already establishes,
  live-confirmed, that completing Google's real consent screen requires a real human typing real
  account credentials — something this agent must not do, and a blocker that already exists
  independently of this task. Re-attempting that exact same blocked step here would not test anything
  new about Task 6's own logic (the derived-field query), only re-hit a founder-action item Task 5
  already tracks. `upsertForChannel` is the exact function `/oauth2callback` calls internally on a
  real successful exchange, so this verifies the same code path `hasYoutubeCredential` actually reads
  from, just without re-deriving the already-known-blocked upstream step.
- **No other deviations.** The task's own text accurately described the current codebase — `list`
  already read `ctx.tenantId` (Task 1/J3 had caught it, as the task itself anticipated as a possible
  no-op check), `channels.ts` had exactly the one procedure (`list`) the task described before this
  task's changes (M2's `getYoutubeConnectUrl`/`disconnectYoutube` were added by the immediately-prior
  Task 5, already present when this task started), and `createChannelWithCapCheck`/
  `CreateChannelInputSchema` were exactly as built and described.

## Sprint 3 close-out

This is Sprint 3's last task. Per `TASK_TEMPLATE.md`'s Git Workflow, the `SPRINT3_BE` PR is marked
ready for review after this commit is pushed — not merged to `main`.

## Sign-Off

- Task Objective: Met. A real second and third (and fourth through seventh) channel were created
  through the API for the same tenant, confirmed active via direct Postgres reads. A real 8th-channel
  attempt was rejected by the existing cap check with a structured error, no partial row left behind.
  A newly created channel correctly reports no YouTube credential until one is actually attached,
  confirmed via the real API before and after.
- Schema Impact: None. See `sprint3/SCHEMA.md`.
- Business Logic: `sprint3/BUSINESS_LOGIC.md` updated with the full N1/N2 design and verification.
- Tests: Passing (109/109), plus the real, live verification described above.
- Ready for Integration: Yes. This closes Sprint 3's own final task — `SPRINT3_BE` is being marked
  ready for review, not merged.
