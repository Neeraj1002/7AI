# Sprint 3 Status: Multi-User / Application Layer

**Sprint status**: Tasks 1-3 done. Task 1 built the foundation every other Sprint 3 task threads a
real signed-in user/tenant through: a real `User` table with a concrete Tenant↔User relationship
decision (one `Tenant` = one account, a `User` belongs to exactly one `Tenant`, two roles), real
magic-link session auth replacing the single shared `API_AUTH_TOKEN` as the app's primary auth path
(the token itself stays as an explicit ops/script fallback), and threaded the real session tenant
through every `publicProcedure` that used to read the hardcoded `MVP_TENANT_ID` — including two
dashboard-layer functions a first-pass grep of only the two task-named call sites would have missed.
Task 2 built real gate-resolution ownership (`Channel.ownerUserId`, fail-closed) — a signed-in
user's session can no longer approve/reject a gate belonging to another tenant's channel, or a
different owner's channel on the same tenant unless they hold the `owner` role. Task 3 built real
per-user notification routing (a real in-app `Notification` inbox, always; Telegram, only once a
user really links it via a real `/link <code>` flow) — replacing the single hardcoded
`TELEGRAM_FOUNDER_CHAT_ID` every prior notification went to, and along the way found and fixed a real
bug (a reply-send failure could crash the message handler even after its underlying action already
succeeded) and a real privacy gap (every user's login link used to relay to the founder's own
Telegram, not the requester's own). All three tasks verified live against genuinely separate
tenants/users, never just the founder's own (where a lingering bug could coincidentally still look
correct).
**Last updated**: 2026-09-19 (after Task 3)

