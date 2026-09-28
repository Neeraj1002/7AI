# Sprint 3 Status: Multi-User / Application Layer

**Sprint status**: All 7 tasks done. Sprint 3 was marked closed after Task 6, then **reopened** for a
seventh task — now closed again, with one real founder-action item carried forward (Task 7/O1's
on-device push verification). **Reopened a second time for Task 8** — small, UI-Enhancement-1-driven
backend work (Gate 2 visibility choice, `channels.update`, `channels.archive`), filed here rather than
in Sprint 4 (a separate, larger, not-yet-started initiative) since it's unrelated in scope, but built on
its own `UIENHANCEMENT1_BE` branch rather than `SPRINT3_BE`, so it's never mistaken for a real Sprint 3
or Sprint 4 change in `git log` or the PR list. **Task 8's earlier migration-drift pause is
resolved** — a fresh `git fetch origin && git checkout main && git pull` plus a `prisma migrate status`
re-run confirmed it was a stale-checkout false alarm (the same failure mode the bugs track's worktree
hit earlier), not a real drift; `origin/main` already had the `bug_reports_add_context` migration file
the whole time. Task 8 resumed and completed R1–R3, plus one item found while implementing R3 (a
Performance Analytics archived-channel polling gap, folded into R3 as item 10/R3b rather than filed
separately — see its row below, now real, live-verified: a throwaway channel with a completed,
published run errored the poll before archiving and was untouched by it after). **PR #27 is open,
marked ready for review, build/lint/typecheck clean, `vitest` 104/104** — awaiting founder
review/merge. **Reopened a third time for Task 9** — Enhancement 2's backend work (channel settings,
watermark upload, gate toggles, brief length), same posture as Task 8: its own `UIENHANCEMENT2_BE`
branch, filed here rather than Sprint 4. **Task 9 is now fully complete** — all five R-items done,
live-verified, and pushed; PR [#32](https://github.com/Neeraj1002/7AI/pull/32) is out of draft,
ready for review. Task 8/PR #27 appears merged (the local worktree's Task 8 row now reads "Done,"
and Task 9/R1's own live verification ran against the real, merged `channels.update` shape) — not
independently re-confirmed from this chat (no live git access here); correct on sight if a future
session finds otherwise. **Reopened a fourth time for Task 10** — server/local environment config, a
runtime server-URL switcher for the app, and two Telegram token-delivery fixes, prompted by a real
preview deployment now existing (`docs/server/deployment/preview/detail.md`, Hostinger VPS,
`https://7aistudio.tech`) and a recurring real error the founder is seeing. Same posture as Tasks 8/9:
unrelated to Sprint 4's scope, own branch (`SERVERCONFIG_BE`), filed here rather than there. **Task 10
is now code-complete** — R1-R4 done, live-verified, PR [#40](https://github.com/Neeraj1002/7AI/pull/40)
ready for review — see its own row below. **Reopened a fifth time for Task 11** — UI Enhancement 3's own
backend work (Run detail's lifecycle: publish-on-approval without a restart, gate-decision/end-reason
fields, cancel a running run, run again), the direct backend counterpart to UI/UX `tasks/task6.md`, same
posture as Tasks 8/9 (own branch `UIENHANCEMENT3_BE`, filed here not Sprint 4). **Task 11 is now
code-complete** — all five R-items done, live-verified, PR [#42](https://github.com/Neeraj1002/7AI/pull/42)
ready for review — see its own row below. **Note on PR merge status**: PR #40/#42's "ready for review"
status is as recorded by the branch's own work; this chat has no live git/gh access and cannot
independently confirm either has actually landed on `main` — correct on sight if a future session
finds otherwise, same caveat already standing for PR #27/#32 above.
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
item, not asserted. Task 8 adds the three backend capabilities the UI/UX track's "UI Enhancement 1"
frontend build needs to switch on its feature flags — a per-channel Gate 2 visibility default, a real
`channels.update`, and a real `channels.archive` soft-delete — plus corrects a UI-facing claim (editing
a channel's niche *does* affect any not-yet-executed stage of an in-progress run, contrary to what the
app currently tells users) found while verifying the requirements against the actual pipeline code.
Task 9 extends `channels.update` further (style guide, voice, captions, budget override), makes the
long-stored-but-inert Gate 1/Gate 2 toggles real, adds watermark upload, and adds an optional per-run
target length. **Corrected 2026-09-26**: Task 9's original claim that no script-review auto-retry
mechanism exists (used to frame R2 as a three-way founder decision) was wrong — a fresh, independent
code read (the investigation behind Bugs Task 6) confirmed the mechanism is real and live on `main`
(Bugs Task 3/R3: threshold 7, cap 3 retries). R2's scope shrank accordingly: it's now just wiring the
`gate1Enabled` toggle onto that already-real mechanism's already-real ≥7 outcome, not building a new
retry loop from scratch. Bugs Task 6 (the feedback-notes fix and the budget-routing fix to that same
code) merged to `main` via PR #31 on 2026-09-27, clearing R2's dependency. **R2 has since been built,
live-verified against an isolated sandbox DB, and pushed** — `channels.update` gained
`gate1Enabled`/`gate2Enabled` (with the `gate2Enabled:false` → `defaultPrivacyStatus==='private'`
invariant enforced both directions), and `runScriptReviewStage`/`runVideoReviewStage` each gained a
symmetric auto-approve branch on a passing outcome only — the retry loop and cap-reached-to-Gate-1
fallback are untouched. **All five of Task 9's R-items (R1, R2, R3, R4, R5) are now complete.** See
Task 9's own row and `tasks/task9.md`/`reports/task9.md`. Task 10 (filed 2026-09-27) addresses
server/local environment config, a runtime server-URL switcher for the app, and two Telegram
token-delivery fixes — now code-complete, see its own row and `tasks/task10.md`. Task 11 (filed
2026-09-28) addresses the UI/UX track's "UI Enhancement 3" run-lifecycle backend needs
(publish-on-approval without a restart, gate-decision/end-reason fields, cancel a running run, run
again) — now code-complete, see its own row and `tasks/task11.md`. **Reopened a sixth time for Task
12** — real infra work now that testing has moved to the preview environment: the founder has real
Cloudflare R2 credentials configured (one shared bucket, `7ai-preview`) and wants generated video output
uploaded there so it can be shared with another Claude session (one without device/SSH access to the
VPS) for review/fine-tuning. Same posture as Tasks 8-11: own branch (`MEDIASTORAGE_BE`), filed here
rather than Sprint 4. **Not yet started** — see its own row and `tasks/task12.md`.
**Last updated**: 2026-09-28 (Task 10 and Task 11 both confirmed code-complete via direct code
re-verification — PR #40 and PR #42 respectively, both marked ready for review; this Project copy's
STATUS rows reconciled with the richer detail already recorded in the working checkout's own copy;
report docs for both tasks not yet written to the Project. Task 12 filed — Cloudflare R2 integration for
generated media storage.).

| Task | Name | Status | Owner | Notes |
|---|---|---|---|---|
| 1 | User Model, Tenant Signup & Session Auth | Done | Claude Code | J1: real `User`/`login_tokens` tables (migration `sprint3_users_and_login_tokens`), `role` VARCHAR+CHECK (`owner`\|`approver`), founder's `User` row seeded in the same migration (`neeraj100296@gmail.com`, `owner`). J2: `auth/` module — magic-link JWT (15 min, single-use, DB-tracked via `login_tokens.usedAt`) exchanged at `/auth/verify` for a session JWT (`userId`/`tenantId`/`role`); real link delivery via server console + the existing Telegram `founderChannel.notify()`, no new integration **(the Telegram half of this is removed by Task 7/O2 — see that task's own note on why link delivery falls back to console-only until real email exists)**. `api/trpc.ts` gained a real `Context`/`createContext`; `api/server.ts`'s auth hook now accepts a real session or the `API_AUTH_TOKEN` ops fallback. J3: full audit of `api/routers/` and `run-pipeline/` found `MVP_TENANT_ID` hardcoded in more places than the task text named (`dashboard.repository.ts`'s four functions, reached via `dashboard.ts`'s routers) — all now read `ctx.tenantId`. **Real, live verification**: a full login round trip (real `POST /auth/request-link`, real console-logged link, real `GET /auth/verify`, a real authenticated `channels.list` call resolving the real tenant), replay rejection (reused token → 401 "already used"), expiry rejection (a deliberately pre-expired token → 401 "expired"), and — the actual success criterion that matters — a **genuinely separate second tenant/user** created and logged in for real, whose real `runs.create` call produced a real `PipelineRun.tenantId` matching that second tenant (confirmed via a direct Postgres read), not `MVP_TENANT_ID`. See `reports/task1.md`. |
| 2 | Gate Ownership | Done | Claude Code | K1: `Channel.ownerUserId` (nullable FK, migration `sprint3_channel_owner`), backfilled to each tenant's seeded owner for every existing row. `assertGateOwnership` (`api/routers/runs.ts`) runs before `resolvePendingApproval` in both `gate1`/`gate2`; the actual decision is a new pure, unit-tested function, `canResolveGate` (`run-pipeline/gate-ownership.ts`): `ctx.tenantId === channel.tenantId && (ctx.userId === channel.ownerUserId \|\| ctx.role === 'owner')`. Fails closed on a null owner. **Real, live verification** — three real pipeline runs driven to a genuine pending gate1/gate2 via the real API (real LLM calls, no stubs): (1) a Tenant B session attempting Tenant A's gate → real `403 FORBIDDEN`, gate confirmed still pending afterward; (2) a different `owner`-role user on Tenant A (not the channel's specific owner) → real success; (3) the channel's actual `ownerUserId` (the founder) → real success, the regression check that matters most; (4) an `approver`-role user against a deliberately ownerless channel → real `403 FORBIDDEN` (proves fail-closed, not just "owner-role users happen to always match"); (5) an `owner`-role user against that same ownerless channel → real success (proves the fallback path). A distinct, still-open gap (`runs.create` doesn't check channel/tenant match at creation time — K1 only covers *resolution*) is documented, not silently folded into "K1 fixed ownership." See `reports/task2.md`. |
| 3 | Per-User Notification Routing | Done — Telegram half retired by Task 7 | Claude Code | K2: `Notification`/`telegram_link_codes` tables (migration `sprint3_notifications_and_telegram_linking`), the founder's own real `telegramChatId` carried over from `env.TELEGRAM_FOUNDER_CHAT_ID` in the same migration. A real `InAppFounderChannel` (writes `Notification` rows) plus `composeFounderChannel` (in-app always, Telegram only if linked) — `pending-approvals.ts` extracted so any number of channels/recipients share one pending-approval promise per `threadKey`, "first reply wins" for free. `resolveNotificationRecipients` mirrors K1's own fail-closed design for *who gets told*, not just who may resolve. A real `/link <code>` flow (`TelegramLinkCode`, `notifications.createTelegramLinkCode`/`unlinkTelegram`/`list`). **Real, live verification**: a gate for an unlinked user produced a real in-app-only `Notification` row, resolved via the API alone, `resolvedAt` set automatically; a real `/link` flow (simulated Telegram input) set a real `telegramChatId`, confirmed by a direct DB read; the founder's own real gate1 flow (real Telegram message + real simulated reply) now also writes a real in-app row that gets marked resolved via the *Telegram* path, proving cross-channel resolution actually works, not just same-channel. **Two real, live-found problems, both fixed within this task**: (1) a `/link` reply-send failure could crash the whole message handler even after the real DB write had already succeeded — fixed with a `safeReply` helper used everywhere in the handler; (2) `auth/magic-link.ts` previously relayed *every* user's login link to the founder's own Telegram — fixed to route to the requester's own linked chat instead. **Superseded by Task 7/O2**: the Telegram channel, the `/link` flow, and `telegram_link_codes`/`User.telegramChatId` are all removed — `composeFounderChannel`'s "Telegram if linked" branch becomes "push if a token is registered" (Task 7/O1), and `InAppFounderChannel`/`notify-founder/` are renamed (Task 7/O5). The in-app routing design itself (`resolveNotificationRecipients`, per-recipient dispatch, shared pending-approval promise) is unchanged and still correct. See `reports/task3.md` and `reports/task7.md`. |
| 4 | Per-Tenant Budget Provisioning + YouTube Quota Headroom Check | Done — L2 verification item | Claude Code / **Founder (L2)** | L1: `scripts/invite-tenant.ts` creates a real `Tenant` + owning `User`(`owner`) + `AgentQuota` (default $2.00/day, reusing the founder's own original, still-unconfirmed figure) in one `prisma.$transaction` — no tenant is ever left without a budget row. New `insertTenant`/transaction-capable `insertUser`/`insertAgentQuota` repository functions. **Real, live verification**: a genuinely new tenant (created via the real script) got a real `AgentQuota` row confirmed by direct Postgres read; that tenant's real owner logged in via a real magic link and submitted a real brief through the real API, which passed the real budget gate at `script_generation` (a real LLM call happened, no stub) and reached a genuine pending `gate1`, resolved by that same real owner — incidentally re-confirming Tasks 2/3's ownership and notification logic for a third independent tenant. L2: a real, live investigation (no code). Found the task's own assumed YouTube quota cost model was stale — `videos.insert` now costs ~1 unit in its own dedicated 100-calls/day bucket (a real API change in the last year, verified directly against Google's current developer docs), not ~1,600 shared units. Real estimate at a ~10-tester cadence shows comfortable near-term headroom; the real medium-term risk is Performance Analytics' own unbounded "poll every historical published video forever" design, not upload volume. This project's actual Cloud Console quota numbers couldn't be checked live (requires the founder's own Google login, confirmed no session exists) — a real, quick verification item tracked as a founder action, not a blocking quota-increase request. See `reports/task4.md`. |
| 5 | Per-Channel YouTube OAuth — `AgentCredential` + Real Connect Flow | Done — one real founder-action item remains | Claude Code / **Founder** | M1: `AgentCredential` table (migration `sprint3_agent_credentials`), AES-256-GCM encryption at rest (`models/credential-crypto.ts`, keyed off new `CREDENTIAL_ENCRYPTION_KEY`), `agent-credential.repository.ts` (`findByChannel`/`upsertForChannel`/`deleteForChannel`/`findDecryptedRefreshTokenForChannel`). M2: real in-app connect flow — `channels.getYoutubeConnectUrl` (session + ownership-checked via Task 2's `canResolveGate`, reused directly) builds the real Google consent URL with the target `channelId` signed into OAuth's `state` (a new `purpose: 'oauth-state'` JWT, same discriminator pattern as Task 1's magic-link/session tokens); `GET /oauth2callback` exchanges the code and stores the credential; `channels.disconnectYoutube` removes it — replaces the old one-time `scripts/youtube-oauth.ts` terminal script entirely. M3: all three YouTube client modules (`agents/publishing/youtube-client.ts`, `agents/performance-analytics/youtube-stats-client.ts`/`youtube-analytics-client.ts`) migrated off `env.YOUTUBE_REFRESH_TOKEN` onto per-channel `AgentCredential` lookups — structurally, no code path reads the old env var for a real call anymore. `scripts/migrate-founder-youtube-credential.ts` moved the founder's own existing token into a real `AgentCredential` row for their channel. **Real, live verification**: M1 — a direct raw-SQL column read (bypassing the repository's own decrypt path) confirmed genuine ciphertext (131 decoded bytes, no plaintext substring), and the repository's real decrypt path recovered the exact original token. M2 — a real session-authenticated call produced a real, correctly-scoped Google consent URL; navigating to it in a real browser reached Google's actual, correctly-app-identified consent screen. M3 — a complete real pipeline run (real LLM/TTS/video-assembly calls, both gates approved) was driven to `publishing` with `YOUTUBE_REFRESH_TOKEN` genuinely unset (confirmed via the real env-injection log line dropping from 17 to 16 vars); the publish correctly reached Google via the migrated per-channel credential (the only code path left) but hit a real `invalid_grant` — independently confirmed, via a raw call straight to Google's own token endpoint outside this project's code, that the founder's actual token is expired/revoked at Google's end, not a bug in this task. The identical real error/cause was confirmed on the stats-poll path too. **The task's own core claim ("a real publish and stats poll succeed with the env var unset") is honestly not provable yet** — closing it needs one real founder action (a fresh Google consent via the new M2 flow), tracked as a founder-action item, not a code gap. See `reports/task5.md`. |
| 6 | Channel #2/#3 Expansion — Real Channel Creation | Done | Claude Code | N1: `channels.create` (new mutation) — `tenantId` always `ctx.tenantId` (never client-supplied), `ownerUserId` defaults to `ctx.userId` (the ops fallback leaves it unset, degrading correctly). Calls the existing, unchanged `createChannelWithCapCheck`; a `ChannelCapExceededError` is caught and re-thrown as a structured `TRPCError({code:'BAD_REQUEST'})`. `list` was checked (not assumed) to already read `ctx.tenantId` — Task 1/J3 had already caught it, confirmed by reading the file first, no fix needed. N2: `list` and a new `get` (didn't exist before this task, tenant-scoped the same way `list` is) both gained a derived `hasYoutubeCredential: boolean` via a shared `withHasYoutubeCredential` helper — a plain existence check against Task 5's `agent_credentials` table. **Real, live verification**: a genuinely fresh, isolated tenant (via Task 4's `invite-tenant.ts`) had 7 real channels created through the real API one at a time — a direct Postgres read confirmed exactly 7 rows, all active, correct `tenantId`/`ownerUserId`. An 8th real attempt got a real, structured `400 BAD_REQUEST` with the existing cap-error message; a second direct read confirmed the count stayed at exactly 7, no partial row left behind. `hasYoutubeCredential` was confirmed `false` then `true` via two real `channels.get` calls, before and after a real `AgentCredential` row was attached via `upsertForChannel` (the same call Task 5's real `/oauth2callback` route makes internally). Tenant isolation on the new `get` was also confirmed live: a genuinely separate tenant's real session got a real `404 NOT_FOUND` for the first tenant's channel. See `reports/task6.md`. |
| 7 | Retire Telegram — Real Push Notifications + In-App Digest & Tagging | Done — one real founder-action item remains | Claude Code / **Founder** (on-device push verification) | O — explicit product decision: Telegram (Week 1's testing convenience for Gate 1/2) is retired entirely, no fallback. O1: real Expo push (`User.expoPushToken`, `ExpoPushChannel` via `expo-server-sdk`, `notifications.registerPushToken`) as the channel that actually reaches someone away from the app. O2: `telegram-channel.ts`/`.test.ts`/`telegram-link.ts`/`telegram-link-code.repository.ts` deleted, `grammy` removed via a real `npm install`, `telegram_link_codes`/`User.telegramChatId` dropped by a real migration, `pending-approvals.ts` shrunk to its two channel-agnostic functions plus a new `hasPendingApproval` check, `gate2/index.ts`'s now-dead `attachmentPath`/video-size-limit logic removed, `auth/magic-link.ts`'s Telegram relay removed (console-only fallback remains). O3: found the digest was *already* migrated off the old singleton by Task 3 — this task's real remaining work was updating its own reply-instruction text and message-limit justification. O4: real `runs.tagPostHoc` mutation reusing `post-hoc-tag.ts`'s existing `recordPostHocTag` directly, replacing the deleted Telegram text-command parser. O5: full rename `notify-founder/`→`notifications/`, `FounderChannel`→`NotificationChannel`, `InAppFounderChannel`→`InAppChannel`, `composeFounderChannel`→`composeNotificationChannel` (no alias — every call site was already being touched). **Real, live verification**: a repo-wide `grep -ri telegram studio/src`/`grep -i grammy studio/package.json` both empty; a real dev-server boot reached `[boot] 7AI orchestrator ready` with no Telegram bot startup line; a complete real pipeline (no stubs) was driven through both Gate 1 and Gate 2 via `scripts/dry-run.ts`'s rewritten commands (now resolving via `resolvePendingApproval` directly instead of simulating a Telegram message), producing a real `Notification` row and advancing to `publishing` — confirmed via direct Postgres reads. A real, validly-shaped Expo push token was registered via the real API and confirmed persisted; a forced real digest send exercised `ExpoPushChannel` for real, reaching Expo's actual push API and getting back a real, specific `DeviceNotRegistered` response (proving genuine integration, not a mock) while the in-app dispatch and `lastFounderDigestSentAt` advancement both still completed correctly. A real `runs.tagPostHoc` API call produced a real `ReviewLog` row (`agent: 'founder-post-hoc'`) with the identical shape the old Telegram command produced. **What's honestly not provable without a physical device**: actual on-device push delivery confirmed against Expo's own push-receipt API — the task's own required bar, distinct from "the send call succeeded." Tracked as a founder-action item, not a code gap. See `reports/task7.md`. |
| 8 | UI Enhancement 1 — Backend Requirements (Gate 2 Visibility, Channel Edit, Channel Archive) | **Code complete — PR #27 ready for review** | **Founder** (review + merge) | `UIENHANCEMENT1_BE` — PR [#27](https://github.com/Neeraj1002/7AI/pull/27) | R1: `runs.gate2`'s `approve` action gains an optional `privacyStatus`, resolved against a new `Channel.defaultPrivacyStatus` when omitted — corrects the confirmed-live root cause of every app-driven upload being private (`parseGate2Reply`/the pipeline's own privacy plumbing was already complete since Week 5 Task 5; only `runs.ts`'s own input was ever missing the field). R2: `channels.update` (name/niche/default privacy), reusing `disconnectYoutube`'s ownership-check pattern — also corrects a UI-facing claim: a niche edit **does** affect any not-yet-executed stage of an in-progress run (every stage re-reads the channel fresh, confirmed by direct read of `state-machine.ts`), the opposite of what the app currently tells users. R3: `channels.archive` — soft-delete, credential teardown (reuses existing `deleteForChannel`), cancels in-progress runs (releases any pending gate via the existing `resolvePendingApproval` reject path), and adds an `isActive` check inside `runPublishingStage` itself as the actual single choke point for "never uploads" (found, while researching this, that the live per-request loop doesn't drive `publishing` at all today — only a process restart's resume path does, a separate pre-existing gap, not this task's to fix). **R3 item 10 (added after R3's initial commit)**: a real gap found while implementing R3 — Performance Analytics' `runPeriodicPoll` doesn't skip archived channels, so once a channel's credential is deleted, every subsequent poll tick logs a "no connected YouTube account" error against it, forever. Folded into this same PR as a small archived-channel filter rather than a separate task, since it directly completes R3's own "cleanly retires a channel" success criterion. **R3b real, live verification**: `listCompletedRunsWithPublishedVideo` (the poll's only target source) now skips runs on an archived channel — confirmed against a throwaway channel with a completed, published run fixture: the real `runPeriodicPoll` errored on it with "no connected YouTube account" before archiving, and made no attempt on it after; existing snapshots stay readable, only new polling stops. Committed separately as `UIENHANCEMENT1_TASK8_BE_R3b`, pushed to PR #27; build/lint/typecheck clean, `vitest` 104/104. R4 (optional): a new `auth.me` tRPC query for the signed-in user's email. **Migration-drift pause resolved**: the earlier "shared dev DB has `bug_reports_add_context`, `origin/main` doesn't" blocker was a stale-checkout false alarm, not real drift — confirmed via a fresh `git fetch origin && git checkout main && git pull` and a `prisma migrate status` re-run reporting "Database schema is up to date!" (15 migrations found, no drift); `main` had the migration file the whole time. Work resumed from there and R1–R3 (plus item 10) are complete. **PR #27 is the only currently-open PR for this task**, marked ready for review with `reports/task8.md` and this row both updated by the branch itself to record R3b as fixed (not deferred). The other known residuals are unchanged and still open: the narrow publish-time race (Failure Modes, `tasks/task8.md`), the niche-edit-affects-in-progress-runs product question raised for the founder at R2, and `pipeline-runner.ts` not driving `publishing`/`analytics` live. Full detail at `tasks/task8.md`. |
| 9 | UI Enhancement 2 — Backend Requirements (Channel Settings, Watermark Upload, Gate Toggles, Brief Length) | **Code complete — all 5 R-items done, PR #32 ready for review** | **Founder** (review + merge) | `UIENHANCEMENT2_BE` — PR [#32](https://github.com/Neeraj1002/7AI/pull/32) | R1: `channels.update` extended with `styleGuide`/`defaultVoice`/`captionsEnabled`/`budgetOverrideUsd`; `captionsEnabled` routes through a new shared `updateChannelBrandAssets` read-merge-write helper so it can never clobber R3's `watermarkUrl` in the same JSON column. Live-verified: round-trip via update+get, a real `script_generation` stage's recorded input reflecting a `styleGuide` edit, and `captionsEnabled:false` on a channel with a real watermark leaving it untouched. R2 (Gate 1/Gate 2 toggles): deferred until `BUGS_TASK6` (PR #31) merged, per the doc's own instruction — confirmed merged, `main` merged into this branch (2 small additive conflicts resolved cleanly) before starting. `Channel.approvalGateConfig` gets a real write path (`gate1Enabled`/`gate2Enabled`, via a new `updateChannelApprovalGateConfig` merge helper); the `gate2Enabled:false` invariant (`defaultPrivacyStatus === 'private'`) is enforced in both directions — disabling Gate 2 on a non-private channel, and changing privacy away from `'private'` while Gate 2 is already disabled. `runScriptReviewStage` gains a `gate1AutoApprove` case on the existing ≥7 score-branch (passing-score outcome only — the below-threshold retry loop and the cap-reached-to-Gate-1 fallback are untouched); `runVideoReviewStage` gets the exact symmetric treatment for Gate 2. Both write a synthetic gate-stage row with the same shape a human approval would (so nothing downstream can tell them apart) plus a separate `system`/`auto-approve` `ReviewLog` row. Live-verified against an isolated sandbox DB (created, migrated with all 16 real migrations, dropped after use) with `reviewScript`/`reviewVideo` mocked via `vitest`'s `vi.mock` — a first attempt at mocking via a plain `tsx` script was silently inert (this project's esbuild/tsx toolchain copies a required module's exports onto a fresh object, invisible to the real code's own module reference); switching to a real `vitest` test file fixed it. All required behaviors (Gate 1 pass-through, Gate 1 retry-cap unaffected, Gate 2 pass-through, both `BAD_REQUEST` invariant checks) confirmed in one clean passing run. R3: watermark upload/serve/remove via a new REST route (`@fastify/multipart`, same binary-content precedent as `video-route.ts`, not tRPC) — live-verified genuinely end to end: a real PNG uploaded, served back byte-for-byte, rendered into a real `video_generation` run, and confirmed **actually visible** via raw-pixel inspection (not just "the route didn't error"), then removed with a second render confirming the overlay was gone. R4: `targetDurationSec` (30/45/60) on `runs.create` — found during live verification that a bare "approximately N seconds" prompt hint didn't reliably move the model (three 45s-targeted runs landed at 55-80s); fixed by also stating the equivalent word count in the prompt, re-verified across three more runs landing within ~1s of target. R5 (optional): a read-only `options.list` query, live-verified returning all 13 real voices/2 visual sources/mood tags including `'none'`. Build/lint/typecheck clean, `npm test` 108/108 passing throughout — no new unit tests added, this task's own bar is real live verification against a sandbox/dev DB. **Known residual gaps, stated plainly in the report**: inherits (doesn't fix) `pipeline-runner.ts`'s pre-existing "a live run reaching `currentStage:'publishing'` needs a process restart to actually upload" gap for the auto-approved Gate 2 path too; watermark storage is local filesystem, no object-storage migration in scope; `gate2Enabled:false` has no equivalent quality floor to Gate 1's retry-to-7 mechanism (a genuine on/off switch, not a defect this task needed to fix). Full detail at `tasks/task9.md`, report at `reports/task9.md`. |
| 10 | Server/Local Environment Config + Runtime Server Switcher + Telegram Token-Delivery Fixes | **Code complete — PR #40 ready for review** | **Founder** (review + merge; on-device R2 verification) | `SERVERCONFIG_BE` — PR [#40](https://github.com/Neeraj1002/7AI/pull/40) | R1: `studio/src/config/env.ts`'s `dotenv.config()` now branches on `NODE_ENV === 'production'` to load `.env` (server) vs. `.env.local` (local dev, unchanged) — confirmed root cause, live-verified both branches load distinct values correctly. R2: the runtime server switch already existed (SecureStore, not AsyncStorage — corrected premise); added named "Local"/"Preview" presets on the login screen, fixed the one real save-timing gap (now persists immediately on preset tap or "Done"), and wired `setApiUrl` to re-check `/health` against the new URL immediately, surfacing Bugs Task 8/R2's existing server-down screen without duplicating it. R3: Telegram login-token message is now just the raw token. R4: `runTelegramStartPollCheck`'s `getUpdates` call gets exponential retry/backoff (3s base, capped at 60s) with log-once-per-failure-streak — live-verified via a simulated 3-failure-then-recover sequence: one error logged, backed-off ticks skip silently, a real `/start` update still handled correctly on recovery. **One real mistake made and disclosed in the report**: an early R2-verification attempt booted a throwaway `studio` server against the shared dev DB, which woke real resume-on-startup logic and re-opened 8 genuinely-pending gate1 runs (likely re-sending some real notifications) before being caught and killed ~15-20s later; redone safely afterward with a bare `/health`-only stub server, no app/DB involved. **What's honestly not provable without a physical device**: R2's on-device verification (tap "Preview" on a real phone, confirm the request hits `7aistudio.tech` in the VPS's own Nginx log) — tracked as a founder-action item, not a code gap. Build/lint/typecheck clean across `studio/` and `app/`; `npm test` 108/108. Full detail at `tasks/task10.md`, report at `reports/task10.md`. |
| 11 | UI Enhancement 3 — Backend Requirements (Run Lifecycle: Publish-on-Approval, Gate Decision Fields, Cancel Running, Run Again) | **Code complete — all R-items done, PR #42 ready for review** | **Founder** (review + merge) | `UIENHANCEMENT3_BE` — PR [#42](https://github.com/Neeraj1002/7AI/pull/42) | R1/B14: `pipeline-runner.ts`'s `driveFromCurrentStage` loop gains `case 'publishing'`/`case 'analytics'` (previously stopped dead at `'publishing'` — a live Gate 2 approval never actually uploaded until the next process restart picked it up via `resume-on-startup.ts`); publishing gets a 10-minute stall guard (races the real call against a timer, doesn't cancel it — `runPublishingStage` already checkpoints `youtubeVideoId` before any re-upload, so a stalled-then-late-succeeding call is provably safe, documented as a benign self-healing race in the report). Also closes Task 9/R2's Gate-2-off auto-approve path (same loop). Live-verified: a real run driven purely through `runPipelineToNextGate` (real script-generation/video-generation, `reviewScript`/`reviewVideo` mocked to a passing outcome) reached `completed` with a real stub `youtubeVideoId`, entirely from the live request path, no restart anywhere in the test. R2/B13: `runs.get` gains `lastGateDecision` (normalizes gate1/gate2's three different raw output field names — `reason`/`privacyStatus`/`notes` — into one consistent shape) and `endReason` (string-matched off `run.lastError`'s exact strings, a real disclosed fragility). R3/B11: a new in-memory `cancellation-registry.ts` (same precedent as `pending-approvals.ts`) lets `runs.cancel` accept a genuinely `'running'` run — recorded and returned immediately, checked once per `pipeline-runner.ts` loop iteration; an in-flight stage is allowed to finish, only the next stage is refused. R4/B12: `runs.rerun` reuses a new shared `assertChannelCanRun` (same archived/not-connected checks `create` already had) against the source run's channel; found `creationOptions` was already present on `runs.get`'s response before this task (a direct `PipelineRun` field), so nothing further was needed there. R5 (optional): `runs.progress` → `{ stage, attemptNo }`, no fabricated `pct`. All five live-verified against isolated sandbox DBs with `reviewScript`/`reviewVideo`/`generateScript` mocked for determinism/speed — real stages (`video_generation`, `publishing`, `analytics`) stayed real, stub media/upload only. One real, live-found nuance in R3's own verification: `currentStage` can legitimately still read `'video_review'` after a mid-flight cancel (the in-flight stage's own normal completion write isn't discarded, per the task's own instruction) — the real proof the loop stopped is that `video_review`'s own function was never called, not that field's text; an initial, stricter test assertion was wrong and corrected once the real result showed why. Full detail at `tasks/task11.md`, report at `reports/task11.md`. |
| 12 | Generated Media Storage — Cloudflare R2 Integration | **Not started** | — | `MEDIASTORAGE_BE` (not yet created) | Filed 2026-09-28. The founder has real R2 credentials already configured in both `studio/.env.local` (local) and `studio/.env` (preview VPS) — one shared bucket, `7ai-preview` — but nothing in code reads them yet: confirmed by direct read of `package.json` (no S3/R2 SDK dependency exists) and `env.ts` (no `R2_*` fields in its schema, so the real values in the env files are currently invisible to the app). R1: new `studio/src/storage/r2-client.ts` (same provider-boundary pattern as `youtube-client.ts`), `@aws-sdk/client-s3`/`@aws-sdk/s3-request-presigner` as new dependencies, `R2_*` env wiring (optional, graceful-degradation posture matching `TELEGRAM_BOT_TOKEN`). R2: best-effort upload of each completed `video_generation` attempt to R2, hooked in *after* `state-machine.ts`'s existing stage-completion transaction (confirmed exact line: `completeStage(...)` at line 946) so an R2 outage can never block or slow the actual pipeline — same isolation shape `runPublishingStage`'s own cover-frame/thumbnail-set step already established. Object keys namespaced by `NODE_ENV` (`videos/<env>/<tenantId>/<runId>/<attempt>.mp4`) specifically so local test runs never collide with real preview uploads in the one shared bucket — a deliberate decision, not an oversight. R3: `runs.getVideoUrl({ runId, attemptNumber? })` mints a fresh 24h presigned R2 URL on demand — this is the actual mechanism for sharing a generated video with another Claude session that has no device/SSH access to the VPS. R4 (optional): a cheap `hasR2Video` flag on `runs.get`. Watermark storage and the YouTube-publish path are explicitly untouched (out of scope, per Task 9's own prior "local filesystem only" note and this task's own boundary). Full detail at `tasks/task12.md`. |

## Full detail
Per-task reports: `reports/task1.md`, `reports/task2.md`, `reports/task3.md`, `reports/task4.md`,
`reports/task5.md`, `reports/task6.md`, `reports/task7.md`, `reports/task8.md`, `reports/task9.md`.
Task 10's report (`reports/task10.md`) and Task 11's report (`reports/task11.md`) are referenced by
name in the local checkout's own STATUS.md as already written, but neither has been synced to this
Project yet — flagged, not fabricated; ask the hot-fixer session or founder for the actual report
content before this Project's copy claims either exists.

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

## Open items Task 8 closed
- The UI/UX track's "UI Enhancement 1" three backend-gated feature flags (Gate 2 visibility picker,
  channel edit, channel archive) — see `docs/execution/ui-ux/tasks/task1.md`. Code-complete on PR #27,
  awaiting founder merge.
- A found-not-assigned defect: every app-driven Gate 2 approval currently uploads private regardless of
  founder intent (R1). Fixed.

## Open items Task 9 closed
- The UI/UX track's "UI Enhancement 2" backend-gated feature flags (`channelSettings`,
  `watermarkUpload`, `gateToggles`, `briefLength`) — see `docs/execution/ui-ux/tasks/task2.md`. All
  five R-items code-complete, live-verified, pushed to `UIENHANCEMENT2_BE`; PR #32 ready for review.
- `KNOWN_ISSUES_AND_BLOCKERS.md` §5's "Video Generation's watermark/brand overlay ... untested" item —
  **closed**, R3 gave it its first real, live exercise (a real PNG rendered and confirmed visible via
  raw-pixel inspection, then removed and confirmed gone).
- `Channel.approvalGateConfig` going from stored-but-inert to actually read by the state machine —
  **closed** by R2, built directly on top of Bugs Task 3/6's already-real auto-retry mechanism once
  Bugs Task 6 (PR #31) merged.

## Open items Task 10 closed
- The `.env`/`.env.local` env-loading gap blocking the preview VPS from ever picking up its own
  server-side environment — **closed** by R1 (`studio/src/config/env.ts` now branches on
  `NODE_ENV === 'production'`).
- The Telegram login-token message's extra wording (not copy-paste friendly) — **closed** by R3.
- The recurring unhandled `getUpdates threw` / `SocketError` error in `runTelegramStartPollCheck` —
  **closed** by R4 (exponential retry/backoff).
- Named server presets + save-on-change for the app's already-existing runtime server switcher —
  **closed** by R2, pending the founder's own on-device confirmation (see below).

## Open items Task 11 closed
- The UI/UX track's "UI Enhancement 3" run-lifecycle backend needs (see
  `docs/execution/ui-ux/tasks/task6.md`, B11-B14) — all four required items plus the optional R5 are
  code-complete.
- **`pipeline-runner.ts` not driving `publishing`/`analytics` stages in the live request path** (open
  since Task 8/R3's investigation, inherited by Task 9/R2) — **closed** by R1/B14.

## Open items carried forward
- **Run/channel creation-time tenant ownership isn't checked** — `runs.create` validates the target
  `channelId` exists but not that it belongs to the caller's own tenant; a signed-in user's session
  could today create a run against *any* tenant's channel if they knew its id. Distinct from Task 2's
  gate-*resolution* fix (K1 stops a wrong-tenant user from approving that run's gates afterward, not
  from creating it). Real, live-demonstrated (not hypothetical) — see `KNOWN_ISSUES_AND_BLOCKERS.md`
  §3. **Now closed** — see the 2026-09-22 hardening note below.
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
  cleanup. Not confirmed whether Task 10/R1 folded this in while `.env.example`/`.env`/`.env.local`
  were already open — worth checking once Task 10's report is available.
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
  callback URL exists** — a real, live-blocking instance of this hit 2026-09-28 (a private-IP
  `redirect_uri` rejected by Google); tracked now as Bugs Task 5, not just a someday item. **A real
  candidate URL now exists** — the preview VPS's own `YOUTUBE_REDIRECT_URI=https://7aistudio.tech/oauth2callback`
  (`docs/server/deployment/preview/detail.md` §6) — Bugs Task 5's remaining blocker (migrating the
  OAuth client from "Desktop app" to "Web application" type) is what would actually let this URL be
  registered. See `KNOWN_ISSUES_AND_BLOCKERS.md` §1 and `docs/execution/bugs/tasks/task5.md`.
- **A real founder action needed to verify Task 7/O1** — real push delivery has to be checked against
  a real physical device (simulators don't deliver real push); tracked as a founder-action item the
  same way Task 4/L2 and Task 5's own remaining item are.
- **Task 8's own known residual gap (once implemented)** — a narrow race between
  `runPublishingStage`'s own `isActive` check and its actual upload call is not fully closed by this
  task (see `tasks/task8.md`'s Failure Modes section); accepted as a rare, low-severity gap rather than
  built around with a DB-level lock.
- **Task 8's PR #27 appears merged** — the local worktree's own Task 8 row now reads "Done," and Task
  9/R1's real live verification ran successfully against the actual merged `channels.update` shape,
  which only makes sense if PR #27 landed. Not independently re-confirmed from this chat (no live git
  access here) — correct on sight if a future session finds otherwise. See the Task 8 row above.
- **Task 9's PR #32 is open, ready for review, awaiting founder review/merge** — all five R-items
  (R1/R2/R3/R4/R5) are code-complete and live-verified. Known residual gaps, none blocking: inherits
  (doesn't fix) `pipeline-runner.ts`'s live-loop-doesn't-drive-`publishing` gap for the new auto-approved
  Gate 2 path; watermark storage is local filesystem only; `gate2Enabled:false` has no equivalent quality
  floor to Gate 1's retry-to-7 mechanism. See the Task 9 row above and `tasks/task9.md`/`reports/task9.md`.
- **Task 10's PR #40 is open, ready for review, awaiting founder review + on-device R2 verification**
  — R1-R4 code-complete and live-verified where verifiable without a physical device; R2's actual
  on-device confirmation (tapping "Preview" on a real phone, confirming the request hits
  `7aistudio.tech`) is a founder-action item, not a code gap. See the Task 10 row above and
  `tasks/task10.md`.
- **Task 11's PR #42 is open, ready for review, awaiting founder review/merge** — all five R-items
  (R1-R5) code-complete and live-verified against isolated sandbox DBs. See the Task 11 row above and
  `tasks/task11.md`.
- **Neither Task 10's nor Task 11's report doc (`reports/task10.md`, `reports/task11.md`) has been
  synced to this Project yet**, even though the local checkout's own STATUS.md references them as
  already written — flagged for the founder/hot-fixer session to share, not fabricated here.
- **Task 12 (Cloudflare R2 integration for generated media storage) is filed and not yet started** —
  see the Task 12 row above and `tasks/task12.md`.

## Frontend tasks (`SPRINT3_FE`, `app/` — separate repo, `D:\Study Material\7AI-frontend`)

**Frontend track status**: all three Sprint 3 frontend tasks done — `SPRINT3_FE` marked ready for
review (existing PR, not merged, per `TASK_TEMPLATE.md`'s Git Workflow), one real founder-action item
carried forward (Frontend Task 3/FE11's on-device push verification, the frontend-side mirror of
backend Task 7/O1's own identical carried-forward item).

Full detail lives in the frontend track's own ongoing tracker, `docs/execution/frontend/STATUS.md` —
summarized here for sprint-level visibility alongside the backend rows above. `SPRINT3_FE` merged
`origin/SPRINT3_BE` (all 7 backend tasks) on 2026-09-21, so `app/`'s tRPC type import now resolves
against the real backend router directly — the throwaway test-backend worktree Task 1 needed is no
longer necessary from Task 2 onward.

| Task | Name | Status | Owner | Notes |
|---|---|---|---|---|
| Frontend 1 | Real Sign-In (Magic Link) | Done | Claude Code | Real E2E proof against a live backend (a throwaway worktree pinned to this branch's Task 7 commit, `de673b4`, once Task 6's pinned commit turned out stale against the live DB — see below): manual-paste and deep-link sign-in, replay rejection, expiry rejection, sign-out — all real, all cross-checked against Postgres. Found the task spec's own "exposed as a tRPC procedure" claim was inaccurate (`/auth/*` are plain REST routes, confirmed by reading `api/server.ts`). **A real, live mid-migration collision was hit and worked around, not a bug in this task**: `/auth/request-link` first failed with a real Prisma `P2022` (`users.telegramChatId does not exist`) because the shared dev DB already had Task 7's own migration applied live, ahead of the Task-6 commit this track's test-backend was initially pinned to — resolved by switching that throwaway worktree to this track's own real (then-unpushed) Task 7 commit, not by patching anything. The `origin/SPRINT3_BE` merge itself was blocked by a permission classifier at the time and worked around for this task (it needed no tRPC types); retried successfully once Task 2 needed it for real — see the merge note above. See `docs/execution/sprint3/reports/frontend-task1.md`. |
| Frontend 2 | Channels Screen — Create, View, Connect YouTube | Done | Claude Code | Real channel creation, the real 7-channel cap boundary (created up to 7 through the app, an 8th attempt showed the real cap-exceeded message, a direct Postgres read confirmed the count stayed at exactly 7), and real Connect/Disconnect controls driven by `hasYoutubeCredential`. **Real OAuth verification, same honest limit backend Task 5/M2 already established**: the real connect URL was independently fetched and navigated to directly, reaching Google's actual, correctly-app-identified consent screen (`"Sign in to continue to 7AI"`) — completing a real Google login is out of scope for this agent the same way it was for the backend task. `hasYoutubeCredential` flipping true/false was proven via the app's own UI using the same `upsertForChannel` technique Task 6's own report already established as legitimate (bypassing only the human-gated consent step, not anything this task owns). **A real, pre-existing environment gap found, not a bug in this task**: `getYoutubeConnectUrl`'s real `redirect_uri` points at port 3000, but `/oauth2callback` only exists on the API server's own port 4000 — nothing in this dev environment would actually catch a real Google redirect today, independent of anything the frontend does. Test channels created to exercise the cap boundary were deactivated afterward to leave the tenant with real headroom, not maxed out as a side effect of testing. See `docs/execution/sprint3/reports/frontend-task2.md`. |
| Frontend 3 | In-App Notifications + Real Push Registration + Post-Hoc Tagging | Done — one real founder-action item remains | Claude Code / **Founder** (on-device push verification) | FE10: real Notifications screen (`notifications.list`), a pending `approval_request` row reusing the exact same `GateActionBar` Run Detail already uses. **Real, live verification**: a genuine `paused_gate1` run's notification was resolved via this screen's own controls; a direct Postgres read confirmed the real advance to `status: running`/`currentStage: video_generation`. FE12: a post-hoc tagging form on Run Detail, shown only once a run is `completed`/`failed`. **Real, live verification**: a new tag submitted through the app produced a real `ReviewLog` row (`agent: "founder-post-hoc"`), Postgres-confirmed, coexisting with a pre-existing tag rather than replacing it (same allow-multiple-tags behavior the old Telegram flow always had). **A real spec-vs-implementation mismatch found and deliberately deviated from**: the spec describes a tag picker "constrained to a real tag vocabulary," but `post-hoc-tag.ts` (read directly, not assumed from the spec's description) enforces none — free text is accepted by design. Quick-pick suggestion chips replace the imagined constrained picker. FE11': real push registration wired into sign-in (`expo-notifications`, `notifications.registerPushToken`), with a tap handler deep-linking a push straight to the relevant run. **Verified up to the physical-device boundary**: a real sign-in on web showed the `Platform.OS === 'web'` skip guard firing live (no native push support in a browser, by design); the server endpoint itself was independently proven with a real session token (a real, if fake-valued, push token round-tripped through Postgres, then cleared). **Real on-device push delivery could not be verified** — no physical device available in this environment, the same honest limit backend Task 7/O1's own send-side verification already hit; tracked as a founder-action item, not asserted or faked. See `docs/execution/sprint3/reports/frontend-task3.md`. |

Frontend reports: `docs/execution/sprint3/reports/frontend-task1.md`, `docs/execution/sprint3/reports/frontend-task2.md`, `docs/execution/sprint3/reports/frontend-task3.md`.

## 2026-09-22 — Hardening: run creation-time tenant ownership check

Not a new numbered Sprint 3 task (the sprint's own 1-7 numbering is done; reopening a third time for
a one-line authorization check would overstate its size) — a direct follow-on to Task 2 (K1), closing
the matching gap Task 2 explicitly deferred at the time: `runs.create` now checks
`channel.tenantId === ctx.tenantId` immediately after its existing not-found check, reusing
`assertGateOwnership`'s own `FORBIDDEN` shape/message convention. Landed on `SPRINT3_BE` (still open,
unmerged, at the time this fix started). **Real, live verification**: a genuinely separate second
tenant's session (reused from earlier Sprint 3 testing, not created fresh) attempting `runs.create`
against the first tenant's real channel got a real `403 FORBIDDEN`; a direct Postgres read confirmed
zero `PipelineRun` rows exist for that attempt. Both regression checks — the same second tenant
against its own channel, and the first tenant against its own channel — still succeeded normally. See
`reports/hardening-tenant-check.md` and `KNOWN_ISSUES_AND_BLOCKERS.md` §3 (now closed).
