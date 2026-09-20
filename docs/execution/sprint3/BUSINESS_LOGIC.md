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

## Task 4 — Per-tenant budget provisioning + YouTube quota headroom check (L1/L2)

### What this task implements
L1 closes a real gap in tenant-creation's postconditions: before this task, "a `Tenant` exists" did
**not** guarantee "a brief submitted against this tenant can pass the budget gate" — exactly one
`AgentQuota` row had ever existed (the founder's own, seeded by hand in Week 2 Task 4), so every
other tenant hit `NoBudgetConfiguredError` on its first real brief. `scripts/invite-tenant.ts` now
creates a `Tenant` + owning `User` + `AgentQuota` in one `prisma.$transaction` — after this task, a
`Tenant` unconditionally has a corresponding `AgentQuota` row before it can exist at all.
`week2/BUSINESS_LOGIC.md`'s existing cost-gate transition (`isBudgetAvailable`,
`computeChannelBudgetCeilings`) is completely unchanged — this task only fixes *seeding*, never
touches the enforcement math itself.

L2 is a real, live investigation with no code changes — see the findings below.

### Preconditions
L1: a new `Tenant` + owning `User` is being created via the real invite script (not a public signup
form — Task 1's own note already deferred self-serve creation).

### Postconditions
L1: every `Tenant` row has a corresponding `AgentQuota` row for `'youtube'` from the moment it's
created — verified live: a genuinely new tenant's first real brief submission passed the real budget
gate at `script_generation` (the actual, real LLM call happened, not a stub) and reached a genuine
pending `gate1`, resolved by that tenant's own real owner — incidentally also re-confirming Task 2/3's
ownership and notification-routing logic for a third, independent real tenant.

### Failure Modes & Handling
If any of the three inserts (`Tenant`/`User`/`AgentQuota`) fails, the whole transaction rolls back —
`invite-tenant.ts`'s own pre-check (`findUserByEmail`) also refuses to create a duplicate account for
an email that already has one, failing loudly before the transaction even starts rather than after.

### L2 — real findings, not an estimate from documentation alone

**The task's own assumed cost model is stale — a real, live, primary-source-verified finding.** The
task text cited "a real upload (Publishing) costs roughly 1,600 units... all draw from one shared
pool." Live research against Google's own current developer documentation
(`developers.google.com/youtube/v3/determine_quota_cost`, fetched directly, not summarized secondhand)
found this changed twice in the last year: `videos.insert`'s cost dropped from ~1,600 to ~100 units on
2025-12-04, then on 2026-06-01 it moved into its **own dedicated 100-calls/day bucket**, entirely
separate from the shared daily pool. `search.list` (not used by this project) got the same treatment.
Every new Google Cloud project's real default allocation today is: **100 `videos.insert` calls/day**
(its own bucket) + **100 `search.list` calls/day** (its own bucket, unused here) + **10,000 units/day**
shared across every other endpoint.

**This project's own real endpoint usage** (confirmed by grep, not assumed): `videos.insert` (Publishing,
1 unit, dedicated bucket), `thumbnails.set` (Publishing, Sprint 2 Task 5, ~50 units, shared pool),
`videos.list` (Performance Analytics stats polling, 1 unit, shared pool, `youtube-stats-client.ts`).
The YouTube Analytics API (retention curves, Sprint 2 Task 4) is a separate product with its own
separate quota, unaffected by any of this — already tracked as blocked on G1.

**Real estimate at a realistic ~10-tester, 1-2-uploads/day/tester cadence**: uploads (10-20/day)
are trivially within the dedicated 100/day bucket — genuinely zero risk, contrary to the task's own
stale assumption. Thumbnails (10-20/day × ~50 units) cost 500-1,000 units/day from the shared pool.
Stats polling is the one real, non-obvious cost driver: `runPeriodicPoll` (`performance-analytics/index.ts`)
polls **every** completed run with a published video, every tick (`ANALYTICS_POLL_INTERVAL_MS`,
default 6h = 4 ticks/day) — unbounded, not just recent videos. At ~300 accumulated published videos
(roughly 3-4 weeks at the above cadence), that's already ~1,200 units/day and grows without bound as
more videos accumulate, independent of daily upload volume. Combined near-term estimate: roughly
1,500-2,200 units/day against a 10,000/day shared ceiling — comfortable headroom today, but the
**unbounded polling design**, not upload volume, is the real medium-term risk worth a design fix
(e.g. stop polling a video once its metrics have likely stabilized) before it becomes a real quota
problem.

