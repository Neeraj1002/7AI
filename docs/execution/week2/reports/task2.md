# Week 2 Task 2: Founder Notification / Approval-Gate Interface

**Date**: 2026-09-07
**Status**: Complete (code); live verification pending the same founder action as Week 1 Task 6
**Files Created**: 2
**Files Modified**: 1 (`index.ts`)
**Files Deleted**: 2 (`bot.ts`, `send-receive-loop.ts` — absorbed into `telegram-channel.ts`)
**Tests**: `npm run typecheck`/`build`/`lint` all clean; import-boundary grep clean

## What Was Done

- `channel.ts`: the `FounderChannel` interface — `notify(message): Promise<void>` and `requestApproval(message): Promise<{ reply: string }>`. Deliberately minimal per the task's own instruction: not the full Gate 1 UX (reply-command grammar, per-run threading), just "send a message, optionally wait for a reply."
- `telegram-channel.ts`: `TelegramFounderChannel implements FounderChannel`, absorbing Week 1's `bot.ts` (bot construction) and `send-receive-loop.ts` (receive loop, send helper) into one file — this is also now the *only* file allowed to import `grammy`, so keeping the Telegram logic in two files would have failed the acceptance criterion ("`grammy` is imported only inside the Telegram adapter file"). `requestApproval` sends via `notify` and resolves with whatever text message the bot receives next — a deliberate simplification that only holds because Week 2 doesn't yet have concurrent gates; flagged in the code comment for whoever builds Gate 1.
- `index.ts` updated to import `startTelegramReceiveLoop` from the new location instead of the deleted `send-receive-loop.ts`.

## Test Results

```
npm run typecheck   -> clean
npm run build       -> clean
npm run lint        -> clean

Import-boundary grep (grammy across studio/src):
  studio/src/notify-founder/telegram-channel.ts:1: import { Bot } from 'grammy';
  -> only telegram-channel.ts, as required.
```

### Live send/receive verification

Checked `docs/execution/week1/STATUS.md` per the task's instructions: Task 6 is still `Done — action needed` (`.env.local`'s `TELEGRAM_BOT_TOKEN` is still empty). Per the task's own guidance, this is **not a new blocker** — it's the same founder action Week 1 Task 6 already flagged (get a bot token via @BotFather). No regression testing against a live bot was possible this session; the refactor was verified by build/typecheck/lint and by inspection against Week 1's original logic (the message-received log line, the `sendMessage` call, and the long-polling `bot.start()` call are unchanged in substance, just relocated and wrapped behind the interface).

## Deviations from Spec

- Absorbed `bot.ts` into `telegram-channel.ts` entirely rather than keeping it as a separate file that `telegram-channel.ts` wraps — the task's own Implementation section allowed either shape ("whichever shape keeps the change smallest is fine, as long as the import-boundary rule holds"), and keeping `bot.ts` separate would have put a `grammy` import outside the one file the acceptance criterion names.

## Sign-Off

- Task Objective: Met
- Schema Impact: No schema changes (matches task spec)
- Business Logic: No new control flow (matches task spec)
- Tests: Passing; live Telegram verification still pending the founder's bot-token action from Week 1 Task 6 (not new)
- Ready for Integration: Yes — Script Review and Gate 1 are the first real callers of `requestApproval`, whenever they're built
