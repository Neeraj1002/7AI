# Bugs Sprint 3 Closure (part 1) — Report

**Date**: 2026-10-06
**Branch / PR**: `Sprint3_CLOSURE` / [#48](https://github.com/Neeraj1002/7AI/pull/48). The updated task doc names the branch `BUGS_CLOSURE`; the work was started on `Sprint3_CLOSURE` under the earlier doc and **keeps that name** (already pushed, PR open).
**Status**: Done — action needed. **Scope narrowed by the founder (2026-10-06)**: this PR ships only what is built (R1 incl. D4, and the parts of R2-R6 listed below). The 24-report triage, reports 12-15, R7, R8, R9 and the image-cost rows (R1 step 7) moved to [closure part 2](../closureTask2.md). This overrides the protocol's "ready only when the whole release is done" rule for this one PR.
**Task docs**: [`closureTask.md`](../closureTask.md) (the task as handed over), [`closureTask2.md`](../closureTask2.md) (part 2 — a **draft**, see its header: the founder's file was not attached).

## Verification honesty

- `npm run lint`, `npx tsc --noEmit` and `npx vitest run` pass after merging `origin/main`: **27 files, 187 tests**.
- Budget behaviour was run against an **isolated sandbox database** (`sevenai_closure_sandbox` on the local Postgres, created for this and dropped afterwards; never dev or preview), through the real tRPC router and the real scripts. Output is pasted below. The sandbox scripts were temporary and are not committed.
- App changes (labels, dashboard cards, inbox, run Details) are **typecheck/lint only — never rendered on a device or the preview app**. The one remaining app typecheck error (`expo-image-picker` missing from this checkout's `node_modules`) was already there.
- **Nothing was run against the preview server, and no report's status was changed via `bugs.updateTriage`.** Success criterion 1 (all 24 triaged) is not met here by design (moved to part 2).

## Done in this PR

| Item | What |
|---|---|
| `BUGS_CLOSURE_MOVE` | Bugs Tasks 1-7 docs moved under `bugs/Sprint3/`, links fixed, STATUS row added. |
| R1 | `checkBudget()` (scope, spent, ceiling, channel name, reset time); both state-machine gates and `runs.retry` use its exact text; weekly window (Monday 00:00 UTC) shared by the gate and `dashboard.cost`; F9 warning and write-time validation; `dashboard.cost` adds `weekSpendUsd`, `budgetWindow`, per-channel `weekSpendUsd`/`effectiveCeilingUsd`; app says "Spend this week … resets Monday" and shows the full refusal sentence. |
| R1 step 5b (D4) | `MIN_CHANNEL_SHARE_USD = 5` (**confirmed**); override validation in `channels.update` **and** `scripts/set-channel-budget-override.ts`; additive `budgetWarning` on `channels.create`; `$0` share logged as an error; `invite-tenant.ts` requires `--weekly-budget`. |
| R2 (partial) | Loud `[boot]` warning when any `*_STUB` flag is on (kept alongside Task 13's R2-not-configured warning). |
| R3 | `successRate.needsAttention` and a rate over every stopped run (D2); `publishedRate`; `dashboard.gates`; Dashboard cards. |
| R4 | Inbox cards: "Script approval" / "Video approval", resolved decision, stage line. |
| R5 (partial, report 11) | Run Details labels each attempt (done / FAILED / skipped); a failed one is red. |
| R6 (step 2 only) | A revise attempt skips stock clips earlier attempts of the run used — in Task 8's `stock-shotlist.ts` (`previouslyUsedSourceIds`), with tests. |

Exact refusal texts (sandbox):
- `Account spend limit reached: $40.00 used of $40.00 this week. Resets Monday 00:00 UTC.`
- `Limit for channel "Underdogs" reached: $2.14 used of $0.90 this week. Resets Monday 00:00 UTC.`
- `Channel "Underdogs" has a $0.00 share because another channel's override reserves the whole account limit. Lower that override or raise the account limit.`

## Sandbox run (seed: tenant with a $40 weekly budget, two active channels, channel A overridden to $10, B default share)

```
1. channels.update override equal to the budget
  A override 40 -> REJECTED: A channel limit of $40.00 would leave $0.00 a week of the $40.00 weekly account limit for "Channel B" (minimum $5.00 each), so runs on it would be refused. Lower this limit or raise the account limit first.
2. override leaving the other default-share channel under 5
  A override 37 (B would get 3) -> REJECTED: A channel limit of $37.00 would leave $3.00 a week of the $40.00 weekly account limit for "Channel B" (minimum $5.00 each), ...
3a. override that fits, via channels.update
  A override 35 (B gets exactly 5) -> ACCEPTED
  A override 20 -> ACCEPTED        (stored A override: 20)
3b. same rules through scripts/set-channel-budget-override.ts (real script, sandbox DB)
  script 40 -> REJECTED: Error: A channel limit of $40.00 would leave $0.00 a week ... for "Channel B" (minimum $5.00 each) ...
  script 37 -> REJECTED: Error: A channel limit of $37.00 would leave $3.00 a week ... for "Channel B" (minimum $5.00 each) ...
  script 25 -> ACCEPTED: [budget] channel 020d20f5-... (Channel A) budgetOverrideUsd set to $25
4. 1, 2 and 3 active channels split 40 equally (channels.create, no overrides)
  1 active channel(s) ceilings: [40]            budgetWarning: null
  2 active channel(s) ceilings: [20,20]         budgetWarning: null
  3 active channel(s) ceilings: [13.3333 x3]    budgetWarning: The $40.00 weekly budget is now split over 3 active channel(s): about $13.33 a week each for channels without their own limit (guide: $20.00 per channel).
5. channel under its ceiling, tenant total at the budget -> scope pool
  channel 3 (spent 0 of 13.33): {"scope":"pool","spentUsd":40,"ceilingUsd":40}
  text: Account spend limit reached: $40.00 used of $40.00 this week. Resets Monday 00:00 UTC.
6. weekly window: Sunday 23:59:59 vs Monday 00:00:00 UTC
  only a $50 event at Sun 23:59:59 UTC (last week): ok (not counted)
  plus a $41 event at Mon 00:00:00 UTC: REFUSED, counted $41 (the $41 only)
7. invite-tenant.ts without --weekly-budget
  -> FAILED as required: Error: usage: invite-tenant.ts "<tenant name>" <ownerEmail> ["<owner name>"] --weekly-budget <usd>  (weekly budget is required)
  tenant row created anyway? no
ALL SANDBOX CHECKS PASSED
```
Earlier sandbox runs (before the merge) also verified: `runs.retry` on a budget-refused run returns `CONFLICT` with the numbers and creates no stage row; F9 override-equals-pool logs the new warning; `dashboard.cost` weekly vs lifetime and per-channel weekly spend (a raw-SQL timestamp bug that returned 0 was found and fixed); R3 counts (2 completed [1 published], 1 failed, 1 needs_attention, 1 running → 2/1/1, rate 0.5, published 1 of 4, gate medians 60 s / 120 s). Unit tests added: allocator, override validator (equal-to-budget, below floor, exactly the floor, fits), $40 over 1/2/3 channels, dilution warning, window boundary, and a mocked-repository gate test (channel under ceiling, tenant at budget → `scope: 'pool'`; no budget row throws).

## `Channel.isActive` writers (src/ and scripts/)

```
channel.repository.ts:94   updateChannel patch type has isActive?: boolean
channel.repository.ts:158  if (patch.isActive !== undefined) data.isActive = patch.isActive
channel.repository.ts:166  archiveChannel(): updateChannel(id, { isActive: false })     <- only caller of a changed value
schema.prisma:163          isActive Boolean @default(true)                              <- how every new row becomes active
channel.repository.ts:68   insertChannel() -> prisma.channel.create (no isActive given)
  <- sole caller: manage-channels/channel-cap.ts createChannelWithCapCheck()
  <- sole caller: api/routers/channels.ts `create`
scripts/dry-run.ts:77      prisma.channel.create(...)  (dev fixture script, MVP tenant)
```
No code path sets `isActive: true` explicitly; `updateChannel(...)` is called with an `isActive` value only by `archiveChannel` (false). `channels.update` has no `isActive` input, there is no un-archive, and nothing in the YouTube connect/OAuth/reconnect code touches it. So `channels.create` is the only product path by which a channel becomes active, and it already returns the non-blocking dilution warning. `scripts/dry-run.ts` creates a channel directly for a dry run (a throwaway dev fixture, not a product path), so no warning was added there.

## Merged with main; what was removed as duplicate, and why

`origin/main` now holds PR #46 (Sprint 4 Task 8) and #47 (Sprint 3 Task 13). Merged (`git merge`, not rebase), conflicts resolved to main's version for anything they own.

| Removed from #48 | Why |
|---|---|
| This branch's stock-clip skip in `stock-footage/client.ts`, `types.ts` and its test | Task 8/R5 already skips used clip ids (`pickUnusedVideo`, `excludeSourceIds`, shot list). Took main's files whole. |
| The `getSpentCostUsd` wrapper around `generateVideo`, the `failed` metadata/unknown-provider warning on the failure usage row, and the `stub: true` marker | Image-cost recording is moved to part 2 by the founder, and Task 8 rewrote `generateVideo` and records still costs in the video-generation usage event. (The failed-attempt under-count it addressed — TTS + transcription paid, then `$0` recorded, repeated per retry — is **not** covered by Task 8; it is written up in part 2.) |
| Boot-warning conflict | Not removed: both kept (stub flags and Task 13's "R2 not configured"). |

Kept because Task 8 does not cover it: a **revise attempt** is a new attempt, and Task 8's skip only spans one attempt's shot list. Added `previouslyUsedSourceIds` to `buildStockShotList`, `excludeStockSourceIds` to `generateVideo`, and the state machine passes the run's earlier clip ids from `usage_events` metadata. The reader (`sourceIdsFromUsageMetadata`) accepts Task 8's `stockFootageSourceIds` array, falls back to the comma-joined `stockFootageSourceId`, and returns no ids for older/odd rows rather than throwing. Not run live (unit tests only).

Graceful degradation: nothing added here reads `qualityMetrics` or the R2 attempt bundle; the only new reads of run data (usage metadata) tolerate missing fields. Files #46/#47 changed (`state-machine.ts`, `video-generation/index.ts`) were checked with `git log origin/main -- <file>` before editing.

Answers: **report 16** ("bug or limitation?") — a limitation of the stock path (first Pexels result for a query; cannot depict a specific person), addressed by Task 8's AI-stills default. **Report 13** ("is the data dirty?") — not determined; needs the run's rows from preview (part 2).

## Moved to closure part 2 ([`closureTask2.md`](../closureTask2.md))

| Item | Reason |
|---|---|
| R0 — triage of all 24 reports via `bugs.updateTriage` | Needs the live preview app and an owner session / ops token. |
| R2 rest, report 6 | Needs preview rows and the VPS `AI_VISUALS_STUB`. |
| R1 step 7 — image/`unknown` cost rows | Moved by the founder; overlaps Task 8's `generateVideo` rewrite. |
| R3 steps 1/3 — reproduce reports 7/8, re-test report 9 | Needs preview data. |
| R5 reports 12-13 | Needs a live run through Gate 2. |
| R6 reports 14-15 | Needs preview plan / source-id data. |
| R7 (reports 17-18), R8 (report 19), R9 (report 20), Appendix A areas | Need a device, listening test, or the triage pass. |

## What the founder does next (deploy and re-test)

1. **Deploy order**: server first, then the OTA app update (`eas update --branch preview`; the app changes are JS-only, no APK). The app falls back to the old fields against an older server, but `dashboard.gates` and the new cost fields appear only once the server has them.
2. Re-run the R1 diagnostic SQL after deploy; the founder applied step 6 on 2026-10-06 (override NULL, pool 40.00), so `d0617c67…` gets $20 per channel.
3. Re-test on the preview app: a budget-refused run's text and Retry message, the Dashboard "Spend this week" and approval-gates cards, the inbox labels, and the run Details labels.
4. If more tenants exist with a $2.00 pool (`a25db916…`, `913fee7d…`, the MVP tenant), set their weekly budgets explicitly; override validation will refuse any override on a $2 pool with two channels.

## Deviations
- `isBudgetAvailable` kept as a wrapper; `loadChannelBudgetView` added so the gate and the Dashboard share the same ceilings. Dashboard `totalSpendUsd` stays lifetime; the weekly figure is a new field. No schema change.
- `closureTask.md` is the task as handed over with a short repo note at the top and the confirmed `MIN_CHANNEL_SHARE_USD` wording; `closureTask2.md` is a draft (no file was attached).

## Follow-up: Inbox labels, reminder text, restart duplicates, cost-card label (branch `BUGS_CLOSURE_INBOX`)

The founder tested PR #48 after the OTA: Dashboard correct, but every Inbox gate card still said "Approval needed" and a resolved card never showed the decision.

### 1. Why R4's labels did not render (root cause: an app bug, not the payload)

- **What the app expects:** `gateOf(message)` in `app/app/(app)/(tabs)/notifications.tsx` reads the gate number from the first line of the notification message (`Gate 1 — <channel>` / `Gate 2 — <channel>`). Any other result falls back to the generic "Approval needed" chip, and the decision lookup is skipped for a card whose gate is unknown.
- **What the payload contains:** exactly that. The server writes the message from `formatGateMessage` / `formatGate2Message` (and also on a restart re-send, with a second line). It is the only code path that creates an `approval_request`. The payload was fine.
- **The bug:** R4's regex was meant to be `/^Gate ([12])\b/`, but the file held a literal backspace character (0x08) in place of the `\b` escape, so the pattern required a backspace after the digit and never matched. Every gate card therefore fell back to "Approval needed", and with `gate === null` the resolved-decision lookup never ran, so a resolved card showed only "Resolved 5m ago". Checked by running the old and new regex from the actual source files against the real server messages: main gives `NO MATCH` for both gates, the fix gives `1` and `2`. A scan of `app/`, `studio/src` and `studio/scripts` found no other control characters.
- **Fix (app only, no payload change):** `/^\s*Gate ([12])(?!\d)/`. Not an OTA-not-delivered problem (the Dashboard cards come from the server, so they could not show whether the OTA had arrived; the Inbox could not render the new labels with this regex whichever bundle was running).
- **Guard:** a server-side test (`inbox-closure.test.ts`) asserts that the real Gate 1 and Gate 2 messages, fresh and re-sent, all match the same pattern, so the message format and the app's reader cannot drift apart silently.
- Not verified on a device (typecheck/lint only).

### 2. Reminder text

`gate-reminder.ts`: the reminder is now `Reminder: "<first line of the brief>" on <channel name> has been waiting at Gate N for about Xh. Open the app to respond.` (brief line trimmed to 80 characters; if the brief is empty only the channel name is used). No run id in the text. `threadKey` is unchanged, so the push still deep-links.

### 3. Restart re-send duplicates

`notification.repository.ts` gains `insertOrReuseApprovalNotification`: if the recipient already has an unresolved `approval_request` for that run (`threadKey`), the existing card is reused and nothing is inserted; otherwise a new row is created. `InAppChannel.requestApproval` uses it, so a restart re-send no longer adds a card. Gate 1 then Gate 2 of the same run still get separate cards, because the earlier card is resolved first. The reused card keeps its original text and time, so the "Re-sending after a restart" line is not shown on the inbox card (the push and any other channel still send it). Unit-tested with a mocked Prisma client. Cards that were duplicated before this deploy stay until they are resolved (a gate decision resolves every open card for the run). No schema change.

### 4. Cost card

`dashboard.tsx`: the per-video line now reads `$X per published video (all time, not this week)`. The number itself is unchanged.

### Verification

- studio: `npm run typecheck`, `npm run lint` clean; `npx vitest run`: 335 passed, 49 skipped (54 files passed, 9 skipped). New tests in `src/notifications/inbox-closure.test.ts` (5).
- app: `npx tsc --noEmit` clean; `eslint` on the two changed screens clean.
- No sandbox database run (the dedupe is a single find-then-insert covered by the mocked test). `sevenai_preview` and `sevenai_dev` were not touched.

### Founder re-test

Server deploy first (items 2 and 3 are server-side), then `eas update --branch preview` for the app (items 1 and 4, JS only, no APK). Then: a new Gate 1 card reads "Script approval", a Gate 2 card "Video approval"; after deciding, the card reads e.g. "Script approval · Approved". Restart the server with a gate open and confirm the Inbox keeps one card for it.
