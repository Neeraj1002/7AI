# Sprint 3 Business Logic Delta

**Status**: Task 1 introduces no new `PipelineRun`/`PipelineStage` states or transitions — it adds a
new identity/session layer in front of the existing API. Every existing transition (`pending →
running`, gate resolution, etc.) is reached exactly as before, just authenticated by a real session
instead of one shared token.

## Task 1 — User model, tenant signup & session auth (J1-J3)

### What this task implements

**J1 — the Tenant↔User relationship.** A `Tenant` is one account; a `User` belongs to exactly one
`Tenant` (FK, not a join table). Two roles only: `owner` (everything) and `approver` (view + approve
gates). See `sprint3/SCHEMA.md` for the full rationale and the founder's seeded row.

**J2 — magic-link session auth**, a new module (`studio/src/auth/`):
- `jwt.ts` — the only file touching `jsonwebtoken` directly (same provider-boundary pattern every
  external-integration `client.ts` in this codebase already holds). Two distinct JWT shapes sharing
  one signing key (`JWT_SECRET`) but never interchangeable, guarded by a `purpose` claim
  (`'magic-link'` vs. `'session'`): a magic-link token (15 min TTL) and a session token (30 days —
  not spec'd exactly by the task; a real tradeoff given no DB-backed session/revocation exists, judged
  reasonable for a ~10-tester internal tool where re-login just means another magic link).
- `magic-link.ts` — `requestMagicLink`/`verifyMagicLink`, the actual login flow. No self-serve account
  creation (a tenant needs a seeded `AgentQuota` — Sprint 3 Task 3/L — and who gets a shared-cost
  account is the founder's call during a ~10-tester phase). No transactional-email provider exists
  yet, so the real, working link is logged to the server console (always) and additionally relayed via
  the existing `founderChannel.notify()` (today's one real Telegram sink — genuinely useful for the
  founder's own login; a real, visible notification for any other user too, not a silent drop, until
  Task 2/K's per-user Telegram linking exists).
- `request-identity.ts` — `resolveRequestIdentity(authorizationHeader)`, the single classifier shared
  by `api/server.ts`'s `onRequest` hook (the early 401 gate) and `api/trpc.ts`'s `createContext` (what
  `ctx.tenantId`/`userId`/`role` actually resolve to), so the two can never drift out of sync by
  re-implementing the same bearer-token parsing twice. Classifies a request into exactly one of:
  a real session, the `API_AUTH_TOKEN` ops/script fallback, or unauthenticated.

`api/trpc.ts` gained a real `Context` type and `createContext` — replacing the "no session table,
nothing per-request to attach to a context" posture this file's own comment used to describe.
`api/server.ts`'s `onRequest` hook now verifies a real session or the ops-token fallback (previously:
one shared token, full stop). Two new plain Fastify routes, `POST /auth/request-link` and
`GET /auth/verify`, exempt from the hook (they're what issues/verifies a session — a request here
can't already carry one).

**J3 — threading `ctx.tenantId` through every hardcoded `MVP_TENANT_ID` read.** A full grep audit of
`api/routers/` and `run-pipeline/` found the hardcoded reads weren't only at the two call sites the
task text named (`runs.ts`'s `create`, `channels.ts`'s `list`) — `models/repositories/dashboard.repository.ts`'s
four functions (`getOperationalDashboard`/`getCostDashboard`/`getContentPerformanceDashboard`/`getQualityDashboard`)
also hardcoded `MVP_TENANT_ID` internally, reached via `api/routers/dashboard.ts`'s `publicProcedure`s
— squarely inside this task's "every `publicProcedure` currently reading `MVP_TENANT_ID`" scope even
though the hardcoded read lived one layer down from the router itself. All now take a real `tenantId`
parameter from `ctx.tenantId`. `run-pipeline/founder-digest.ts`'s own `MVP_TENANT_ID` use was audited
and deliberately **not** changed — it's a periodic background job, not a request handler; there is no
`ctx` for it to read, and it correctly represents "the one tenant this background job currently
serves" until Sprint 3's later multi-tenant work (if any) revisits it.

`MVP_TENANT_ID` stays exported (`scripts/dry-run.ts`, seed scripts, and single-tenant fixtures
legitimately still want a known constant) but is no longer read by any authenticated request path.

### Preconditions
A `User` row must exist for anyone attempting `POST /auth/request-link` (no self-serve signup this
task). `JWT_SECRET` must be set for `/auth/request-link`/`/auth/verify` to function at all — both
return a clear `503` if it's unset, rather than signing with a guessable secret; the API server itself
still starts fine on `API_AUTH_TOKEN` alone.

### Postconditions
A successfully verified magic link always produces a session carrying a real, existing `userId` and
`tenantId` — the session JWT is signed server-side from a real DB-verified `User` row at issuance
(`verifyMagicLink`), never from client-supplied data. Every `publicProcedure` this task touched now
resolves `ctx.tenantId` to the real signed-in session's tenant (or the founder's seeded tenant, via
the ops-token fallback) — verified live against a genuinely separate second tenant, not just the
founder's own (where the values would coincidentally match `MVP_TENANT_ID` even if the code still
silently hardcoded it).