| Task | Name | Status | Owner | Notes |
|---|---|---|---|---|
| 1 | User Model, Tenant Signup & Session Auth | Done | Claude Code | J1: real `User`/`login_tokens` tables (migration `sprint3_users_and_login_tokens`), `role` VARCHAR+CHECK (`owner`\|`approver`), founder's `User` row seeded in the same migration (`neeraj100296@gmail.com`, `owner`). J2: `auth/` module — magic-link JWT (15 min, single-use, DB-tracked via `login_tokens.usedAt`) exchanged at `/auth/verify` for a session JWT (`userId`/`tenantId`/`role`); real link delivery via server console + the existing Telegram `founderChannel.notify()`, no new integration. `api/trpc.ts` gained a real `Context`/`createContext`; `api/server.ts`'s auth hook now accepts a real session or the `API_AUTH_TOKEN` ops fallback. J3: full audit of `api/routers/` and `run-pipeline/` found `MVP_TENANT_ID` hardcoded in more places than the task text named (`dashboard.repository.ts`'s four functions, reached via `dashboard.ts`'s routers) — all now read `ctx.tenantId`. **Real, live verification**: a full login round trip (real `POST /auth/request-link`, real console-logged link, real `GET /auth/verify`, a real authenticated `channels.list` call resolving the real tenant), replay rejection (reused token → 401 "already used"), expiry rejection (a deliberately pre-expired token → 401 "expired"), and — the actual success criterion that matters — a **genuinely separate second tenant/user** created and logged in for real, whose real `runs.create` call produced a `PipelineRun.tenantId` matching that second tenant (confirmed via a direct Postgres read), not `MVP_TENANT_ID`. See `reports/task1.md`. |
| 2 | Gate Ownership | Done | Claude Code | K1: `Channel.ownerUserId` (nullable FK, migration `sprint3_channel_owner`), backfilled to each tenant's seeded owner for every existing row. `assertGateOwnership` (`api/routers/runs.ts`) runs before `resolvePendingApproval` in both `gate1`/`gate2`; the actual decision is a new pure, unit-tested function, `canResolveGate` (`run-pipeline/gate-ownership.ts`): `ctx.tenantId === channel.tenantId && (ctx.userId === channel.ownerUserId \|\| ctx.role === 'owner')`. Fails closed on a null owner. **Real, live verification** — three real pipeline runs driven to a genuine pending gate1/gate2 via the real API (real LLM calls, no stubs): (1) a Tenant B session attempting Tenant A's gate → real `403 FORBIDDEN`, gate confirmed still pending afterward; (2) a different `owner`-role user on Tenant A (not the channel's specific owner) → real success; (3) the channel's actual `ownerUserId` (the founder) → real success, the regression check that matters most; (4) an `approver`-role user against a deliberately ownerless channel → real `403 FORBIDDEN` (proves fail-closed, not just "owner-role users happen to always match"); (5) an `owner`-role user against that same ownerless channel → real success (proves the fallback path). A distinct, still-open gap (`runs.create` doesn't check channel/tenant match at creation time — K1 only covers *resolution*) is documented, not silently folded into "K1 fixed ownership." See `reports/task2.md`. |
| 3 | Per-User Notification Routing | Done | Claude Code | K2: `Notification`/`telegram_link_codes` tables (migration `sprint3_notifications_and_telegram_linking`), the founder's own real `telegramChatId` carried over from `env.TELEGRAM_FOUNDER_CHAT_ID` in the same migration. A real `InAppFounderChannel` (writes `Notification` rows) plus `composeFounderChannel` (in-app always, Telegram only if linked) — `pending-approvals.ts` extracted so any number of channels/recipients share one pending-approval promise per `threadKey`, "first reply wins" for free. `resolveNotificationRecipients` mirrors K1's own fail-closed design for *who gets told*, not just who may resolve. A real `/link <code>` flow (`TelegramLinkCode`, `notifications.createTelegramLinkCode`/`unlinkTelegram`/`list`). **Real, live verification**: a gate for an unlinked user produced a real in-app-only `Notification` row, resolved via the API alone, `resolvedAt` set automatically; a real `/link` flow (simulated Telegram input) set a real `telegramChatId`, confirmed by a direct DB read; the founder's own real gate1 flow (real Telegram message + real simulated reply) now also writes a real in-app row that gets marked resolved via the *Telegram* path, proving cross-channel resolution actually works, not just same-channel. **Two real, live-found problems, both fixed within this task**: (1) a `/link` reply-send failure could crash the whole message handler even after the real DB write had already succeeded — fixed with a `safeReply` helper used everywhere in the handler; (2) `auth/magic-link.ts` previously relayed *every* user's login link to the founder's own Telegram — fixed to route to the requester's own linked chat instead. See `reports/task3.md`. |

## Full detail
Per-task reports: `reports/task1.md`, `reports/task2.md`, `reports/task3.md`.

## Open items closed by Task 1
- `MVP_PART2_MULTI_USER_AND_FLEXIBLE_CREATION.md` §1's "No `User` model exists at all" item — **closed**.
- `MVP_PART2_MULTI_USER_AND_FLEXIBLE_CREATION.md` §1's "No real per-user auth" item — **closed**.

## Open items closed by Task 2
- `MVP_PART2_MULTI_USER_AND_FLEXIBLE_CREATION.md` §1's "Gate ownership" item — **closed** (gate
  *resolution* ownership; run/channel *creation*-time ownership remains a distinct, open gap — see
  below).

## Open items closed by Task 3
- `MVP_PART2_MULTI_USER_AND_FLEXIBLE_CREATION.md` §1's "Per-user notification routing" item —
  **closed**.

## Open items carried forward
- **Run/channel creation-time tenant ownership isn't checked** — `runs.create` validates the target
  `channelId` exists but not that it belongs to the caller's own tenant; a signed-in user's session
  could today create a run against *any* tenant's channel if they knew its id. Distinct from Task 2's
  gate-*resolution* fix (K1 stops a wrong-tenant user from approving that run's gates afterward, not
  from creating it). Real, live-demonstrated (not hypothetical) — see `KNOWN_ISSUES_AND_BLOCKERS.md`
  §3.
- **A real, unrelated resume-loop edge case, found incidentally during Task 3's own live testing** —
  a real run whose `video_generation` regen loop was mid-flight when the dev process was killed (for
  an unrelated Telegram-simulation test) resumed into a `video_generation` attempt that itself
  completed, but the run's own `status`/`currentStage` never advanced past the earlier, now-orphaned
  attempt — the run sat at `status: running` indefinitely rather than progressing or landing at
  `needs_attention`. Not root-caused (a real, pre-existing gap in how `resume-on-startup.ts`
  interacts with `pipeline-runner.ts`'s multi-step regen loop under a specific kill-timing scenario,
  unrelated to notification routing) — closed out manually via `close-stale-test-runs.ts`, worth a
  real investigation later if it recurs. See `sprint3/reports/task3.md`.
- **CORS stays permissive** (`origin: true`) — unchanged so far, explicitly noted as a natural
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
