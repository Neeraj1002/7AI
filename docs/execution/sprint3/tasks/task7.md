# Sprint 3 Backend Task 7 (O): Retire Telegram — Real Push Notifications + In-App Digest & Tagging

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** Branch: `SPRINT3`
(Sprint 3 is reopened for this task — see `STATUS.md`'s note on why a closed sprint gained a
seventh task, rather than this becoming a new Sprint 4).

**Objective**: Telegram was only ever built (Week 1) to make Gate 1/Gate 2 testable before any real
UI existed — never meant to become permanent infrastructure. Since then, three more real flows
quietly grew a hard dependency on it (gate reminders — now already migrated by Task 3/K2's own
`composeFounderChannel`; the founder digest; post-hoc tagging) plus an entire linking flow
(`telegram-link.ts`, `TelegramLinkCode`). This task removes Telegram as an application dependency
entirely — no fallback, no feature flag — and replaces the one real capability it had that
in-app-only notifications don't (reaching a user who isn't looking at the app right now) with real
Expo push notifications, then moves the two remaining Telegram-only flows to real in-app equivalents.
**Duration**: 8-10 hours
**Depends On**: Sprint 3 Tasks 1-6 (all Done per `STATUS.md`) — this task operates directly on their
real output: `User`, per-user `Notification` routing, `composeFounderChannel`,
`resolveNotificationRecipients`.
**Owning Component**: `studio/src/notify-founder/*` (renamed to `studio/src/notifications/*` by this
task — see O5), `run-pipeline/founder-digest.ts`, `run-pipeline/post-hoc-tag.ts`, `models/schema.prisma`,
`package.json`, `config/env.ts`, `api/routers/*`.
**Success Criteria**: (1) `grammy` is gone from `package.json`; `telegram-channel.ts`,
`telegram-channel.test.ts`, `telegram-link.ts` are deleted; `TELEGRAM_BOT_TOKEN`/
`TELEGRAM_FOUNDER_CHAT_ID` are gone from `env.ts`/`.env.example`; `User.telegramChatId` and the
`telegram_link_codes` table are dropped by a real migration. A repo-wide search for
`telegram`/`Telegram`/`grammy` under `studio/src` returns nothing (docs/reports are historical record,
left alone). (2) A real gate opened for a user with the app backgrounded/closed produces a real Expo
push notification on a real device — not just a `Notification` row nobody sees until they happen to
open the app. (3) The founder digest and post-hoc tagging work end-to-end through the app with zero
Telegram involvement, verified live the same way every other Sprint 3 task was.

## Task Requirement

### O1 — Real push notification infrastructure
**Where**: nothing in the app registers a device for push today. `composeFounderChannel`
(`notify-founder/index.ts`) already has the exact shape a push channel needs to slot into — it
currently does `if (user.telegramChatId) { channels.push(new TelegramFounderChannel(...)) }` per
recipient; that conditional is the one being replaced, not a new dispatch design being invented.