**What could not be verified live**: the *actual* current quota ceiling/usage for this specific
Google Cloud project (console.cloud.google.com's Quotas page requires the founder's own Google login
— confirmed live via the Browser tool that no authenticated session exists here, and entering
credentials on the founder's behalf is out of scope regardless). This task's own estimate assumes the
documented *default* allocation above; if this project's real console numbers differ (a prior
increase, a prior restriction), the estimate should be re-checked against them. No quota-increase
request was filed — the real math above doesn't call for one yet, and the task's own text explicitly
allows this conclusion. Founder action tracked in `KNOWN_ISSUES_AND_BLOCKERS.md` §1: a real 2-minute
Console check to confirm the actual numbers match the assumed defaults, not a blocking request.

### Reference
`week2/BUSINESS_LOGIC.md` Section 2 — the existing cost-gate transition, unchanged by this task.
`week5/BUSINESS_LOGIC.md`'s C2/C4 sections — the existing per-channel fairness math this task's
seeding feeds, also unchanged. `week1/reports/task7-youtube-setup.md` — the "don't discover the
ceiling live, file early" lesson this task's own L2 applies proactively (concluding, this time, that
early filing isn't actually warranted by the real numbers).

## Task 5 — Per-channel YouTube OAuth: `AgentCredential` + real connect flow (M1-M3)

### What this task implements
Three previously-independent `getOAuthClient()` functions (`agents/publishing/youtube-client.ts`,
`agents/performance-analytics/youtube-stats-client.ts`, `.../youtube-analytics-client.ts`) each move
from reading a single, shared `env.YOUTUBE_REFRESH_TOKEN` to resolving a real, per-channel,
encrypted `AgentCredential` row via `findDecryptedRefreshTokenForChannel(channelId)`. No new
`PipelineRun`/`PipelineStage` states — `runPublishingStage` and Performance Analytics' poll function
each gain one new lookup ahead of their existing YouTube-calling logic; every existing transition and
failure-classification path (`mapGoogleError`, `classifyAnalyticsError`) is unchanged, only where the
credential itself comes from changes. `YOUTUBE_CLIENT_ID`/`YOUTUBE_CLIENT_SECRET` stay env vars —
they identify the shared OAuth **application**, not a per-channel token.

**M2 — a real in-app connect flow replaces the one-time CLI script.** `channels.getYoutubeConnectUrl`
(session-authenticated, ownership-checked via Task 2's own `canResolveGate` — reused directly, not
reimplemented, since connecting a credential is at least as sensitive as resolving a gate) builds the
same `generateAuthUrl` call `scripts/youtube-oauth.ts` already used (`youtube.upload`,
`youtube.readonly`, `access_type: offline`, `prompt: consent`), with the target `channelId` encoded
into OAuth's `state` parameter as a signed, short-lived (10 min) JWT — a new `purpose: 'oauth-state'`
token sharing `JWT_SECRET` with the existing magic-link/session tokens but never interchangeable with
either, same `purpose`-discriminator convention Task 1 (J2) established. `GET /oauth2callback`
(exempted from the session-auth hook, since a real Google redirect can never carry our own
`Authorization` header) verifies the state token and calls `upsertForChannel`. `channels.disconnectYoutube`
(same ownership check) calls `deleteForChannel` — the design doc's own explicit "clear disconnect path"
requirement, which existed in no form before this task.

### Preconditions
A channel attempting a real (non-stub) publish or stats poll must have a real `AgentCredential` row —
a channel created without one fails the same way `getOAuthClient()` already failed today for missing
env vars, just scoped per-channel now instead of globally (Task 6/O covers surfacing this state to
the UI).

### Postconditions
`uploadVideoViaProvider`/`fetchVideoStats`/`fetchRetentionCurve` always resolve their `OAuth2Client`
from a specific channel's own credential — there is no code path left that reads
`env.YOUTUBE_REFRESH_TOKEN` inside any of the three client modules once this task lands (the env var
itself stays declared in `config/env.ts` only because `scripts/migrate-founder-youtube-credential.ts`
still reads it, once, for the migration itself).

