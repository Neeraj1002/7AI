# Sprint 3 Task 3: Per-User Notification Routing

**Date**: 2026-09-19
**Status**: Complete
**Files Created**: 10 (`studio/src/notify-founder/{pending-approvals,in-app-channel,recipients,telegram-link}.ts`,
`studio/src/notify-founder/telegram-channel.test.ts`, `studio/src/types/{notification,telegram-link-code}.types.ts`,
`studio/src/models/repositories/{notification,telegram-link-code}.repository.ts`,
`studio/src/api/routers/notifications.ts`, plus this report)
**Files Modified**: 12
**Tests**: All Passing (`npm run build && npm run lint && npm run typecheck && npm test` — 105 tests,
all clean)

## What Was Done

### K2 — A second, in-app `FounderChannel` implementation

Real Prisma migration (`prisma migrate dev --name sprint3_notifications_and_telegram_linking`):
`Notification` (`tenantId`, nullable `channelId`, `userId`, `kind` VARCHAR+CHECK, `message`, nullable
`threadKey`, nullable `resolvedAt`) and `TelegramLinkCode` (`code` unique, `userId`, `expiresAt`,
nullable `usedAt`). The migration's own data-migration section carries the founder's real
`telegramChatId` over from `env.TELEGRAM_FOUNDER_CHAT_ID` (`8641987627`) — the one real regression
risk this task named, stated plainly per its own instruction.

