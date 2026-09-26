# Bugs Task 3: Second Device-Test Round — Tenant Data Leak, Bug-Report Tool, Script-Review Gate, Keyboard Overlap, Magic-Link Delivery

**Date**: 2026-09-26
**Status**: Code complete for R1-R5 — real on-device verification pending (founder action needed).
**Files Created**: 3 (`studio/src/auth/telegram-token-delivery.ts`, a Prisma migration, this report)
**Files Modified**: 20 across two branches (`BUGS_BE`, `BUGS_FE_TASK3`) — see each branch's own PR for
the exact list.
**Tests**: `npm run build`/`lint`/`typecheck` all pass on both branches. R1 and R3 additionally verified
live against a real, isolated sandbox Postgres database (never the shared dev DB) — see below. R5's
DB-side chat-id logic also verified live the same way; the actual Telegram send needs a real bot token
(founder action, no `TELEGRAM_BOT_TOKEN` exists in this environment).

## What Was Done, Per Item

### R1 — Cross-tenant data leak (`BUGS_BE`) — CONFIRMED FIXED, live-tested
`studio/src/models/repositories/pipeline-run.repository.ts`'s `listRuns` gains an **optional**
`tenantId` filter (not required, as the task doc's own Fix section literally said — see Deviations).
`studio/src/api/routers/runs.ts`'s `list` procedure now always passes `ctx.tenantId`; `get`
(`getRunDetail`) now throws `FORBIDDEN` if the fetched run's `tenantId` doesn't match `ctx.tenantId`,
mirroring `create`'s own Sprint 3 Hardening check.

**Real, live two-tenant verification** (not just code review, per this task doc's own explicit
requirement): created an isolated sandbox Postgres database
(`sevenai_bugs_task3_sandbox`, same server as the shared dev DB but a completely separate database —
`sevenai_app` has `CREATEDB`), ran all 15 real migrations against it, seeded two real tenants/channels/
runs, and called the actual `runsRouter` procedures (via tRPC's `createCaller`, real Prisma queries, no
mocking) with each tenant's own context:
```
Tenant A list contains runA: true
Tenant A list contains runB (should be false): false
Tenant B list contains runB: true
Tenant B list contains runA (should be false): false
Tenant A get(runB.id) threw: true code: FORBIDDEN
Tenant A get(runA.id) succeeded: true
```
Every assertion passed. The sandbox database was dropped after verification — nothing was written to
the shared dev DB.

**A second, real audit finding beyond the task doc's own scope**: `studio/src/run-pipeline/
gate-reminder.ts`'s background cron also calls `listRuns({ statuses: [...] })` with no tenant filter —
by design, since it's a system-wide job that legitimately needs to see pending gates across every
tenant (each run's own notification recipients are still resolved per-tenant downstream). Making
`tenantId` *required* on `listRuns`, as the task doc's Fix step 1 literally specified, would have broken
this real caller. `tenantId` is optional instead, with a code comment explaining exactly why, and the
client-facing `runs.ts` procedure is the only caller that must (and does) always supply it.

Grepped every other router (`channels.ts`, `dashboard.ts`, `notifications.ts`) for the same
missing-tenant-scope pattern — all three were already correctly scoped. No other gap found.

### R2 — Bug-report tool (`BUGS_BE` backend half + `BUGS_FE_TASK3` frontend half)
`studio/src/api/bug-report-page.ts`'s success handler now does `window.location.href =
'sevenai://bugs-submitted'` instead of just clearing the textarea. `app/components/ReportBugButton.tsx`
switched from `WebBrowser.openBrowserAsync` (fire-and-forget) to `WebBrowser.openAuthSessionAsync(url,
'sevenai://bugs-submitted')`, which resolves the moment that redirect fires and auto-closes the in-app
browser; on `result.type === 'success'` the app shows its own `Alert.alert` confirmation. The failure
path is unchanged — a 400/500 or a thrown fetch never redirects, so the browser stays open with the
existing red error text.

**Deviation confirmed by direct read**: the task doc's own "Where" section claims `ReportBugButton.tsx`
"only exists in the 7AI-frontend checkout, not main." That's stale — it's already on `main` (commit
`a3ea7e5`, "Add a header bug-report icon with real run/screen context"), confirmed before editing. No
file move was needed; this task's fix landed directly on the real file in place.

### R3 — Script Review auto-reject + bounded retry (`BUGS_BE`) — CONFIRMED FIXED, live-tested
`studio/src/agents/script-review/index.ts` exports `SCRIPT_REVIEW_AUTO_REJECT_THRESHOLD = 7` and
`MAX_SCRIPT_REVIEW_AUTO_RETRY_ATTEMPTS = 3`. `state-machine.ts`'s `runScriptReviewStage` now computes,
right after a review completes:
- `autoRejectAndRetry` = score below threshold **and** this review's own `attemptNumber` is still within
  the cap → inserts a distinct `agent: 'script-review', verdict: 'auto-reject'` `ReviewLog` row, and
  loops back into `script_generation` (`status: 'running'`) instead of `paused_gate1` — the pipeline
  driver's own `while` loop (`pipeline-runner.ts`) picks this up automatically, no new orchestration
  code needed.
- Cap exceeded while still below threshold → proceeds to Gate 1 anyway, with `[Auto-retry limit reached
  (3) — sent to Gate 1 despite low score.]` appended to the same `ReviewLog` row `runGate1Stage` reads
  as `reviewNotes` — a human sees exactly why a low-scoring script still reached them.

Same `attemptNumber <= CAP` idiom `runVideoReviewStage`'s own `MAX_VIDEO_REGEN_ATTEMPTS` cap already
uses, for consistency — but unlike that cap (which escalates to `needs_attention`), this one still
reaches Gate 1 on exceeding, per the founder's explicit instruction for this fix.

**Real, live verification** against the same sandbox DB: seeded a real tenant/channel/`AgentQuota`/run,
mocked only the two LLM-calling functions (`generateScript`, `reviewScript` — deterministic, zero LLM
cost) to force a `3, 3, 3, 9` score sequence, then drove the real `runScriptGenerationStage`/
`runScriptReviewStage` functions in a loop (mirroring `pipeline-runner.ts`'s own driver) until the run
left the script stages:
```
Total script-review calls: 4
auto-reject ReviewLog rows: 3 (expect 3)
score ReviewLog rows: 4 (expect 4)
Final run status/stage: paused_gate1 gate1
Cap-reached flag present on final score log: true
```
Every assertion passed — 3 auto-rejects, cap hit on the 4th attempt, Gate 1 reached with the flag.

### R4 — Keyboard overlap (`BUGS_FE_TASK3`) — audit done, FE-only fix applied, native fix deliberately deferred
Audited every screen with a `TextInput`: `login.tsx` (already had `KeyboardAvoidingView` from Bugs Task
1), `new-brief.tsx`, `channels.tsx`, `run/[id].tsx` (none did). Applied the identical
`KeyboardAvoidingView` pattern (`behavior={Platform.OS === 'ios' ? 'padding' : undefined}`) to all
three — `channels.tsx`'s inputs live inside a `FlatList`'s `ListFooterComponent`, wrapped the whole
`FlatList` the same way.

**Deliberately did not** add `app.json`'s `android.softwareKeyboardLayoutMode` (the task doc's second
candidate cause) — that's a native config change forcing another `eas build`, and there is no live proof
from this environment that the FE-only fix is insufficient. Per Task 2's own bundling principle
("check for other pending native changes before a native-only rebuild"), speculatively adding an
unverified native change here would risk exactly the kind of unnecessary rebuild that principle exists
to prevent. **Recommended next step, conditional on real testing**: if the founder's on-device retest
(after this FE-only fix ships via OTA) still shows overlap on any screen, that's the confirmation needed
to justify bundling `softwareKeyboardLayoutMode: "resize"` into the *next* native build — not this one.

### R5 — Magic-link delivery via Telegram (`BUGS_BE` backend half + `BUGS_FE_TASK3` frontend half)
**Schema correction (important — read before assuming "no migration needed")**: the task doc's own
"Schema Impact: None... R5" statement is wrong. Direct read of migration
`20260920075853_sprint3_retire_telegram_add_push` shows `User.telegramChatId` was **dropped**
(`ALTER TABLE "users" DROP COLUMN "telegramChatId"`) when the old Telegram module was retired — not
merely left unused, as both the task doc and this task's own earlier corrected draft assumed. A real,
new migration (`20260926014026_bugs_task3_readd_telegram_chat_id`) re-adds it, identical shape to
before (`VARCHAR(50)`, nullable) — applied and verified against the sandbox DB before any other R5 work
started.

Backend: new `studio/src/auth/telegram-token-delivery.ts` — `sendTelegramMessage(chatId, text)` (a
single `fetch` to Telegram's `sendMessage` endpoint, best-effort, never throws) and
`runTelegramStartPollCheck()` (a `getUpdates` long-poll, in-memory offset, replies to `/start` with the
chat's numeric id). Both are no-ops when `TELEGRAM_BOT_TOKEN` is unset (new, optional env var — a
checkout without one just falls through to console-only, same convention as every other credential-gated
feature in `env.ts`). Wired into `src/index.ts` as a new periodic checker
(`TELEGRAM_START_POLL_INTERVAL_MS`, default 3s), only started when the token is configured.
`requestMagicLink` now accepts an optional `telegramChatId`: when present it self-healingly overwrites
`User.telegramChatId` (never one-time-only) and sends the raw token there; when omitted it falls back to
whatever's already stored. `POST /auth/request-link` threads the new optional field through with the
same no-enumeration posture as email.

Frontend: `lib/auth-api.ts`'s `requestMagicLink` takes the new optional param; `login.tsx` gets a new
"Telegram Chat ID" field directly below email, pre-filled from `SecureStore`
(`sevenai.telegramChatId` key, same naming convention as `auth.tsx`'s existing keys) and saved back on
each request — a per-device convenience, never used for account lookup.

**Real, live verification** (DB side) against the sandbox DB, Telegram send mocked (no real bot token
exists in this environment — see Founder Action below):
```
After 1st request — stored telegramChatId: 123456789
After 1st request — messages sent: 1 123456789
After 2nd (blank) request — stored telegramChatId unchanged: 123456789
After 2nd (blank) request — total messages sent: 2
After 3rd (new id) request — stored telegramChatId updated: 987654321
```
Confirms: a supplied chat id persists and is sent to; a blank field on a later request correctly falls
back to the stored id; a new id overwrites (self-healing, not one-time).

### R6 / R7 — No action, as specified
R6 is a design note only (queue archival), not scoped for this task, per the task doc. R7 is intent-only
(the founder will use R2's now-fixed tool to log further items directly).

## Schema Changes Applied
One real migration: `20260926014026_bugs_task3_readd_telegram_chat_id` — re-adds `users.telegramChatId
VARCHAR(50)` (nullable). Applied and verified against the sandbox DB; **not yet applied to the shared
dev DB** — `npx prisma migrate deploy` needs to run there before `BUGS_BE` is merged and the API server
restarted, standard for any schema change in this repo.

## Test Results
```
# app/ (BUGS_FE_TASK3)
npm run build       → PASS (expo export --platform web)
npm run lint         → PASS (expo lint, no warnings)
npm run typecheck    → PASS (tsc --noEmit)

# studio/ (BUGS_BE)
npx tsc --noEmit     → PASS
npm run lint         → PASS (eslint, no warnings)
```
R1 and R3's live sandbox-DB tests are reproduced in full above (What Was Done). R5's DB-side test is
also reproduced above. All temporary test scripts/files used for these were deleted before committing —
none of this branch's commits include throwaway test code.

## Founder Action Required (cannot be done from this environment)
1. **Real on-device verification for R1, R2, R4** — same posture Tasks 1/2 already established: no
   `adb`/`eas` device session exists here. R1's *code* is proven live against a real (sandboxed) database
   already — what's left is confirming the same behavior through the actual mobile app UI with the
   founder's two real tenants once `7aistudiochannel@gmail.com` exists.
2. **A real Telegram bot token** (`@BotFather` → `TELEGRAM_BOT_TOKEN`) to actually exercise R5's `/start`
   handshake and message delivery — the DB-side logic is proven, the Telegram API call itself is not,
   since no token exists in this environment.
3. **Apply the new migration to the shared dev DB**: `cd studio && npx prisma migrate deploy` (and
   restart the API process) before merging `BUGS_BE`.
4. **R4's conditional native follow-up**: retest keyboard behavior on-device after this FE-only fix
   ships; only if overlap persists, bundle `android.softwareKeyboardLayoutMode` into the next native
   build.

## Deviations from Spec
1. **R1**: `listRuns`'s `tenantId` is optional, not required as literally specified — `gate-reminder.ts`'s
   real, legitimate cross-tenant caller would otherwise break. See "What Was Done" above for the full
   reasoning.
2. **R2**: no file move needed — `ReportBugButton.tsx` was already on `main`, the task doc's claim
   otherwise was stale.
3. **R3**: none — matches the task doc's Fix steps exactly (threshold, cap, cap-exceeded-still-reaches-
   Gate-1 behavior).
4. **R4**: the native-config candidate cause is deliberately deferred pending live proof, not implemented
   speculatively. See "What Was Done" above.
5. **R5**: a real schema migration was required — the task doc's "no migration needed" assumption was
   wrong (the column was dropped, not just unused). Otherwise matches the Fix steps as given (bot setup
   is a founder action, `/start` long-poll not a webhook, self-healing upsert, console fallback kept).
6. **Branching**: per the protocol's "a branch should not span roles" rule, this task's work is split
   across `BUGS_BE` (R1, R3, plus R2/R5's backend halves) and `BUGS_FE_TASK3` (R2/R5's frontend halves,
   plus R4) rather than one branch — `BUGS_FE` itself was unavailable (already in use, with unrelated,
   superseded history from Task 1's first session — see `reports/task1.md`'s own note on that same
   collision), hence the `_TASK3` suffix.
7. **Worktree**: same shared worktree, `D:\Study Material\7AI-bugs`, as Tasks 1-2 — no new worktree
   issue this task.

## Sign-Off
- Task Objective: R1/R3 code complete and live-verified (real sandbox DB). R2/R5 code complete,
  DB-side/logic verified live where possible; the actual device/Telegram-API legs are founder-action-
  pending. R4 audited and fixed at the FE layer; native follow-up conditional on a real retest.
- Schema Impact: One new migration (see above) — not yet applied to the shared dev DB.
- Business Logic: R3 is the only new control-flow change (see state-machine.ts); documented above and in
  code comments.
- Tests: Build/lint/typecheck passing on both branches; R1/R3/R5(DB) additionally live-verified against
  an isolated sandbox database, never the shared dev DB.
- Real device end-to-end (R1 two-tenant, R2 browser auto-close, R4 keyboard, R5 Telegram exchange):
  **Not confirmed** — founder-action-pending, consistent with this track's established honest posture.
- Ready for Integration: Code yes, for both branches; full task sign-off no, pending founder verification
  and the dev-DB migration deploy.

## Links & References
- [TASK_TEMPLATE.md](../../templates/TASK_TEMPLATE.md)
- [HOTFIXER_AGENT_PROTOCOL.md](../HOTFIXER_AGENT_PROTOCOL.md)
- `docs/execution/bugs/STATUS.md`
- `docs/execution/bugs/tasks/task3.md`
- PRs: `BUGS_BE` (#18), `BUGS_FE_TASK3` (#19)
