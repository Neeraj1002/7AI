# Sprint 3 Status: Multi-User / Application Layer

**Sprint status**: All 7 tasks done. Sprint 3 was marked closed after Task 6, then **reopened** for a
seventh task — now closed again, with one real founder-action item carried forward (Task 7/O1's
on-device push verification).
Telegram was only ever built (Week 1) to make Gate 1/Gate 2 testable before any real UI existed; once
Task 3 (K2) gave every user a real in-app notification inbox, a clear product decision was made to
retire Telegram entirely rather than keep it as a second, permanent channel — no fallback, no feature
flag. Because gate reminders, the founder digest, and post-hoc tagging had all quietly grown a real
dependency on it since Week 1/2, and because the in-app inbox alone is pull-only (nobody is actively
notified of a new gate unless they happen to open the app), the decision was to fold real push
notification infrastructure and the full Telegram retirement into this same sprint — Task 7 (O) —
rather than opening a Sprint 4 for it. Task 1 built the foundation every other Sprint 3 task threads a
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
correct). Task 4 closed the real "a new tenant can't actually run anything" gap (every tenant now
gets a real `AgentQuota` row at creation, not just the founder's own hand-seeded one) and
investigated YouTube's real API quota headroom — finding the task's own assumed cost model was stale
(a real upload now costs ~1 unit in its own dedicated bucket, not ~1,600 shared units, per a real API
change in the last year) and concluding no quota increase is needed yet, with the real medium-term
risk being Performance Analytics' own unbounded polling design, not upload volume. Task 5 moved
YouTube OAuth credentials off the single `YOUTUBE_REFRESH_TOKEN` env var onto real, encrypted,
per-channel `AgentCredential` storage, with a real in-app connect/disconnect flow replacing the old
one-time CLI script — the biggest single piece of Sprint 3, done save one real founder-action item
(a fresh Google consent). Task 6 closed the sprint the first time: `channels.create` (real, real
7-channel cap exercised live) and a derived `hasYoutubeCredential` field on `list`/the new `get`.
Task 7 retired Telegram entirely (deleted, not flagged off — confirmed by a repo-wide grep and a real
dev-server boot with no bot startup line) and built real Expo push notification infrastructure in its
place, migrated the founder digest and post-hoc tagging to real in-app equivalents, and renamed the
whole notification-dispatch module (`notify-founder/` → `notifications/`) to match what Task 3 had
already made true in behavior. A complete real pipeline was driven through both gates end-to-end with
zero Telegram code involved; the one thing genuinely unverifiable without a physical device (real
on-device push delivery, confirmed against Expo's own push-receipt API) is tracked as a founder-action
item, not asserted.
**Last updated**: 2026-09-20 (after Task 7 — Sprint 3 closed again).

| Task | Name | Status | Owner | Notes |
|---|---|---|---|---|
| 1 | User Model, Tenant Signup & Session Auth | Done | Claude Code | J1: real `User`/`login_tokens` tables (migration `sprint3_users_and_login_tokens`), `role` VARCHAR+CHECK (`owner`\|`approver`), founder's `User` row seeded in the same migration (`neeraj100296@gmail.com`, `owner`). J2: `auth/` module — magic-link JWT (15 min, single-use, DB-tracked via `login_tokens.usedAt`) exchanged at `/auth/verify` for a session JWT (`userId`/`tenantId`/`role`); real link delivery via server console + the existing Telegram `founderChannel.notify()`, no new integration **(the Telegram half of this is removed by Task 7/O2 — see that task's own note on why link delivery falls back to console-only until real email exists)**. `api/trpc.ts` gained a real `Context`/`createContext`; `api/server.ts`'s auth hook now accepts a real session or the `API_AUTH_TOKEN` ops fallback. J3: full audit of `api/routers/` and `run-pipeline/` found `MVP_TENANT_ID` hardcoded in more places than the task text named (`dashboard.repository.ts`'s four functions, reached via `dashboard.ts`'s routers) — all now read `ctx.tenantId`. **Real, live verification**: a full login round trip (real `POST /auth/request-link`, real console-logged link, real `GET /auth/verify`, a real authenticated `channels.list` call resolving the real tenant), replay rejection (reused token → 401 "already used"), expiry rejection (a deliberately pre-expired token → 401 "expired"), and — the actual success criterion that matters — a **genuinely separate second tenant/user** created and logged in for real, whose real `runs.create` call produced a `PipelineRun.tenantId` matching that second tenant (confirmed via a direct Postgres read), not `MVP_TENANT_ID`. See `reports/task1.md`. |
| 2 | Gate Ownership | Done | Claude Code | K1: `Channel.ownerUserId` (nullable FK, migration `sprint3_channel_owner`), backfilled to each tenant's seeded owner for every existing row. `assertGateOwnership` (`api/routers/runs.ts`) runs before `resolvePendingApproval` in both `gate1`/`gate2`; the actual decision is a new pure, unit-tested function, `canResolveGate` (`run-pipeline/gate-ownership.ts`): `ctx.tenantId === channel.tenantId && (ctx.userId === channel.ownerUserId \|\| ctx.role === 'owner')`. Fails closed on a null owner. **Real, live verification** — three real pipeline runs driven to a genuine pending gate1/gate2 via the real API (real LLM calls, no stubs): (1) a Tenant B session attempting Tenant A's gate → real `403 FORBIDDEN`, gate confirmed still pending afterward; (2) a different `owner`-role user on Tenant A (not the channel's specific owner) → real success; (3) the channel's actual `ownerUserId` (the founder) → real success, the regression check that matters most; (4) an `approver`-role user against a deliberately ownerless channel → real `403 FORBIDDEN` (proves fail-closed, not just "owner-role users happen to always match"); (5) an `owner`-role user against that same ownerless channel → real success (proves the fallback path). A distinct, still-open gap (`runs.create` doesn't check channel/tenant match at creation time — K1 only covers *resolution*) is documented, not silently folded into "K1 fixed ownership." See `reports/task2.md`. |
| 3 | Per-User Notification Routing | Done — Telegram half retired by Task 7 | Claude Code | K2: `Notification`/`telegram_link_codes` tables (migration `sprint3_notifications_and_telegram_linking`), the founder's own real `telegramChatId` carried over from `env.TELEGRAM_FOUNDER_CHAT_ID` in the same migration. A real `InAppFounderChannel` (writes `Notification` rows) plus `composeFounderChannel` (in-app always, Telegram only if linked) — `pending-approvals.ts` extracted so any number of channels/recipients share one pending-approval promise per `threadKey`, "first reply wins" for free. `resolveNotificationRecipients` mirrors K1's own fail-closed design for *who gets told*, not just who may resolve. A real `/link <code>` flow (`TelegramLinkCode`, `notifications.createTelegramLinkCode`/`unlinkTelegram`/`list`). **Real, live verification**: a gate for an unlinked user produced a real in-app-only `Notification` row, resolved via the API alone, `resolvedAt` set automatically; a real `/link` flow (simulated Telegram input) set a real `telegramChatId`, confirmed by a direct DB read; the founder's own real gate1 flow (real Telegram message + real simulated reply) now also writes a real in-app row that gets marked resolved via the *Telegram* path, proving cross-channel resolution actually works, not just same-channel. **Two real, live-found problems, both fixed within this task**: (1) a `/link` reply-send failure could crash the whole message handler even after the real DB write had already succeeded — fixed with a `safeReply` helper used everywhere in the handler; (2) `auth/magic-link.ts` previously relayed *every* user's login link to the founder's own Telegram — fixed to route to the requester's own linked chat instead. **Superseded by Task 7/O2**: the Telegram channel, the `/link` flow, and `telegram_link_codes`/`User.telegramChatId` are all removed — `composeFounderChannel`'s "Telegram if linked" branch becomes "push if a token is registered" (Task 7/O1), and `InAppFounderChannel`/`notify-founder/` are renamed (Task 7/O5). The in-app routing design itself (`resolveNotificationRecipients`, per-recipient dispatch, shared pending-approval promise) is unchanged and still correct. See `reports/task3.md` and `reports/task7.md`. |
| 4 | Per-Tenant Budget Provisioning + YouTube Quota Headroom Check | Done — L2 verification item | Claude Code / **Founder (L2)** | L1: `scripts/invite-tenant.ts` creates a real `Tenant` + owning `User`(`owner`) + `AgentQuota` (default $2.00/day, reusing the founder's own original, still-unconfirmed figure) in one `prisma.$transaction` — no tenant is ever left without a budget row. New `insertTenant`/transaction-capable `insertUser`/`insertAgentQuota` repository functions. **Real, live verification**: a genuinely new tenant (created via the real script) got a real `AgentQuota` row confirmed by direct Postgres read; that tenant's real owner logged in via a real magic link and submitted a real brief through the real API, which passed the real budget gate at `script_generation` (a real LLM call happened, no stub) and reached a genuine pending `gate1`, resolved by that same real owner — incidentally re-confirming Tasks 2/3's ownership and notification logic for a third independent tenant. L2: a real, live investigation (no code). Found the task's own assumed YouTube quota cost model was stale — `videos.insert` now costs ~1 unit in its own dedicated 100-calls/day bucket (a real API change in the last year, verified directly against Google's current developer docs), not ~1,600 shared units. Real estimate at a ~10-tester cadence shows comfortable near-term headroom; the real medium-term risk is Performance Analytics' own unbounded "poll every historical published video forever" design, not upload volume. This project's actual Cloud Console quota numbers couldn't be checked live (requires the founder's own Google login, confirmed no session exists) — a real, quick verification item tracked as a founder action, not a blocking quota-increase request. See `reports/task4.md`. |
| 5 | Per-Channel YouTube OAuth — `AgentCredential` + Real Connect Flow | Done — one real founder-action item remains | Claude Code / **Founder** | M1: `AgentCredential` table (migration `sprint3_agent_credentials`), AES-256-GCM encryption at rest (`models/credential-crypto.ts`, keyed off new `CREDENTIAL_ENCRYPTION_KEY`), `agent-credential.repository.ts` (`findByChannel`/`upsertForChannel`/`deleteForChannel`/`findDecryptedRefreshTokenForChannel`). M2: real in-app connect flow — `channels.getYoutubeConnectUrl` (session + ownership-checked via Task 2's `canResolveGate`, reused directly) builds the real Google consent URL with the target `channelId` signed into OAuth's `state` (a new `purpose: 'oauth-state'` JWT, same discriminator pattern as Task 1's magic-link/session tokens); `GET /oauth2callback` exchanges the code and stores the credential; `channels.disconnectYoutube` removes it — replaces the old one-time `scripts/youtube-oauth.ts` terminal script entirely. M3: all three YouTube client modules (`agents/publishing/youtube-client.ts`, `agents/performance-analytics/youtube-stats-client.ts`/`youtube-analytics-client.ts`) migrated off `env.YOUTUBE_REFRESH_TOKEN` onto per-channel `AgentCredential` lookups — structurally, no code path reads the old env var for a real call anymore. `scripts/migrate-founder-youtube-credential.ts` moved the founder's own existing token into a real `AgentCredential` row for their channel. **Real, live verification**: M1 — a direct raw-SQL column read (bypassing the repository's own decrypt path) confirmed genuine ciphertext (131 decoded bytes, no plaintext substring), and the repository's real decrypt path recovered the exact original token. M2 — a real session-authenticated call produced a real, correctly-scoped Google consent URL; navigating to it in a real browser reached Google's actual, correctly-app-identified consent screen. M3 — a complete real pipeline run (real LLM/TTS/video-assembly calls, both gates approved) was driven to `publishing` with `YOUTUBE_REFRESH_TOKEN` genuinely unset (confirmed via the real env-injection log line dropping from 17 to 16 vars); the publish correctly reached Google via the migrated per-channel credential (the only code path left) but hit a real `invalid_grant` — independently confirmed, via a raw call straight to Google's own token endpoint outside this project's code, that the founder's actual token is expired/revoked at Google's end, not a bug in this task. The identical real error/cause was confirmed on the stats-poll path too. **The task's own core claim ("a real publish and stats poll succeed with the env var unset") is honestly not provable yet** — closing it needs one real founder action (a fresh Google consent via the new M2 flow), tracked as a founder-action item, not a code gap. See `reports/task5.md`. |
| 6 | Channel #2/#3 Expansion — Real Channel Creation | Done | Claude Code | N1: `channels.create` (new mutation) — `tenantId` always `ctx.tenantId` (never client-supplied), `ownerUserId` defaults to `ctx.userId` (the ops fallback leaves it unset, degrading correctly). Calls the existing, unchanged `createChannelWithCapCheck`; a `ChannelCapExceededError` is caught and re-thrown as a structured `TRPCError({code:'BAD_REQUEST'})`. `list` was checked (not assumed) to already read `ctx.tenantId` — Task 1/J3 had already caught it, confirmed by reading the file first, no fix needed. N2: `list` and a new `get` (didn't exist before this task, tenant-scoped the same way `list` is) both gained a derived `hasYoutubeCredential: boolean` via a shared `withHasYoutubeCredential` helper — a plain existence check against Task 5's `agent_credentials` table. **Real, live verification**: a genuinely fresh, isolated tenant (via Task 4's `invite-tenant.ts`) had 7 real channels created through the real API one at a time — a direct Postgres read confirmed exactly 7 rows, all active, correct `tenantId`/`ownerUserId`. An 8th real attempt got a real, structured `400 BAD_REQUEST` with the existing cap-error message; a second direct read confirmed the count stayed at exactly 7, no partial row left behind. `hasYoutubeCredential` was confirmed `false` then `true` via two real `channels.get` calls, before and after a real `AgentCredential` row was attached via `upsertForChannel` (the same call Task 5's real `/oauth2callback` route makes internally). Tenant isolation on the new `get` was also confirmed live: a genuinely separate tenant's real session got a real `404 NOT_FOUND` for the first tenant's channel. See `reports/task6.md`. |
| 7 | Retire Telegram — Real Push Notifications + In-App Digest & Tagging | Done — one real founder-action item remains | Claude Code / **Founder** (on-device push verification) | O — explicit product decision: Telegram (Week 1's testing convenience for Gate 1/2) is retired entirely, no fallback. O1: real Expo push (`User.expoPushToken`, `ExpoPushChannel` via `expo-server-sdk`, `notifications.registerPushToken`) as the channel that actually reaches someone away from the app. O2: `telegram-channel.ts`/`.test.ts`/`telegram-link.ts`/`telegram-link-code.repository.ts` deleted, `grammy` removed via a real `npm install`, `telegram_link_codes`/`User.telegramChatId` dropped by a real migration, `pending-approvals.ts` shrunk to its two channel-agnostic functions plus a new `hasPendingApproval` check, `gate2/index.ts`'s now-dead `attachmentPath`/video-size-limit logic removed, `auth/magic-link.ts`'s Telegram relay removed (console-only fallback remains). O3: found the digest was *already* migrated off the old singleton by Task 3 — this task's real remaining work was updating its own reply-instruction text and message-limit justification. O4: real `runs.tagPostHoc` mutation reusing `post-hoc-tag.ts`'s existing `recordPostHocTag` directly, replacing the deleted Telegram text-command parser. O5: full rename `notify-founder/`→`notifications/`, `FounderChannel`→`NotificationChannel`, `InAppFounderChannel`→`InAppChannel`, `composeFounderChannel`→`composeNotificationChannel` (no alias — every call site was already being touched). **Real, live verification**: a repo-wide `grep -ri telegram studio/src`/`grep -i grammy studio/package.json` both empty; a real dev-server boot reached `[boot] 7AI orchestrator ready` with no Telegram bot startup line; a complete real pipeline (no stubs) was driven through both Gate 1 and Gate 2 via `scripts/dry-run.ts`'s rewritten commands (now resolving via `resolvePendingApproval` directly instead of simulating a Telegram message), producing a real `Notification` row and advancing to `publishing` — confirmed via direct Postgres reads. A real, validly-shaped Expo push token was registered via the real API and confirmed persisted; a forced real digest send exercised `ExpoPushChannel` for real, reaching Expo's actual push API and getting back a real, specific `DeviceNotRegistered` response (proving genuine integration, not a mock) while the in-app dispatch and `lastFounderDigestSentAt` advancement both still completed correctly. A real `runs.tagPostHoc` API call produced a real `ReviewLog` row (`agent: 'founder-post-hoc'`) with the identical shape the old Telegram command produced. **What's honestly not provable without a physical device**: actual on-device push delivery confirmed against Expo's own push-receipt API — the task's own required bar, distinct from "the send call succeeded." Tracked as a founder-action item, not a code gap. See `reports/task7.md`. |

## Full detail
Per-task reports: `reports/task1.md`, `reports/task2.md`, `reports/task3.md`, `reports/task4.md`,
`reports/task5.md`, `reports/task6.md`, `reports/task7.md`.

## Open items closed by Task 1
- `MVP_PART2_MULTI_USER_AND_FLEXIBLE_CREATION.md` §1's "No `User` model exists at all" item — **closed**.
- `MVP_PART2_MULTI_USER_AND_FLEXIBLE_CREATION.md` §1's "No real per-user auth" item — **closed**.

## Open items closed by Task 2
- `MVP_PART2_MULTI_USER_AND_FLEXIBLE_CREATION.md` §1's "Gate ownership" item — **closed** (gate
  *resolution* ownership; run/channel *creation*-time ownership remains a distinct, open gap — see
  below).

## Open items closed by Task 3
- `MVP_PART2_MULTI_USER_AND_FLEXIBLE_CREATION.md` §1's "Per-user notification routing" item —
  **closed**. (Its Telegram-linking half is retired by Task 7 — see that task's row.)

## Open items closed by Task 4
- `MVP_PART2_MULTI_USER_AND_FLEXIBLE_CREATION.md` §0's "Per-tenant budget enforcement" item —
  **closed**.
- `MVP_PART2_MULTI_USER_AND_FLEXIBLE_CREATION.md` §0's "YouTube API quota" item — **investigated,
  closed with a real, cited finding** (no increase needed at the estimated volume; a real Console
  verification remains a founder action, see `KNOWN_ISSUES_AND_BLOCKERS.md` §1).

## Open items closed by Task 5
- `MVP_PART2_MULTI_USER_AND_FLEXIBLE_CREATION.md` §1's "Per-user YouTube credentials" item —
  **closed, with one real founder-action item remaining** (see below and
  `KNOWN_ISSUES_AND_BLOCKERS.md` §1).

## Open items closed by Task 6
- `SPRINT_ROADMAP.md`'s Sprint 3 "Channel #2/#3 expansion (deferred from Sprint 1)" item — **closed**.
- `week5/SPRINT1_PENDING.md`'s "7-channel cap has no automated test [against real DB fixtures]" line
  — **closed** (real, live exercise against a real API caller and real DB fixtures, not another unit
  test of the pure function).

## Open items closed by Task 7
- The real, functional gap this sprint's own Task 3 left open: in-app notifications alone are
  pull-only — nobody is actively told a gate exists unless they open the app. Task 7/O1's real push
  notifications close this (send-side proven live; on-device delivery is the one remaining
  founder-action item — see below).
- Telegram as a standing application dependency — **closed**, deleted entirely (not disabled behind a
  flag), confirmed by a repo-wide grep and a real dev-server boot with no bot startup line.
- The founder digest and post-hoc tagging's Telegram-only delivery (Sprint 2 Task 6) — **closed**,
  both now work end-to-end through the app, verified live.
- `docs/design_doc/frontend/MOBILE_APP_DESIGN.md`'s deferred "push-notification infrastructure
  choices" item — **closed**.

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
  `YOUTUBE_ANALYTICS_STUB`, `FOUNDER_DIGEST_*`, etc.), predating this task. Task 7/O2 removes the
  Telegram vars specifically; a full reconciliation of the rest is still a separate, out-of-scope
  cleanup.
- **L2 verification item — confirm the real Cloud Console quota numbers match the assumed defaults**
  — a real, quick check only the founder can do (their own Google login). See
  `KNOWN_ISSUES_AND_BLOCKERS.md` §1.
- **Performance Analytics' unbounded polling design (found during Task 4's L2)** — grows in real
  quota cost with cumulative published-video count, not daily upload volume; not urgent today, worth
  a real fix before it is. See `KNOWN_ISSUES_AND_BLOCKERS.md` §4.
- **The new-tenant default `AgentQuota.budgetCeilingUsd` ($2.00) is still unconfirmed by you** — same
  status as the founder's own original figure it reuses. See `KNOWN_ISSUES_AND_BLOCKERS.md` §4.
- **A real founder action needed to close out Task 5's own core verification claim** — the founder's
  existing YouTube refresh token is expired/revoked at Google's end (confirmed live, independent of
  this project's code — see Task 5's row above). A fresh consent via the new in-app connect flow is
  needed before a real publish/stats-poll can be proven to succeed through the new `AgentCredential`
  path. See `KNOWN_ISSUES_AND_BLOCKERS.md` §1.
- **The YouTube OAuth client's registered redirect URI needs a Console update once a real deployed
  callback URL exists** — not blocking today (local dev still works). See
  `KNOWN_ISSUES_AND_BLOCKERS.md` §1.
- **A real founder action needed to verify Task 7/O1** — real push delivery has to be checked against
  a real physical device (simulators don't deliver real push); tracked as a founder-action item the
  same way Task 4/L2 and Task 5's own remaining item are.