**Fix**: migration adds `User.expoPushToken` (nullable string). New
`notifications/push-channel.ts` — `ExpoPushChannel implements FounderChannel` (or its renamed
successor, see O5), using `expo-server-sdk` to POST to Expo's push API, constructed per-recipient the
same way `InAppFounderChannel` already is (`{ tenantId, channelId, userId, expoPushToken }`). Its
`notify`/`requestApproval` both send a real push (title + the same message text the in-app
`Notification` row gets — no separate copy to maintain) with the run/notification id in the push
payload's `data` field, so a tap can deep-link straight to the right screen (mirrors the deep-link
mechanism Sprint 3 frontend Task 1 already introduced for magic-link verification — reuse it, don't
invent a second deep-link scheme). A new `notifications.registerPushToken` mutation
(`ctx.userId`-scoped, no other user's row reachable) the app calls once it has a real Expo push
token from `expo-notifications`' `getExpoPushTokenAsync()`. `composeFounderChannel` gains the push
channel the same way it currently gains Telegram — `if (user.expoPushToken) channels.push(new
ExpoPushChannel(...))` — in-app stays unconditional exactly as it is now.

**Verify**: a real token registered from a real device (via the frontend half of this work,
`frontend-task3.md`'s rewritten FE11), a real gate opened for that user with the app killed, produces
a real push notification on the real device — checked against Expo's own push-receipt API for actual
delivery, not just "send accepted" (the same distinction Task 5/M2's own OAuth verification insisted
on for Google's consent screen — a call succeeding isn't the same as the real outcome happening).

### O2 — Remove Telegram entirely
**Where**: `telegram-channel.ts` (the `TelegramFounderChannel` implementation + the bot receive
loop), `telegram-channel.test.ts`, `telegram-link.ts` (`createTelegramLinkCode`/`unlinkTelegram`),
the `telegram_link_codes` table and `User.telegramChatId` column, `grammy` in `package.json`,
`TELEGRAM_BOT_TOKEN`/`TELEGRAM_FOUNDER_CHAT_ID` in `env.ts`, `notifications.createTelegramLinkCode`/
`unlinkTelegram` mutations, `startTelegramReceiveLoop` wiring in the server bootstrap (`index.ts`
entrypoint, not `notify-founder/index.ts`), `pending-approvals.ts`'s Telegram-only fields
(`telegramMessageId`, `attachTelegramMessageId`, `findThreadKeyByTelegramMessageId`,
`singlePendingTelegramThreadKey`) — the whole "founder might not tap Reply, so treat a lone incoming
Telegram message as a reply" fallback (Week 2 Task 6) has no meaning once there's no Telegram to
receive a message on.

**Fix**: delete the three files; a real migration drops `telegram_link_codes` and
`User.telegramChatId`; `pending-approvals.ts` shrinks back to just `getOrCreatePendingApproval`/
`resolvePendingApproval` (the two things Task 2's gate resolution and this task's own O1 still need)
— `resolvePendingApproval` keeps its "mark every `Notification` row for this threadKey resolved"
behavior (that's channel-agnostic, still correct with push in the mix); `remove `grammy` from
`package.json` and run a real `npm install` to update the lockfile, don't just delete the line.
**Also check `auth/magic-link.ts`**: `STATUS.md`'s Task 1 row states real link delivery today goes
"via server console + the existing Telegram `founderChannel.notify()`" — that Telegram half needs
replacing with the console log alone (magic links predate any recipient having a session yet, so
there's no `Notification`/push recipient to route to at that point — this stays a console-only
fallback until real email delivery exists, a gap Sprint 3 frontend Task 1 already flagged as a known,
temporary limitation, not one this task is expected to close).

**Verify**: `grep -ri telegram studio/src` and `grep grammy studio/package.json` both come back empty.
A full real gate1/gate2 flow (real LLM calls, no stubs) still completes end-to-end with the server
running against the post-migration schema and zero Telegram code loaded — the same live-verification
bar every prior Sprint 3 task used, not a unit test standing in for it.

### O3 — Migrate the founder digest off Telegram
**Where**: `run-pipeline/founder-digest.ts` (Sprint 2 Task 6) sends its periodic digest through the
old singleton `founderChannel.notify()` and tracks send cadence via `Tenant.lastFounderDigestSentAt`
— both predate Task 3/K2's per-user recipient model and were never touched by it.

**Fix**: switch the digest's send call to `composeFounderChannel` with recipients resolved via
`listUsersByTenantAndRole(tenantId, 'owner')` (already exported from `recipients.ts`, same set Task
2's `canResolveGate` and Task 3's `resolveNotificationRecipients` already treat as "the people
responsible for this tenant") instead of the removed singleton. The digest becomes a real push
notification (it's a "come back and look" nudge for someone not currently in the app — exactly O1's
use case) whose content still lands as a real in-app `Notification` row too, same as every other
channel dispatch; it does **not** get a dedicated digest screen in this task — tapping the push (or
opening the Notifications screen from Sprint 3 frontend Task 3's FE10) takes the user to the existing
Dashboard, which already has the real data the digest is summarizing. Building a standalone digest
view is a real, separable scope increase this task deliberately doesn't take on unless you want it
added. `Tenant.lastFounderDigestSentAt` stays on `Tenant` (not moved to `User`) — a tenant can have
more than one owner now, but per-tenant digest cadence (don't nag *any* owner more than once per
window) is a reasonable simplification to keep, not a bug this task needs to fix.

**Verify**: a real digest cycle, run against a tenant with a real gate/run history, produces a real
push + real `Notification` row for every real owner-role user on that tenant, with zero Telegram
calls in the path — confirmed by the same `grep`/live-run check as O2, plus a direct Postgres read
confirming `lastFounderDigestSentAt` still advances correctly.

### O4 — Migrate post-hoc tagging off Telegram
**Where**: `run-pipeline/post-hoc-tag.ts` (Sprint 2 Task 6) parses a Telegram text command
(`tag <runId> <word> [notes]`) — the only way to attach a post-hoc quality tag to a completed run
today, with zero in-app equivalent.

**Fix**: a new `runs.tagPostHoc({ runId, tag, notes? })` mutation, session + tenant-scoped the same
way every other Sprint 3 mutation is, reusing `post-hoc-tag.ts`'s existing validation logic directly
(the same tag vocabulary/notes-length checks the Telegram parser already enforces — call the shared
function, don't re-implement the rules a second time) rather than the text-command parsing, which is
deleted along with the rest of the Telegram message handler in O2. Frontend gets a small form
(tag picker + optional notes) surfaced on a completed run's Run Detail screen — the natural place,
since that's where the run's own outcome is already visible (see `frontend-task3.md`'s rewrite).

**Verify**: a real tag submitted through the app produces the identical DB row shape the old Telegram
command produced (schema and any downstream consumer — e.g. anything in
`continuous-learning`/performance-analytics that reads post-hoc tags — untouched, confirmed by
reading those consumers before assuming "same shape" rather than asserting it).

### O5 — Naming cleanup (bundled in, not a separate task, since every file here is already being touched)
**Where**: the whole module is named `notify-founder/` around a `FounderChannel` interface — a direct
holdover from Week 1, when there was exactly one recipient, hardcoded, called "the founder." Task
3/K2 already outgrew that in behavior (`InAppFounderChannel` takes a `userId` and is constructed once
per recipient, not a singleton; `composeFounderChannel` fans out to an arbitrary list of real users)
without renaming anything to match.

**Fix**: rename the directory `notify-founder/` → `notifications/`; `FounderChannel` →
`NotificationChannel`; `InAppFounderChannel` → `InAppChannel`; `composeFounderChannel` →
`composeNotificationChannel` (keep a re-exported alias if you'd rather not touch every call site in
`run-pipeline/`/`api/routers/` in this task — either is fine, state which was chosen). Leave
`Tenant.lastFounderDigestSentAt` and `FOUNDER_DIGEST_*` env vars as-is (O3 already covers why
tenant-scoped digest cadence is still the right model) — this is a rename of the channel-dispatch
layer's own vocabulary, not a project-wide sweep of every place the word "founder" appears.

**Verify**: `tsc --noEmit` clean after the rename; every import updated (`grep -r "notify-founder"
studio/src` returns nothing).

## Schema Impact
- Migration: add `User.expoPushToken` (nullable `String`).
- Migration: drop `telegram_link_codes` table, drop `User.telegramChatId` column.
- No change to `Notification` — it's already channel-agnostic (records what was said and to whom, not
  which channel said it).

## Business Logic / State Transition
`composeFounderChannel`'s per-recipient dispatch logic changes from "in-app always + Telegram if
linked" to "in-app always + push if a token is registered" — same shape, different second channel.
`resolvePendingApproval`'s "first reply wins" semantics are unchanged; a push notification is
one-way (it can't itself resolve a gate — the user still resolves it by opening the app and tapping
approve/reject, exactly as today), so no new resolution path is introduced, only a better way of
telling someone a gate exists.

## Testing
```bash
npm run build && npm run lint && npm run typecheck
npm test
```
Plus O1/O2/O3/O4's real, live verification above — this task's bar is the same one every other
Sprint 3 task used (real device, real push receipt, real DB reads), not a mocked push send.

## Documentation reconciliation
- `STATUS.md`: add this task's row; note plainly that Sprint 3 was reopened for it rather than
  starting a Sprint 4, per an explicit product decision that Telegram was never meant to be permanent.
- `docs/design_doc/frontend/MOBILE_APP_DESIGN.md`: its own "push-notification infrastructure
  choices... an implementation detail for whoever builds this" line, deferred by Sprint 3 frontend
  Task 3's original scope — this task is what actually closes it.
- `.env.example`: remove the Telegram vars this task deletes; still leave the broader Sprint 2-era
  staleness noted in `STATUS.md`'s carried-forward items to its own separate cleanup.
- `KNOWN_ISSUES_AND_BLOCKERS.md`: remove any Telegram-linking-related item this task makes moot;
  do not remove the real, unrelated resume-loop edge case Task 3 found — that's still open.

## Report Template
`execution/sprint3/reports/task7.md`, standard shape. State plainly which naming choice was made in
O5 (full rename of `composeFounderChannel` vs. alias-and-keep), and confirm the push-receipt check
(not just "send accepted") was actually performed against a real device.