### Failure Modes & Handling
An unrecognized email at `request-link` returns the exact same generic response as a recognized one
(`"If that email has an account, a login link was sent."`) — no user-enumeration leak — but performs
no real DB write or notification beyond a server-side log line. An expired or already-used
`login_tokens` row is rejected at `verify` with a clear, specific error (`"already been used"` /
`"has expired"`), not a generic 401 — a real user should understand what happened, not assume their
account is broken. `createContext` defensively throws `TRPCError('UNAUTHORIZED')` if
`resolveRequestIdentity` somehow returns `'unauthenticated'` (not the expected production path — the
Fastify hook already rejects such a request with a 401 before it reaches tRPC — but `ctx.tenantId`
must never silently resolve to a real tenant for an unauthenticated caller even if that ordering were
ever violated).

### A real, live gap found and deliberately not closed this task
`runs.create` validates the target `channelId` exists but does not check that the channel actually
belongs to the caller's own tenant — J2's own scope note explicitly defers this ("gate ownership...
Task 2/K's job, not this task's"). Live verification (see the report) deliberately exploited this to
prove `ctx.tenantId` threading works at all: a second tenant's session created a run against that same
tenant's own channel, and the run's `tenantId` matched the session, not `MVP_TENANT_ID` — but nothing
today would have stopped that same session from passing a *different* tenant's `channelId`. Tracked as
a real, open gap in `KNOWN_ISSUES_AND_BLOCKERS.md`, explicitly scoped to Sprint 3 Task 2/K (gate/channel
ownership), not fixed here.

### Reference
`docs/decisions/LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md` — the `FounderChannel` interface J2's
magic-link delivery reuses rather than building new transport. `week5/BUSINESS_LOGIC.md`'s Publishing
section and Sprint 2 Task 4/5/6's own isolated-external-call patterns — the provider-boundary
convention `auth/jwt.ts` follows for `jsonwebtoken`.

## Task 2 — Gate ownership (K1)

### What this task implements
A new authorization check, `assertGateOwnership` (`api/routers/runs.ts`), runs in front of the
existing `gate1`/`gate2 → resolvePendingApproval` call — the gate-resolution transition itself is
completely unchanged; only who is allowed to trigger it changes. The actual allow/deny decision is a
separate, deliberately pure function, `canResolveGate` (`run-pipeline/gate-ownership.ts`):
`ctx.tenantId === channel.tenantId && (ctx.userId === channel.ownerUserId || ctx.role === 'owner')`.

No new `PipelineRun`/`PipelineStage` states. A rejected attempt throws before
`resolvePendingApproval` is ever called — the gate remains genuinely, unambiguously pending
afterward, confirmed live (see the report) rather than assumed from the code alone.

### Preconditions
A `PipelineRun`'s `channel` row exists with a resolvable `ownerUserId` (or `null`, handled per the
fail-closed design below) and the resolving request carries a valid session (Task 1, J2).

### Postconditions
A gate is never resolved by a request that fails the ownership check. Today's "`resolved: false` on
conflict" contract (already-resolved gate) is preserved unchanged, now joined by a distinct
`FORBIDDEN` TRPCError for the not-your-gate case — a real caller needs to tell these two failure
modes apart (my own permissions vs. someone else already acted), so they're deliberately different
error codes, not collapsed into one generic rejection.

### Failure Modes & Handling
A malformed or missing `ownerUserId` on an old/orphaned row degrades to "the tenant's `owner`-role
users may still resolve it," never to "anyone may resolve it" and never to "permanently stuck" —
verified live with a real ownerless channel: a same-tenant `approver`-role user was correctly
rejected, and a same-tenant `owner`-role user still succeeded. `assertGateOwnership` looks up the
run's channel itself (via `run.channelId`, not any client-supplied value) before evaluating
ownership, so there's no way to spoof which channel a gate belongs to by lying about it in the
request.