### Failure Modes & Handling
A channel with no `AgentCredential` row fails with a clear, specific `NonTransientStageError` ("has no
connected YouTube account") — never a generic auth error. Verified live in the mocked-client test
suite (`youtube-client.test.ts`'s new "throws a clear, specific error..." case) and structurally: the
new code path has no fallback to fall back *to*.

### Real, live verification — and a real, external finding that changes what M2/M3 could prove

**M1 (encryption at rest) — fully verified live, PASS.** The founder's own real
`YOUTUBE_REFRESH_TOKEN` was migrated via `scripts/migrate-founder-youtube-credential.ts` into a real
`AgentCredential` row for their channel (`5c6312d5-...`). A direct raw-SQL read of
`refreshTokenEncrypted` (bypassing the repository entirely) confirmed genuine ciphertext — see
`sprint3/SCHEMA.md`'s Task 5 section for the exact byte-level detail. The repository's own decrypt
path (`findDecryptedRefreshTokenForChannel`) was separately confirmed to recover the *exact* original
plaintext token.

**M2 (real browser OAuth round trip) — connect-URL generation verified live and correct; the actual
consent completion is founder-blocked, confirmed live, not assumed.** A real session token was signed
for a real second tenant's real owner user, used to call the real `channels.getYoutubeConnectUrl`
query against a running dev server, and produced a real, correctly-shaped Google consent URL: correct
`client_id`, correct two scopes, correct signed `state`, `redirect_uri` matching `.env.local`.
Navigating to that exact URL in a real browser reached Google's real, live consent screen —
`"Sign in to continue to 7AI"` — confirming the app identity and OAuth wiring are genuinely correct
end-to-end up to that point. **Completing the round trip requires a real human to sign in with a real
Google account and click Allow** — categorically something this agent must not do on the founder's
behalf (entering account credentials is out of scope regardless of who's asked). This is the same
"confirm the blocker live, don't assume it" posture Task 4's L2 already established for the Cloud
Console check.

**M3 (the env-var-retirement regression check) — the code migration is fully verified; the task's own
core claim ("a real publish and a real stats poll succeed with the env var unset") is honestly **not**
provable right now, for a real, external, non-code reason.** A complete real pipeline run (real
Anthropic script-gen/review calls, real OpenAI TTS, real video assembly, both gates approved) was
driven all the way to `publishing`, with `YOUTUBE_REFRESH_TOKEN` genuinely commented out of
`.env.local` for the whole run (confirmed by `dotenvx`'s own "injected env (16)" log line, one fewer
than the usual 17). The publish correctly reached Google using the migrated, decrypted, per-channel
credential — there is no other code path it could have reached, since M3 removed the env-var read
entirely — but failed with a real Google `invalid_grant` / *"Token has been expired or revoked."*
error. **Independently confirmed, outside this project's own code entirely**: a raw `curl` POST of the
founder's exact plaintext refresh token straight to `https://oauth2.googleapis.com/token` produced the
identical `invalid_grant` response. This proves the failure is a genuinely expired/revoked credential
at Google's own end (most likely: this OAuth client is still in Google's "Testing" publishing status,
where test-user refresh tokens expire after a fixed window) — **not** a bug in this task's migration,
and not evidence the new `AgentCredential` path doesn't work. The identical real error, for the
identical real reason, was also confirmed on the stats-poll path (`runPeriodicPoll` against the same
channel). Because the failure occurs at the OAuth token-refresh step itself (`OAuth2Client.refreshTokenNoCache`,
confirmed from the real stack trace), **no request ever reached YouTube's actual upload endpoint** —
no real video was uploaded as a side effect of this test.

**What this leaves open, honestly**: the task's own success criterion #3 ("a real publish and a real
stats poll... both succeed") is not met today. What *is* proven: the new path is genuinely what's
reached (structurally, not just "probably" — the old code no longer exists), the correct
channel-specific credential is correctly resolved and decrypted, and the one remaining blocker (a
fresh, valid refresh token) requires the exact same founder action M2 is already blocked on — a real
human completing Google's consent screen once, for the founder's own channel, via the new M2 browser
flow this task just built. No further code changes are anticipated to be needed once that happens;
this is tracked as a founder-action item, not a code gap, in `KNOWN_ISSUES_AND_BLOCKERS.md` §1.

### Reference
`week1/SCHEMA.md`/`week4/SCHEMA.md`'s original `AgentCredential` deferral note — this task is that
deferred work. `sprint3/BUSINESS_LOGIC.md`'s own Task 1 (J2) `purpose`-discriminator JWT pattern,
reused verbatim for the new `oauth-state` token type. Task 2 (K1)'s `canResolveGate` — reused
directly (not reimplemented) for M2's connect/disconnect ownership check. Task 4's L2 — the
established "confirm a founder-only blocker live via the Browser tool, don't assume it" precedent
this task's M2/M3 verification both follow.
