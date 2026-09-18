# Sprint 3 Status: Multi-User / Application Layer

**Sprint status**: Task 1 done — the foundation every other Sprint 3 task threads a real signed-in
user/tenant through. Built a real `User` table with a concrete Tenant↔User relationship decision (one
`Tenant` = one account, a `User` belongs to exactly one `Tenant`, two roles), real magic-link session
auth replacing the single shared `API_AUTH_TOKEN` as the app's primary auth path (the token itself
stays as an explicit ops/script fallback), and threaded the real session tenant through every
`publicProcedure` that used to read the hardcoded `MVP_TENANT_ID` — including two dashboard-layer
functions a first-pass grep of only the two task-named call sites would have missed. Verified live
against a genuinely separate second tenant (not just the founder's own, where a lingering hardcoded
value would have coincidentally still looked correct).
**Last updated**: 2026-09-19 (after Task 1)

| Task | Name | Status | Owner | Notes |
|---|---|---|---|---|
| 1 | User Model, Tenant Signup & Session Auth | Done | Claude Code | J1: real `User`/`login_tokens` tables (migration `sprint3_users_and_login_tokens`), `role` VARCHAR+CHECK (`owner`\|`approver`), founder's `User` row seeded in the same migration (`neeraj100296@gmail.com`, `owner`). J2: `auth/` module — magic-link JWT (15 min, single-use, DB-tracked via `login_tokens.usedAt`) exchanged at `/auth/verify` for a session JWT (`userId`/`tenantId`/`role`); real link delivery via server console + the existing Telegram `founderChannel.notify()`, no new integration. `api/trpc.ts` gained a real `Context`/`createContext`; `api/server.ts`'s auth hook now accepts a real session or the `API_AUTH_TOKEN` ops fallback. J3: full audit of `api/routers/` and `run-pipeline/` found `MVP_TENANT_ID` hardcoded in more places than the task text named (`dashboard.repository.ts`'s four functions, reached via `dashboard.ts`'s routers) — all now read `ctx.tenantId`. **Real, live verification**: a full login round trip (real `POST /auth/request-link`, real console-logged link, real `GET /auth/verify`, a real authenticated `channels.list` call resolving the real tenant), replay rejection (reused token → 401 "already used"), expiry rejection (a deliberately pre-expired token → 401 "expired"), and — the actual success criterion that matters — a **genuinely separate second tenant/user** created and logged in for real, whose real `runs.create` call produced a `PipelineRun.tenantId` matching that second tenant (confirmed via a direct Postgres read), not `MVP_TENANT_ID`. See `reports/task1.md`. |

## Full detail
Per-task reports: `reports/task1.md`.

## Open items closed by Task 1
- `MVP_PART2_MULTI_USER_AND_FLEXIBLE_CREATION.md` §1's "No `User` model exists at all" item — **closed**.
- `MVP_PART2_MULTI_USER_AND_FLEXIBLE_CREATION.md` §1's "No real per-user auth" item — **closed**.

## Open items carried forward
- **Gate/channel ownership isn't checked yet** — `runs.create` validates the target `channelId`
  exists but not that it belongs to the caller's own tenant; a signed-in user's session could today
  create a run against *any* tenant's channel if they knew its id. Deliberately out of this task's
  scope (its own text: "that's Task 2/K's job, not this task's — this task only establishes
  identity"). Real, live-demonstrated (not hypothetical) — see `KNOWN_ISSUES_AND_BLOCKERS.md` §1.
- **Per-user notification routing** — `User.telegramChatId` exists in the schema (reserved this task,
  unused), but every notification still goes to the single `TELEGRAM_FOUNDER_CHAT_ID`. Sprint 3 Task
  2/K's job per `MVP_PART2...md` §1.
- **CORS stays permissive** (`origin: true`) — unchanged this task, explicitly noted as a natural
  follow-on once a real deployed frontend origin exists, not blocking. See
  `KNOWN_ISSUES_AND_BLOCKERS.md` §4.
- **No self-serve signup** — `POST /auth/request-link` only works for an already-seeded `User`; who
  gets an account during the ~10-tester phase is a founder decision, by design, not a gap to close
  later without a real product decision first.
- **API server boot still gates on `API_AUTH_TOKEN` alone**, not `JWT_SECRET` — unchanged this task
  (minimal-diff choice; the ops/script fallback path was already the thing gating startup, and
  changing that wasn't asked for). Slightly odd now that real sessions are the primary path, but not
  a functional gap — flagged for awareness, not treated as a defect.
- **`.env.example` is stale** — missing several env vars added across Sprint 2 (`AI_VISUALS_STUB`,
  `YOUTUBE_ANALYTICS_STUB`, `FOUNDER_DIGEST_*`, etc.), predating this task. Only this task's own new
  vars (`JWT_SECRET`, `API_AUTH_TOKEN`, `API_PORT`) were added; a full reconciliation is a separate,
  real but out-of-scope cleanup.