### A real, live-demonstrated finding, not fixed this task
`runs.create` still does not check that a submitted `channelId` belongs to the caller's own tenant —
K1's own scope is gate resolution, not run/channel creation. This is a distinct gap from what K1
closes (K1 stops a wrong-tenant user from *approving* a gate; it does nothing about a wrong-tenant
user *creating* a run against someone else's channel in the first place). Still open, tracked in
`KNOWN_ISSUES_AND_BLOCKERS.md` §3 — not silently conflated with the gap K1 actually closes.

### Reference
`sprint2/BUSINESS_LOGIC.md`'s Task 6 section — `resolvePendingApproval`'s existing "whichever caller
arrives first wins, synchronous check-and-delete" design is unchanged by this task; this task only
adds a check *before* that call, never touches its internals. `run-pipeline/budget-gate.ts`'s
`computeChannelBudgetCeilings` — the existing precedent for a pure, DB-free authorization/allocation
function this task's own `canResolveGate` follows.

## Task 3 — Per-user notification routing (K2)

### What this task implements
A real second `FounderChannel` implementation (`InAppFounderChannel`), and a real composition layer
(`composeFounderChannel`) that dispatches to a resolved set of recipients' in-app channel (always)
and Telegram channel (only if linked). `notify-founder/pending-approvals.ts` is extracted out of
`telegram-channel.ts` so both implementations — and any number of recipients — share the exact same
in-memory pending-approval map: `getOrCreatePendingApproval` is idempotent per `threadKey`, so the
first channel/recipient to register creates the shared promise and every subsequent one reuses it —
"first reply wins" falls out of that sharing for free, not a new race-handling design. Every
`FounderChannel.resolvePendingApproval` implementation delegates to this one shared function, which
now also marks every `Notification` row for that `threadKey` resolved, regardless of which channel
actually closed the gate.

No new `PipelineRun` states. `requestApproval`'s existing "block until the pending map resolves"
mechanism now has more than one possible resolver-registrant for the same `threadKey` (in-app and,
optionally, Telegram) — first reply wins, exactly as `resolvePendingApproval`'s own doc comment
already specified; this task is what finally gives that comment a real second caller to be about.

### Recipient resolution
`resolveNotificationRecipients(channel)` mirrors Task 2 (K1)'s own fail-closed design, applied to
notification delivery rather than resolution permission: a channel with a real `ownerUserId`
notifies exactly that user; a channel with none notifies every `owner`-role user on the tenant — the
same set `canResolveGate` already lets resolve it, so nobody who *can* approve a gate is ever left
with no notification telling them it's open. `founder-digest.ts`'s own tenant-wide loop (unchanged
this task) now sends to every `owner`-role user on the tenant individually, not the single
pre-Sprint-3 global `founderChannel`.

### Preconditions
A `Channel` has a resolvable `ownerUserId` (Task 2) or degrades to the tenant-wide `owner`-role
fallback. A `User` may or may not have `telegramChatId` set — both are valid, handled states.

### Postconditions
Every gate that opens produces at least one real, visible notification (in-app, always) — a gate is
never left silently waiting with no visible trace anywhere a user would look. A `Notification` row's
`resolvedAt` is set the moment its underlying gate resolves, via *any* channel — verified live both
ways (an in-app-only resolution via the real API, and a real Telegram-reply resolution).

### Failure Modes & Handling
A Telegram send failure (bot blocked, unlinked/stale chat id) must not prevent the in-app
`Notification` row from existing — `MultiFounderChannel` dispatches to every channel via
`Promise.allSettled`, logging a rejection rather than throwing it back at the caller; the in-app path
alone is always sufficient to resolve a gate. `pending-approvals.ts`'s own
`markNotificationsResolvedByThreadKey` call is itself fire-and-forget (logged, not thrown) — a DB
write failing here must never unwind an already-synchronously-resolved gate.

### A real, live-found bug, fixed within this task
An early version of the `/link <code>` handler wrapped its *entire* body (DB writes + the success
reply) in one try/catch, with the catch block's own error reply also unguarded. Real, live testing
(simulating `/link` from a synthetic chat id the bot genuinely cannot message) found this crashed the
whole handler: the real DB write (marking the code used, setting `telegramChatId`) had already
succeeded, but the confirmation reply's own failure — a real Telegram `400 chat not found` — was
uncaught, and the catch block's own fallback reply hit the identical failure, propagating
unhandled. In a real running server, grammy's own `bot.catch()` masks this from crashing the whole
process, but the user would never learn their real, successful link actually worked. Fixed with a
`safeReply` helper (catches and logs, never throws) used for every reply in the message handler, not
just `/link`'s — re-verified afterward with a clean run (DB write confirmed, no crash, no unhandled
error). See `sprint3/reports/task3.md`.

### A real, live-found privacy fix (not this task's own subject, but enabled by it)
`auth/magic-link.ts` previously relayed *every* user's login link to the founder's own Telegram — the
only sink that existed before this task. That meant the founder could see, and use, another real
user's login link. Now that per-user Telegram linking exists, a requesting user's own link is sent to
*their own* linked chat if they have one, never the founder's, unless the requester genuinely is the
founder.

### Reference
`sprint2/BUSINESS_LOGIC.md`'s Task 6 section — `founder-digest.ts`'s existing per-tenant iteration
pattern, extended here to per-user within a tenant. Sprint 2 Task 6's `parsePostHocTagCommand` —
the exact command-precedence pattern (`/link` checked first, unconditionally) `parseLinkCommand`
follows.
