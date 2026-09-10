# Week 5 Business Logic Delta

**Status**: No new control flow this week. Task 1 verifies Week 1-4's existing transition table against real credentials for the first time — no new states, no new transitions.

## Implementation Reconciliation (added by Task 1)

- **A real, live end-to-end run reached `completed` for the first time**: real Anthropic calls
  (intake, script generation, script review, production planning, video review, metadata
  generation), real OpenAI TTS/transcription, real Pexels stock footage, both approval gates
  answered live by the founder over real Telegram, and a real private YouTube upload — confirmed
  directly via the YouTube Data API (`privacyStatus: "private"`), not inferred from a DB row. See
  `reports/task1.md` for the full evidence trail.
- **A real gap found in `runPeriodicPoll` (Week 4 Task 3)**: it iterated every "completed run with
  a published video" target without a per-target try/catch, so the first old run whose
  `youtubeVideoId` was a Week 4 stub value (`stub-...`, no longer a valid video once real
  credentials are in use) threw and aborted the entire poll tick — silently starving every other,
  genuinely real video of its snapshot. Fixed: each target's `recordSnapshot` call is now
  individually caught and logged, so one bad historic target no longer blocks the rest. This is
  exactly the kind of gap that only shows up once stub-completed data and real polling coexist —
  never hit in Week 4's testing since everything there was uniformly stubbed.
- **A real process-contention finding**: a persistent `npm run dev` instance (the actual
  orchestrator, already running with its own Telegram long-polling loop) conflicts with
  `dry-run.ts`'s one-off gate commands, which start a second competing long-poll for the same bot
  token — Telegram allows only one active `getUpdates` poller per token. Not a code bug (both are
  legitimate ways to run the app); a testing-methodology note: `dry-run.ts`'s live gate commands
  and a persistent `npm run dev` instance cannot coexist against the same bot token. Worth deciding
  later whether `dry-run.ts` should detect and defer to an already-running instance rather than
  requiring it to be stopped first.

## Reference
- `docs/execution/week4/BUSINESS_LOGIC.md` — the transition table this week verifies
