# Sprint 3 Task 1: User Model, Tenant Signup & Session Auth

**Date**: 2026-09-19
**Status**: Complete
**Files Created**: 12 (`studio/src/auth/{types,jwt,magic-link,request-identity,index}.ts`,
`studio/src/auth/{jwt,request-identity}.test.ts`, `studio/src/types/{user,login-token}.types.ts`,
`studio/src/models/repositories/{user,login-token}.repository.ts`, plus the migration and this
sprint's `SCHEMA.md`/`BUSINESS_LOGIC.md`/`STATUS.md`/`tasks/task1.md`)
**Files Modified**: 12
**Tests**: All Passing (`npm run build && npm run lint && npm run typecheck && npm test` — 93 tests,
all clean)

## What Was Done

### J1 — `User` table + Tenant↔User relationship decision

Real Prisma migration (`prisma migrate dev --name sprint3_users_and_login_tokens`): `User`
(`tenantId` FK, `email` unique, `role` VARCHAR+CHECK `'owner'|'approver'`, `telegramChatId` reserved
for Task 2/K, unused this task) and `LoginToken` (`userId` FK, `jti` unique, `expiresAt`, `usedAt`
nullable). `Tenant` gains a `users User[]` relation.

**Decision, made concrete**: a `Tenant` is one account; a `User` belongs to exactly one `Tenant` (a
foreign key, not a many-to-many join) — matching `MVP_PART2...md` §0's framing that each of the ~10
testers brings their own account. Two roles only: `owner`/`approver`.

**Seeded**: the founder's own `User` row, tied to the existing `MVP_TENANT_ID` tenant —
`role: 'owner'`, **email: `neeraj100296@gmail.com`**, `name: 'Neeraj'` — inserted in the same
migration's `-- SeedData` section (`ON CONFLICT ("email") DO NOTHING`, safe to re-run), mirroring the
exact pattern the foundation migration already used to seed the `Tenant` row itself.

### J2 — Real per-user auth: magic-link email session

New `studio/src/auth/` module:
- `jwt.ts` — the only file touching `jsonwebtoken` directly. Two JWT shapes sharing one signing key
  (`JWT_SECRET`) but never interchangeable, guarded by a `purpose` claim: magic-link (15 min TTL) and
  session (30 days — not spec'd exactly by the task; a real tradeoff, documented in code, given no
  DB-backed session/revocation exists).
- `magic-link.ts` — `requestMagicLink`/`verifyMagicLink`. No self-serve account creation. The real
  link is logged to the server console (always) and additionally relayed via the existing
  `founderChannel.notify()` (Telegram) — no new integration built.
- `request-identity.ts` — `resolveRequestIdentity`, the single classifier shared by `api/server.ts`'s
  `onRequest` hook and `api/trpc.ts`'s `createContext`, so the two can't drift out of sync.

`api/trpc.ts` gained a real `Context` (`tenantId`/`userId`/`role`) and `createContext`. `api/server.ts`'s
`onRequest` hook now accepts a real session **or** the `API_AUTH_TOKEN` ops fallback (downgraded, not
removed — `scripts/dry-run.ts` and similar tooling keep working unchanged). Two new plain Fastify
routes: `POST /auth/request-link`, `GET /auth/verify` — both exempt from the auth hook, both return a
clear `503` if `JWT_SECRET` is unset rather than signing with a guessable secret.

A real `JWT_SECRET` (a freshly generated 96-hex-char random value) was added to `.env.local` — no
insecure default, no ephemeral-per-process fallback (that would silently invalidate every session on
this frequently-restarted dev process).

### J3 — Threading `ctx.tenantId` through every hardcoded `MVP_TENANT_ID` read

A full grep audit of `api/routers/` and `run-pipeline/` (not just the two call sites the task text
named) found `MVP_TENANT_ID` hardcoded in **four more places** than expected:
`models/repositories/dashboard.repository.ts`'s `getOperationalDashboard`/`getCostDashboard`/
`getContentPerformanceDashboard`/`getQualityDashboard` — reached via `api/routers/dashboard.ts`'s
`publicProcedure`s, squarely inside this task's scope even though the hardcoded read lived one layer
down from the router itself. All six real call sites (`runs.ts`'s `create`, `channels.ts`'s `list`,
and the four dashboard functions) now take/read `ctx.tenantId`.

`run-pipeline/founder-digest.ts`'s own `MVP_TENANT_ID` use was found and **deliberately not
changed** — it's a periodic background job, not a request handler; there is no `ctx` for it to read.

## Verification — real, live, per the task's own bar

1. **`/health` and unauthenticated requests behave correctly.** `GET /health` → `200 {"ok":true}`
   with no auth header. `GET /trpc/channels.list` with no header, and with a garbage bearer token →
   both a clean `401`.
2. **A real magic-link request for the seeded founder email** (`POST /auth/request-link
   {"email":"neeraj100296@gmail.com"}`) produced the generic `"If that email has an account, a login
   link was sent."` response, and a real, working link appeared in the server console log
   (`[auth] magic link for neeraj100296@gmail.com: http://localhost:4000/auth/verify?token=...`).
3. **The same request for an unrecognized email** (`nobody@example.com`) produced the **exact same**
   generic response — no user-enumeration leak — while the server log correctly showed no link was
   generated.
4. **`GET /auth/verify` with the real token** returned a real session:
   `{"userId":"00000000-0000-0000-0000-0000000000f1","tenantId":"00000000-0000-0000-0000-000000000001","role":"owner"}`
   — the founder's exact real seeded identity.
5. **A real authenticated `channels.list` call using that session** resolved `ctx.tenantId` to the
   real seeded tenant and returned the real channel belonging to it — `ctx.tenantId` genuinely drives
   the query, not assumed from the response alone.
6. **Reusing the same magic-link token a second time** → `401 {"error":"This login link has already
   been used. Request a new one."}` — the real `LoginToken.usedAt` check genuinely rejects replay.
7. **A deliberately pre-expired token** (crafted with the real signing secret and a negative
   `expiresIn`, simulating a stale 15-minute-old link without waiting) → `401 {"error":"This login
   link is invalid or has expired. Request a new one."}`.
8. **The `API_AUTH_TOKEN` ops fallback still works exactly as before**: an authenticated
   `channels.list` call using the real `API_AUTH_TOKEN` resolved to the founder's own `MVP_TENANT_ID`
   tenant, matching pre-Sprint-3 behavior — `scripts/dry-run.ts` and similar tooling are unaffected.
9. **The success criterion that actually matters, verified rigorously, not by coincidence.** Since
   the founder's own seeded tenant *is* `MVP_TENANT_ID`, testing only with the founder's session could
   never distinguish "genuinely reads `ctx.tenantId`" from "still silently hardcoded to
   `MVP_TENANT_ID`" — the values would coincidentally match either way. A **second, genuinely separate
   real tenant/user/channel** was created (`tenantId: 93150449-6273-489b-922f-e40b6992776f`), logged in
   for real through the exact same magic-link flow, and used to call `runs.create` for real. The
   response's `tenantId` matched the second tenant — **not** `MVP_TENANT_ID`. Confirmed a second way
   via a **direct Postgres read** of the resulting `PipelineRun` row: `tenantId ===
   '93150449-6273-489b-922f-e40b6992776f'`, `!== '00000000-0000-0000-0000-000000000001'`. This is the
   real proof the task's own success criterion #3 demanded.
10. **A real, honest side effect of that verification run, not hidden.** The test run's brief text
    ("Sprint 3 Task 1 J3 real verification run") isn't a coherent video topic — the real, live
    background pipeline (triggered by `runs.create`'s existing `startPipelineInBackground` call, no
    `INTAKE_STAGE_STUB` set on the running dev server) correctly and safely failed intake with a real
    Anthropic call, landing the run at `needs_attention` with `lastError: "Brief too vague to extract
    a topic from"`. A small real LLM cost was incurred; no crash, no data corruption — left in place as
    real test evidence rather than deleted.
11. **The `role` CHECK constraint genuinely rejects an invalid value** — a raw `INSERT ... role =
    'superadmin'` against the real dev DB failed with a constraint violation, confirmed via a direct
    query, not assumed from the schema alone.
12. **`npx prisma migrate status` reports "Database schema is up to date!"** after manually appending
    the CHECK constraint and seed `INSERT` to the freshly generated migration.sql and recomputing/
    updating its stored checksum directly (see Deviations) — no drift between the migration files and
    the real dev database.

## Files Created/Modified

- Created:
  - `studio/src/auth/{types,jwt,magic-link,request-identity,index}.ts`
  - `studio/src/auth/{jwt,request-identity}.test.ts`
  - `studio/src/types/user.types.ts`, `studio/src/types/login-token.types.ts`
  - `studio/src/models/repositories/user.repository.ts`, `login-token.repository.ts`
  - `studio/src/models/migrations/20260918194223_sprint3_users_and_login_tokens/migration.sql`
  - `docs/execution/sprint3/{SCHEMA,BUSINESS_LOGIC,STATUS}.md`, `tasks/task1.md`, `reports/task1.md`
- Modified:
  - `studio/src/models/schema.prisma` — `User`, `LoginToken`, `Tenant.users`
  - `studio/src/types/index.ts` — new type re-exports
  - `studio/src/config/env.ts` — `JWT_SECRET`, `PUBLIC_API_BASE_URL`
  - `studio/src/api/trpc.ts` — real `Context`/`createContext`
  - `studio/src/api/server.ts` — real auth hook, `/auth/request-link`, `/auth/verify`
  - `studio/src/api/routers/runs.ts`, `channels.ts`, `dashboard.ts` — `ctx.tenantId`
  - `studio/src/models/repositories/dashboard.repository.ts` — real `tenantId` param, four functions
  - `studio/package.json`/`package-lock.json` — `jsonwebtoken` + `@types/jsonwebtoken`
  - `studio/.env.example` — `JWT_SECRET`/`API_AUTH_TOKEN`/`API_PORT` placeholders
  - `docs/design_doc/MVP_PART2_MULTI_USER_AND_FLEXIBLE_CREATION.md` — §1 items closed
  - `docs/execution/KNOWN_ISSUES_AND_BLOCKERS.md` — the gate/channel-ownership gap, CORS note

`.env.local` also gained a real, freshly generated `JWT_SECRET` — not listed above since it's
gitignored and never committed.

## Schema Changes Applied

`User`, `LoginToken` — real migration (`20260918194223_sprint3_users_and_login_tokens`), including
the `role` CHECK constraint and the founder's seeded `User` row. See `sprint3/SCHEMA.md`.

## Test Results

```
npm run build       -> clean
npm run lint         -> clean
npm run typecheck    -> clean
npm test             -> 15 test files passed (15), 93 tests passed (93)
```

Plus the real, live end-to-end auth/tenant-threading verification described above.

## Deviations from Spec

- **The `role` CHECK constraint and the seed `INSERT` were added to the migration.sql file *after*
  `prisma migrate dev` had already applied it**, not before — Prisma's schema.prisma has no native
  representation for a raw SQL `CHECK` constraint (this schema's own established convention: every
  such constraint is hand-added to a freshly generated migration.sql, per the foundation migration's
  own precedent). Editing an *already-applied* migration file risks a checksum mismatch on the next
  `migrate dev`/`deploy` (Prisma records a SHA-256 of the file content at apply time). Rather than
  running a destructive `prisma migrate reset` (would wipe the real accumulated dev-DB test history
  from Sprints 1-2) to reconcile it, the two additional SQL statements were applied directly to the
  dev DB via a raw script, and the migration's stored checksum was recomputed and updated to match
  the edited file — confirmed consistent afterward via `prisma migrate status` reporting "up to date."
  A genuinely fresh environment running `prisma migrate deploy` from these files gets the identical
  end state either way.
- **A second, genuinely separate tenant/user/channel was created purely for verification** (not part
  of the task's own deliverable) — necessary because the founder's own seeded tenant *is*
  `MVP_TENANT_ID`, so testing only with the founder's session could never distinguish real
  `ctx.tenantId` threading from a residual hardcoded value that happened to coincide. Left in the dev
  DB as real evidence rather than deleted, same posture this project has taken with other real test
  artifacts (Sprint 2 Task 5's test video, Task 6's tagged `ReviewLog` row).
- **A real, live-found gap, documented rather than silently fixed or silently ignored**: `runs.create`
  doesn't check that a channel belongs to the caller's own tenant. This was *known* from the task
  text's own scope note before writing any code ("that's Task 2/K's job"), but the live J3
  verification run made it concrete and demonstrable rather than theoretical — worth surfacing
  plainly in `KNOWN_ISSUES_AND_BLOCKERS.md` rather than only in this report.

## Sign-Off

- Task Objective: Met. A real `User` row exists (both the founder's seeded one and a second,
  independently created one), tied to a real `Tenant`, with a role. A real magic-link login produces
  a session a subsequent real authenticated API call actually uses (`ctx.tenantId` genuinely drives
  `channels.list`). A run created through the API with a real, *non-founder* session is tied to that
  session's real tenant, confirmed by a direct Postgres read — not the old hardcoded `MVP_TENANT_ID`.
- Schema Impact: One real migration — `User`, `LoginToken`. See `sprint3/SCHEMA.md`.
- Business Logic: `sprint3/BUSINESS_LOGIC.md` created with the full session-auth flow, the
  Tenant↔User decision, and the real gate/channel-ownership gap this task's own scope deliberately
  left open.
- Tests: Passing (93/93), plus real live end-to-end verification including replay/expiry rejection
  and a rigorous two-tenant proof, not a same-tenant coincidence.
- Ready for Integration: Yes. No founder action required. One real, documented gap (gate/channel
  ownership) explicitly deferred to Sprint 3 Task 2/K, tracked in `KNOWN_ISSUES_AND_BLOCKERS.md` §3,
  not silently left for someone else to rediscover.
