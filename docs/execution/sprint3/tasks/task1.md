# Sprint 3 Task 1: User Model, Tenant Signup & Session Auth

Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.

**Objective**: Give 7AI a real `User` table and a decided User↔Tenant relationship, plus real
per-user session auth (magic-link email) replacing the single shared `API_AUTH_TOKEN` — the
foundation every other Sprint 3 task threads a real signed-in user/tenant through, instead of the
hardcoded `MVP_TENANT_ID` every request currently resolves against.
**Duration**: 6-9 hours
**Depends On**: Sprint 2 — closed. Nothing else; this is Sprint 3's first task, everything else in
the sprint depends on it.
**Owning Component**: Shared Schema, API layer (`api/server.ts`, `api/trpc.ts`, `api/routers/`).
**Success Criteria**: (1) A real `User` row exists, tied to a real `Tenant`, with a role. (2) A real
magic-link login produces a session a subsequent authenticated API call actually uses. (3) A run
created through the API with a real session is tied to that session's real tenant, confirmed by a
direct Postgres read — not the old hardcoded `MVP_TENANT_ID` value.

## Task Requirement

`MVP_PART2_MULTI_USER_AND_FLEXIBLE_CREATION.md` Section 1 names this as the biggest open gap: "no
`User` model exists at all... `Tenant` today stands in for 'the founder's one account,' not a real
many-user structure," plus "no real per-user auth... the API is `publicProcedure` today, gated only
by one blanket `API_AUTH_TOKEN`." Every other Sprint 3 task (gate ownership, per-user notification
routing, per-tenant budget seeding, per-channel OAuth, channel expansion) needs a real signed-in user
to attach to — this task is what makes "a real signed-in user" exist at all.

### J1 — `User` table + a concrete Tenant↔User relationship decision

**Where**: `models/schema.prisma` has no `User` model. `types/tenant.types.ts` exports
`MVP_TENANT_ID`, a hardcoded UUID constant, read directly by `api/routers/runs.ts`'s `create`
mutation and `api/routers/channels.ts`'s `list` query — confirmed by reading both files; `Tenant`
itself has no `users` relation, no concept of who belongs to it.

