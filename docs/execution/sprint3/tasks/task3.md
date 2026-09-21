# Sprint 3 Task 3: Per-User Notification Routing

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.**

**Objective**: Replace "every notification goes to one hardcoded `TELEGRAM_FOUNDER_CHAT_ID`" with a
real in-app default channel plus an optional, per-user-linked Telegram channel — so a second tenant's
user isn't literally paged through the founder's own personal Telegram.
**Duration**: 5-7 hours
**Depends On**: Task 1 (session auth — needed to know which user is linking Telegram) and Task 2
(gate ownership — needed to know which user a channel's notifications should route to).
**Owning Component**: `notify-founder/`, Shared Schema, API layer, Orchestrator.
**Success Criteria**: (1) A real gate opened for a user with no linked Telegram produces a real
in-app notification and resolves correctly through the API alone. (2) A real gate opened for a user
who has linked Telegram produces both an in-app notification and a real Telegram message, and
resolves correctly from whichever replies first. (3) The founder's own existing Telegram-only flow
is unaffected.

## Task Requirement

`MVP_PART2_MULTI_USER_AND_FLEXIBLE_CREATION.md` Section 1: "One hardcoded `TELEGRAM_FOUNDER_CHAT_ID`
today... for a real multi-user product, in-app push through the dashboard is probably the right
default channel, with Telegram as one optional channel a user links themselves, not *the* channel."

### K2 — A second, in-app `FounderChannel` implementation
**Where**: `notify-founder/index.ts` exports a single hardcoded singleton,
`founderChannel = new TelegramFounderChannel()` — every call site (`agents/gate1`, `agents/gate2`,
`run-pipeline/founder-digest.ts`, `run-pipeline/post-hoc-tag.ts` indirectly via the Telegram handler)
imports this one instance, confirmed by reading `notify-founder/index.ts` and `channel.ts`'s
`FounderChannel` interface (`notify` / `requestApproval` / `resolvePendingApproval` — no channel
identity in the interface itself, which is exactly what makes a second implementation a clean add,
not a rewrite).

**Fix**: a new `InAppFounderChannel implements FounderChannel` (`notify-founder/in-app-channel.ts`).
`notify`/`requestApproval` write a row to a new `Notification` table (`tenantId`, `channelId`,
`userId` — the intended recipient, resolved from `Channel.ownerUserId` per Task 2 — `kind`
(`'notify' | 'approval_request'`), `message`, `threadKey` nullable, `resolvedAt` nullable, `createdAt`)
rather than sending anything externally; the dashboard's existing polling pattern
(`api/routers/dashboard.ts`) gains a `notifications.list` query scoped to `ctx.userId`. Critically,
`resolvePendingApproval` is **not duplicated** — `TelegramFounderChannel`'s existing
`pendingByThreadKey` map (an in-memory, per-process map keyed by `threadKey`, already
channel-agnostic per its own doc comment: "a second caller... resolving the same pending gate a
Telegram reply would otherwise resolve") is the single source of truth for "is this gate still
open" regardless of which channel(s) notified about it. `InAppFounderChannel.requestApproval`
registers into that same shared map (refactored out of `telegram-channel.ts` into a small shared
`pending-approvals.ts` both implementations import, rather than either implementation owning it) —
so the existing `runs.ts` `gate1`/`gate2` API mutations, which already call
`founderChannel.resolvePendingApproval`, resolve an in-app-routed gate exactly the same way they
resolve a Telegram-routed one today, with zero change to that call site.

A new `composeFounderChannel(userId)` (or a `MultiFounderChannel` wrapping both) dispatches to the
in-app channel **always**, and to Telegram **only if** that user's `User.telegramChatId` (Task 1's
J1 reserved column) is set — `requestApproval`'s single returned promise resolves on whichever
channel's reply arrives first, matching `pending-approvals.ts`'s existing "first resolver wins, the
other gets `resolved: false`" semantics exactly, not a new race-handling design.

**Telegram linking**: `User.telegramChatId` starts `null` for every user. A real "link Telegram"
flow: the dashboard shows a one-time code (a new `TelegramLinkCode` table — `code`, `userId`,
`expiresAt`, `usedAt`); the user sends `/link <code>` to the existing bot; `telegram-channel.ts`'s
`message:text` handler (already the project's precedent for handling an unsolicited command, per
Sprint 2 Task 6's `tag ...` handling — checked the same way, before the existing reply/tag logic)
gains a third branch matching `/link `, looks up the code, and on a valid unused code sets that
user's `telegramChatId` to `ctx.chat.id`. This closes the design doc's explicit "a clear disconnect
path in the app" adjacent requirement too — a `POST /notifications/telegram/unlink` mutation nulls
the field back out.

Every existing call site that currently imports the singleton `founderChannel`
(`agents/gate1/index.ts` via `requestGate1Decision`, `agents/gate2/`, `founder-digest.ts`,
`post-hoc-tag.ts`'s reply path) is updated to resolve **which** `FounderChannel` to use per the
run's channel owner, rather than importing one hardcoded global — `founder-digest.ts` in particular
sends per-tenant today (already iterates real tenants) and needs to become per-user within that
tenant (its own owner, and any other `owner`-role users) once this task lands, not just per-tenant.

**Verify**: (1) a real gate opened for a fresh test user with no linked Telegram produces a real
`Notification` row and resolves correctly by calling the API's `gate1` mutation alone — no Telegram
involved at all. (2) A real `/link <code>` flow against the real bot sets a real
`User.telegramChatId`, confirmed by a direct DB read. (3) A real gate opened for that now-linked user
produces **both** a `Notification` row and a real Telegram message; replying via Telegram resolves
it, and the in-app `Notification` row is marked `resolvedAt` correctly (not left dangling as still
pending). (4) The founder's own existing flow (`telegramChatId` set from the start via this task's
own migration default, so nothing regresses) continues to work exactly as before — verified by a
real end-to-end run through Gate 1 using the founder's real Telegram reply, same as every prior
sprint's regression check for this exact flow.

## Schema Impact

### Tables Created
- `notifications` — `tenantId`, `channelId`, `userId`, `kind`, `message`, `threadKey` (nullable),
  `resolvedAt` (nullable), `createdAt`.
- `telegram_link_codes` — `code` (unique), `userId`, `expiresAt`, `usedAt` (nullable), `createdAt`.

### Tables Modified
- `users` — `telegramChatId` column already added by Task 1 (J1); this task is its first real
  writer/reader. For the founder's own seeded user, this task's migration sets it directly from the
  existing `env.TELEGRAM_FOUNDER_CHAT_ID` value — the one real regression risk this task has, so
  state explicitly in the report that the founder's own chat id was carried over, not lost.

### Migration File
A real Prisma migration for both new tables; the `users.telegramChatId` backfill for the founder's
row is a data migration, not a schema one — note it as such.

## Business Logic / State Transition

### What this task implements
No new `PipelineRun` states. `requestApproval`'s existing "block until the pending map resolves"
mechanism is extended to have more than one possible resolver-registrant (in-app and, optionally,
Telegram) for the same `threadKey` — first reply wins, exactly as `resolvePendingApproval`'s own doc
comment already specifies; this task is what finally gives that comment a real second caller to be
about, beyond just the API's existing `gate1`/`gate2` mutations.

### Preconditions
A `Channel` has a resolvable `ownerUserId` (Task 2). A `User` may or may not have `telegramChatId`
set — both are valid, handled states, not an error case.

### Postconditions
Every gate that opens produces at least one real, visible notification (in-app, always) — never a
gate that's silently waiting with no visible trace anywhere a user would look, which was structurally
impossible before (Telegram was the only channel, always configured for the one founder) but becomes
possible the moment a second tenant exists without this task's in-app fallback.

### Failure Modes & Handling
A Telegram send failure (bot not reachable, chat id stale) must not prevent the in-app `Notification`
row from existing — the two channels are dispatched independently, and an error from one is logged,
not thrown in a way that blocks the other or fails `requestApproval` outright, since the in-app path
alone is always sufficient to resolve a gate.

### Reference
`sprint2/BUSINESS_LOGIC.md`'s Task 6 section — `founder-digest.ts`'s existing per-tenant iteration
pattern, extended here to per-user within a tenant.

## Testing
```bash
npm run build && npm run lint && npm run typecheck && npm test
```
Plus the real dual-channel verification above — this task's bar is a real resolved gate via each
channel independently, and a real link flow against the live bot, not mocked Telegram calls alone.

## Documentation reconciliation
- `docs/execution/sprint3/SCHEMA.md`, `BUSINESS_LOGIC.md`, `STATUS.md`.
- `docs/design_doc/MVP_PART2_MULTI_USER_AND_FLEXIBLE_CREATION.md`: note the notification-routing item
  as picked up by this task.

## Report Template
`execution/sprint3/reports/task3.md`, standard shape.
