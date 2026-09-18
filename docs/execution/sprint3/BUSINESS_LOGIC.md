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