**Decision** (MVP_PART2 §1 leaves this open — made concrete here, not deferred further): a `Tenant`
is one account (an individual tester or a small team sharing one YouTube-adjacent operation, per the
design doc's own "the thing that's shared infrastructure stays centralized" framing). A `User`
belongs to exactly one `Tenant` — not a many-to-many join — since MVP_PART2 §0 frames each of the
~10 testers as bringing their own account, not joining someone else's; a many-tenant-per-user model
is real added complexity with no current requirement asking for it. Two roles only, not a full RBAC
system: `owner` (everything — approve gates, manage channels/credentials, invite) and `approver`
(view + approve gates, nothing else) — a minimal shape the design doc's own gate-ownership note
("probably just 'the channel's owner' to start") matches, extendable later if a real need for more
roles shows up.

**Schema**: `User` — `id` (UUID pk), `tenantId` (FK), `email` (unique, `VarChar(255)`), `name`
(nullable), `role` (`VarChar(20)`, `'owner' | 'approver'`, same "VarChar + CHECK, not native enum"
convention this schema already uses everywhere per `schema.prisma`'s own header comment),
`telegramChatId` (nullable — reserved for Sprint 3 Task 2/K's per-user Telegram linking, added here
so that task extends an existing table rather than adding a second migration for one column),
`createdAt`/`updatedAt`. `Tenant` gains `users User[]`. A real Prisma migration, no backfill for
`users` itself (new table) — but see Seeding below, which is not optional.

**Seeding**: this task's own migration must leave the founder's existing `MVP_TENANT_ID` row with a
real `User` (role `owner`, the founder's real email) in the same migration/seed step — otherwise Task
2 (J2, login) has no one to log in as, and every existing dry-run/dashboard flow silently loses its
implicit "owner." State the seeded email plainly in the report (same "don't pick a real value
silently" discipline Week 2 Task 4 used for `budgetCeilingUsd`).

### J2 — Real per-user auth: magic-link email session

**Where**: `api/server.ts`'s `onRequest` hook checks one shared bearer token
(`env.API_AUTH_TOKEN`) against every request, no per-user identity at all. `api/trpc.ts` builds
`initTRPC` with no context — its own comment states this directly ("no session table, nothing
per-request to attach to a context... deliberately thin"), which is exactly what this task changes.

**Fix**: magic-link email — no password to hash/manage/reset, matches the design doc's own "worth
considering something lightweight first" framing. This project has no transactional-email provider
wired in yet and adding one is out of scope for this task (flag it as a known gap, don't build a
fourth external integration to unblock a sprint-1-task's login flow) — so for now, the generated link
is logged to the server console and sent via the existing `founderChannel.notify()` (to the founder's
own chat, for the founder's own login; a not-yet-linked new user's link has nowhere to go but the
console log until Task 2/K's Telegram-linking exists or real email is added later) — a real, working
flow without a new integration, not a stub.

`POST /auth/request-link` (input: `email`) — looks up the `User` by email; no self-serve account
creation in this task (a tenant needs a seeded `AgentQuota` — Task 3/L — and the founder almost
certainly wants to control who gets a shared-cost account during a ~10-tester phase, not an open
signup form). An unrecognized email gets a deliberately generic "if that email has an account, a
link was sent" response (no user-enumeration leak), logged server-side either way. A signed,
short-lived (15 min), single-use JWT (`jti` tracked via a new `LoginToken` table with a nullable
`usedAt` — a DB-tracked single-use check is what actually prevents replay; the JWT signature alone
only proves authenticity, not first-use) is generated and the link containing it is delivered as
described above.

`GET /auth/verify?token=...` — verifies the JWT, checks `LoginToken.usedAt IS NULL`, marks it used,
and issues a real session: a signed JWT (httpOnly-cookie-friendly, carrying `userId`/`tenantId`/
`role`, no DB-backed session table needed since a JWT is itself the bearer credential — same "a lock
on the door" posture `API_AUTH_TOKEN`'s own doc comment already accepted for this project's scale).
`api/trpc.ts`'s `initTRPC.create()` gains a real `createContext` reading this session token from the
request and exposing `ctx.userId`/`ctx.tenantId`/`ctx.role` — finally giving `t.context` real content
instead of none. `api/server.ts`'s `onRequest` hook is rewritten to verify this session token;
`API_AUTH_TOKEN` is not removed but downgraded to an explicit "ops/script fallback" path (used by
`scripts/dry-run.ts` and similar tooling, never by the real app) — stated plainly in the report which
requests now go through which path.

The CORS registration in `api/server.ts` (`origin: true`, added by the frontend track for Expo-web
dev, its own comment already flags it as "dev-only, single-operator") stays permissive for this task
— tightening it to a real allow-list is a natural follow-on once a real deployed frontend origin
exists, not blocking this task, but note it explicitly in Known Issues so it isn't forgotten once real
user sessions (not just one shared token) are what CORS is actually gating access to.

**Verify**: (1) a real `POST /auth/request-link` for the seeded founder email produces a real,
console-logged (and Telegram-notified) link; `GET /auth/verify` with that exact token returns a
working session. (2) A subsequent authenticated `trpc` call using that session resolves
`ctx.tenantId` to the real seeded tenant — confirmed by inspecting the resolved context directly, not
assumed. (3) Reusing the same token a second time is rejected (`LoginToken.usedAt` already set). (4)
A token past its 15-minute window is rejected. (5) A request with neither a valid session nor the
`API_AUTH_TOKEN` fallback gets a clean 401 — `/health`'s existing exemption is unchanged.

### J3 — Thread the real session tenant through every hardcoded `MVP_TENANT_ID` read

**Where**: confirmed hardcoded reads at the API layer: `api/routers/runs.ts`'s `create` mutation
(`tenantId: MVP_TENANT_ID`) and `api/routers/channels.ts`'s `list` query
(`listActiveChannelsByTenant(MVP_TENANT_ID)`). A full audit is this task's own job, not assumed
complete from these two — grep the whole `api/routers/` tree and `run-pipeline/` for
`MVP_TENANT_ID` before considering this done.

**Fix**: every `publicProcedure` currently reading `MVP_TENANT_ID` reads `ctx.tenantId` (from J2)
instead. `MVP_TENANT_ID` stays exported — `scripts/dry-run.ts`, seed scripts, and any single-tenant
fixture legitimately still want a known constant — but is no longer read by any authenticated
request path once this task is done. `runs.ts`'s `gate1`/`gate2` mutations don't yet check that the
resolving user actually owns the gate's channel — that's Task 2/K's job (gate ownership), not this
task's (this task only establishes identity, deliberately kept separate).

**Verify**: a real run created through the API using a real (non-founder, if a second test user
exists by this point; the founder's own seeded user otherwise) session's tenant produces a
`PipelineRun.tenantId` matching that session's real tenant, confirmed by a direct Postgres read —
the regression check that matters: every pre-existing flow (dry-run.ts, the founder's own real usage)
must keep working unchanged via the `API_AUTH_TOKEN` fallback path in the meantime.

## Schema Impact

**Tables Created**
- `users` — `id`, `tenantId` (FK), `email` (unique), `name`, `role`, `telegramChatId`, timestamps.
- `login_tokens` — `id`, `userId` (FK), `jti` (unique), `expiresAt`, `usedAt` (nullable), `createdAt`.

**Tables Modified**
- `tenants` — gains the `users` relation (no new column on `Tenant` itself).

**Migration File**: A real Prisma migration (`prisma migrate dev`). Includes the founder's seeded
`User` row per J1 — state the exact migration name and the seeded email in the report.

## Business Logic / State Transition

**What this task implements**: No `PipelineRun`/`PipelineStage` transitions change. This task adds a
new identity/session layer in front of the existing API — every existing transition (`pending →
running`, gate resolution, etc.) is reached exactly as before, just authenticated by a real session
instead of one shared token.

**Preconditions**: A `User` row exists for anyone attempting `POST /auth/request-link` (no self-serve
signup this task — see J2).

**Postconditions**: A successfully verified magic link always produces a session carrying a real,
existing `userId` and `tenantId` — never a session for a user or tenant that doesn't exist (the JWT
is signed server-side from a real DB-verified `User` row at issuance, not client-supplied).

**Failure Modes & Handling**: An unrecognized email at `request-link` returns the same generic
response as a recognized one (no enumeration leak) but performs no real send. An expired or
already-used `login_tokens` row is rejected at `verify` with a clear, specific error — not a generic
401 — so a real user understands "this link expired, request a new one" rather than assuming their
account is broken.

## Testing

```bash
npm run build && npm run lint && npm run typecheck && npm test
```

Plus J1/J2/J3's real, live verification above — this task's bar is a real login round trip, not a
unit test of JWT signing in isolation.

### Documentation reconciliation
- `docs/execution/sprint3/SCHEMA.md` (create — first task of the sprint): `users`, `login_tokens`, the
  migration.
- `docs/execution/sprint3/BUSINESS_LOGIC.md` (create): the session-auth flow, the Tenant↔User
  relationship decision and its rationale.
- `docs/execution/sprint3/STATUS.md` (create): Task 1's row.
- `docs/design_doc/MVP_PART2_MULTI_USER_AND_FLEXIBLE_CREATION.md`: note Section 1's User-model/auth
  items as picked up by this task.

## Report Template
`execution/sprint3/reports/task1.md`, standard shape — see `TASK_TEMPLATE.md`.