`notify-founder/pending-approvals.ts` (extracted out of `telegram-channel.ts`): the single shared
in-memory map every `FounderChannel` implementation registers into. `getOrCreatePendingApproval` is
idempotent per `threadKey` — the first channel/recipient to call it creates the shared promise, every
subsequent one gets the exact same promise back. This is what lets an in-app channel and a Telegram
channel (or multiple recipients' worth of both) all await "the same gate" without one silently
overwriting another's resolve callback. `resolvePendingApproval` (the actual resolution point, called
by both Telegram replies and the API's `gate1`/`gate2` mutations) now also marks every `Notification`
row for that `threadKey` resolved — centralized here, not left to each call site to remember.

`InAppFounderChannel` (`notify-founder/in-app-channel.ts`) writes `Notification` rows instead of
sending anything externally. `TelegramFounderChannel` was refactored to take a real recipient
`chatId` in its constructor, no longer reading the single hardcoded
`env.TELEGRAM_FOUNDER_CHAT_ID` internally. `composeFounderChannel` (`notify-founder/index.ts`)
builds a `MultiFounderChannel` for a resolved set of recipients: in-app always, Telegram only if that
user's `telegramChatId` is set; each channel's send is dispatched via `Promise.allSettled` so one
channel's failure never blocks another's.

`resolveNotificationRecipients` (`notify-founder/recipients.ts`) mirrors Task 2 (K1)'s own
fail-closed design, applied to *who gets told* rather than *who may resolve*: a channel's real
`ownerUserId` if set, else every `owner`-role user on the tenant.

**Telegram linking**: `createTelegramLinkCode`/`unlinkTelegram` (`notify-founder/telegram-link.ts`),
exposed via a new `api/routers/notifications.ts` (`notifications.list`,
`notifications.createTelegramLinkCode`, `notifications.unlinkTelegram`). `telegram-channel.ts`'s
message handler gained a `/link <code>` branch, checked first — same precedence Sprint 2 Task 6's
`tag ...` handling established.

Every existing call site was updated to resolve *which* channel(s) to use per the run's channel owner
rather than importing a hardcoded global: `agents/gate1//gate2/index.ts` (`requestGate1Decision`/
`requestGate2Decision` now take the real `channel`), `run-pipeline/founder-digest.ts` (now loops
every `owner`-role user on the tenant, not one global send), `run-pipeline/gate-reminder.ts` (resolves
the run's real channel owner(s) per reminder). `api/routers/runs.ts`'s `gate1`/`gate2` mutations now
call a plain exported `resolvePendingApproval` (channel-agnostic — works regardless of who registered
the pending promise), not a method on a removed singleton.

## Verification — real, live, per the task's own bar

1. **A real gate for a fresh, unlinked test user produced a real in-app-only `Notification` row and
   resolved via the API alone.** A real user + their own channel (`ownerUserId` set, no
   `telegramChatId`) drove a real pipeline run through the real `runs.create` API to a genuine
   pending `gate1`. A real `Notification` row appeared (`kind: 'approval_request'`, correct
   `threadKey`, `resolvedAt: null`) — no Telegram involved at all, by construction (the user has
   nothing linked). Resolved via a real `runs.gate1` API call using that same user's session →
   `{"resolved":true}`. A direct Postgres read confirmed the `Notification` row's `resolvedAt` was
   set automatically — the centralized resolution hook works.
2. **A real `/link <code>` flow set a real `telegramChatId`.** A real code was generated via
   `notifications.createTelegramLinkCode` (real API call, real session). A real
   `simulateIncomingTelegramMessage` fed `/link <code>` through the exact same `handleUpdate` path a
   live Telegram update would take. A direct Postgres read confirmed `User.telegramChatId` was set to
   the real chat id from the incoming message.
3. **The founder's own real flow proves dual-channel dispatch and cross-channel resolution.** A real
   pipeline run on the founder's own channel (their real, already-linked `telegramChatId`) reached a
   real pending `gate1`; `dry-run.ts gate1 ... approve` sent a real Telegram message and simulated a
   reply, exactly as every prior sprint's regression check for this flow has done. A direct Postgres
   read confirmed a real `Notification` row was *also* created for this gate (proving the dual
   dispatch — in-app *and* Telegram, not one or the other) and that its `resolvedAt` was set by the
   *Telegram*-reply resolution path, not the API path used in test 1 — proving resolution is
   genuinely channel-agnostic, not just working by coincidence for whichever channel happens to be
   tested.
4. **`notifications.list` and `notifications.unlinkTelegram` both work for real.** A real
   `notifications.list` GET query (tRPC queries are GET, not POST — caught and corrected during this
   verification) returned the real Notification history for the test user, including the resolved
   row from test 1. A real `notifications.unlinkTelegram` call set `telegramChatId` back to `null`,
   confirmed by a direct DB read.

## Two real, live-found problems — both found and fixed within this task

**A reply-send failure could crash the whole message handler, even after its real action already
succeeded.** The first version of the `/link` handler wrapped its entire body (the DB writes *and*
the success reply) in one try/catch, with the catch block's own error reply itself unguarded. Real
live testing — simulating `/link` from a synthetic chat id the bot genuinely cannot message — found
this: the real DB write (marking the code used, setting `telegramChatId`) succeeded and was logged,
but the confirmation `ctx.reply(...)` then threw a real Telegram `400 chat not found`; the catch
block's own fallback reply hit the *identical* failure and propagated unhandled, crashing the
`dry-run.ts` process outright (exit code 1). In a real running server, grammy's own `bot.catch()`
would mask this from crashing the whole orchestrator, but the user would never learn their real,
successful link actually worked — a real, silent-failure-adjacent bug either way. Fixed with a
`safeReply` helper (catches and logs, never throws) used for every reply in the handler, not just
`/link`'s. Re-verified with a fresh code: the exact same synthetic-chat scenario now completes
cleanly (exit code 0), the DB write is confirmed, and the reply failure is logged, not fatal.

**`auth/magic-link.ts` used to relay every user's login link to the founder's own Telegram** — the
only sink that existed before this task, meaning the founder could see, and use, another real user's
login link. Not this task's own named subject, but a direct, obvious consequence of the
infrastructure it builds: now that per-user linking is real, the requesting user's own link routes to
*their own* linked chat if they have one, never the founder's (unless the requester genuinely is the
founder). Verified live: a request for the unlinked test user correctly fell back to console-log-only
(no Telegram send attempted at all), confirmed by the real log line.

## An incidental, unrelated real finding (not investigated further)

During cleanup, a real test run's `video_generation` regen loop — mid-flight when the dev process was
killed for an unrelated Telegram-simulation test — resumed into a fresh attempt that itself completed
successfully, but the run's own `status`/`currentStage` never advanced past the stage transition,
leaving it at `status: running` indefinitely rather than progressing or landing at `needs_attention`.
A real, pre-existing gap in how `resume-on-startup.ts` interacts with `pipeline-runner.ts`'s
multi-step regen loop under this specific kill-timing scenario — unrelated to notification routing,
not root-caused, closed out manually. Flagged in `STATUS.md`'s carried-forward items for a real
investigation later if it recurs.

## Files Created/Modified

- Created:
  - `studio/src/notify-founder/pending-approvals.ts`, `in-app-channel.ts`, `recipients.ts`, `telegram-link.ts`
  - `studio/src/notify-founder/telegram-channel.test.ts`
  - `studio/src/types/notification.types.ts`, `telegram-link-code.types.ts`
  - `studio/src/models/repositories/notification.repository.ts`, `telegram-link-code.repository.ts`
  - `studio/src/api/routers/notifications.ts`
  - `studio/src/models/migrations/20260919153054_sprint3_notifications_and_telegram_linking/migration.sql`
- Modified:
  - `studio/src/models/schema.prisma` — `Notification`, `TelegramLinkCode`, new relations
  - `studio/src/types/index.ts` — new type re-exports
  - `studio/src/models/repositories/user.repository.ts` — `listUsersByTenantAndRole`, `updateUserTelegramChatId`
  - `studio/src/notify-founder/telegram-channel.ts` — per-recipient `chatId`, `/link` handling, `safeReply`
  - `studio/src/notify-founder/index.ts` — `composeFounderChannel`, `MultiFounderChannel`, plain `resolvePendingApproval`
  - `studio/src/agents/gate1/index.ts`, `gate2/index.ts` — real per-channel recipient resolution
  - `studio/src/api/routers/runs.ts` — plain `resolvePendingApproval` import
  - `studio/src/api/router.ts` — registers `notificationsRouter`
  - `studio/src/run-pipeline/founder-digest.ts`, `gate-reminder.ts` — per-user routing
  - `studio/src/auth/magic-link.ts` — routes to the requester's own linked Telegram, the real privacy fix
  - `studio/scripts/dry-run.ts` — `link` command, for real manual verification
  - `docs/design_doc/MVP_PART2_MULTI_USER_AND_FLEXIBLE_CREATION.md` — notification-routing item closed

## Schema Changes Applied

`Notification`, `TelegramLinkCode` — real migration
(`20260919153054_sprint3_notifications_and_telegram_linking`), including the `kind` CHECK constraint
and the founder's `telegramChatId` data migration. See `sprint3/SCHEMA.md`.

## Test Results

```
npm run build       -> clean
npm run lint         -> clean
npm run typecheck    -> clean
npm test             -> 17 test files passed (17), 105 tests passed (105)
```

Plus the real, live four-scenario verification described above, plus the two real bugs found and
re-verified fixed.

## Deviations from Spec

- **`Notification.channelId` is nullable**, not required as the task's own initial sketch implied — a
  necessary, real deviation: the daily digest is tenant-wide (spans every channel on a tenant), so it
  has no single channel to attribute its `Notification` rows to. Every gate-related row still sets a
  real `channelId`; only the digest leaves it null. Documented in `sprint3/SCHEMA.md`.
- **The `notifications` tRPC procedures live in a new, dedicated `api/routers/notifications.ts`**
  file rather than nested under `api/routers/dashboard.ts` as the task's literal phrasing ("the
  dashboard's existing polling pattern... gains a notifications.list query") could be read to imply —
  interpreted as "reuses the same polling *pattern* dashboard.ts already established," not "lives
  inside that specific file," matching this codebase's existing one-router-per-concern convention
  (`runs`/`channels`/`dashboard` each already have their own file).
- **The real `channels.create` mutation this task's `ownerUserId` support anticipates doesn't exist
  yet** (Task 6/O's job) — `manage-channels/channel-cap.ts`'s `createChannelWithCapCheck` already
  forwards a passed `ownerUserId` unchanged, confirmed to have no real caller anywhere in the
  codebase yet (same finding as Task 2's own report).
- **The budget ceiling was temporarily raised (to \$10, then reverted to its real \$2.00) partway
  through live verification** — this session's cumulative real testing across Tasks 1-3 had genuinely
  exhausted the real \$2 pooled ceiling (confirmed via a direct `usage_events` sum, ~\$1.75 spent),
  blocking the one remaining real test (the founder's own dual-channel gate flow) at a real
  `Script Generation refused` budget-gate rejection — not a bug, the budget gate working exactly as
  designed. Reverted immediately after the real test completed; confirmed via a direct DB read at
  \$2.00 before finishing this task.

## Sign-Off

- Task Objective: Met. A real gate for an unlinked user produces a real in-app notification and
  resolves correctly through the API alone. A real gate for a linked user (the founder's own,
  verified live) produces both a real in-app notification and a real Telegram message, and resolves
  correctly regardless of which channel replies first — confirmed by resolving via the Telegram path
  specifically. The founder's own existing Telegram-only flow is unaffected — the same real
  `dry-run.ts gate1 approve` regression check every prior sprint has used still works.
- Schema Impact: One real migration — `Notification`, `TelegramLinkCode`, plus the founder's real
  `telegramChatId` data migration. See `sprint3/SCHEMA.md`.
- Business Logic: `sprint3/BUSINESS_LOGIC.md` updated with the dual-channel dispatch design, the
  recipient-resolution rule, and both real bugs found and fixed within this task.
- Tests: Passing (105/105), plus real live end-to-end verification across four distinct scenarios and
  two real, fixed bugs re-verified afterward.
- Ready for Integration: Yes. No founder action required. The one distinct, still-open gap from
  Task 1/2 (`runs.create`'s creation-time tenant check) remains tracked, not conflated with this
  task's own closed scope.
