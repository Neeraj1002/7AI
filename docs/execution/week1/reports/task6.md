# Week 1 Task 6: Telegram Bot Scaffold

**Date**: 2026-09-07
**Status**: Code complete; end-to-end send/receive proof **pending — no bot token available
this session**
**Files Created**: `bot.ts`, `send-receive-loop.ts`

## What Was Done

- `src/notify-founder/bot.ts`: lazy-initialized `grammy` `Bot` instance, keyed off
  `TELEGRAM_BOT_TOKEN`, with a clear error if the token is missing rather than a confusing
  library-level failure.
- `src/notify-founder/send-receive-loop.ts`:
  - `sendToFounder(text)` — sends a plain message to `TELEGRAM_FOUNDER_CHAT_ID`.
  - `startReceiveLoop()` — logs every incoming text message (chat id, sender, text) via
    long-polling (`bot.start()`). No gate logic, no `approve`/`reject [reason]` parsing, no
    per-run threading — all explicitly deferred to Week 2 per `BUSINESS_LOGIC.md` Section 5.
- Wired into `src/index.ts`: the bot only starts if `TELEGRAM_BOT_TOKEN` is set, so the rest of
  the app (DB, orchestrator) stays testable independent of Telegram being configured.

## Deviations from Spec — send/receive not proven end-to-end this session

No Telegram bot token was available this session (founder chose to skip rather than create
one via @BotFather during this session). The code is written and passes build/lint, but
**the actual "bot sends a message and logs a reply" acceptance criterion has not been run.**

## What you need to do to close this out

1. In Telegram, message [@BotFather](https://t.me/BotFather), run `/newbot`, follow the
   prompts, copy the token.
2. Put it in `.env.local` as `TELEGRAM_BOT_TOKEN`.
3. Run the app (`npm run dev` or `node dist/index.js` after `npm run build`) — it will log
   `[telegram] bot @<username> started, listening for messages`.
4. Message the bot from your own Telegram account. The app logs the incoming message
   including your chat id — copy that into `.env.local` as `TELEGRAM_FOUNDER_CHAT_ID`.
5. Call `sendToFounder('test')` (e.g. from a throwaway script, mirroring
   `scripts/dry-run.ts`'s pattern) and confirm you receive it.

## Test Results

```
npm run build   -> clean
npm run lint    -> clean
Send/receive proof -> NOT RUN this session (no token available)
```

## Sign-Off

- Task Objective: Code complete; runtime proof pending your bot token
- Business Logic: Matches `BUSINESS_LOGIC.md` Section 5 scope (no gate logic built)
- Tests: Build/lint passing; functional send/receive test not yet run
- Ready for Integration: Code yes; functionally unverified until you complete the steps above
