# Sprint 2 Task 6: Founder Daily Digest + Post-Hoc "Why Didn't It Work" Tagging

**Date**: 2026-09-16
**Status**: Complete — Sprint 2 done
**Files Created**: 3 (`docs/execution/sprint2/tasks/task6.md`, `studio/src/run-pipeline/founder-digest.ts` + `.test.ts`, `studio/src/run-pipeline/post-hoc-tag.ts` + `.test.ts`)
**Files Modified**: 5
**Tests**: All Passing (`npm run build && npm run lint && npm run typecheck && npm test` — 79 tests,
all clean)

## What Was Done

### I1 — Founder daily digest

A new periodic checker, `run-pipeline/founder-digest.ts`, registered in `index.ts` the same way
`gate-reminder.ts` already is — a plain `setInterval` tick against Postgres, no new job-queue/cron
dependency. "Is it due" is judged against a real, persisted `Tenant.lastFounderDigestSentAt` (one
additive, nullable migration), not elapsed process uptime — this dev process has restarted far more
often than once a day across this entire session, so a naive `setInterval(fn, 24h)` would likely
never actually fire in practice. `FOUNDER_DIGEST_CHECK_INTERVAL_MS` (default 30 min) controls how
often the checker itself runs; `FOUNDER_DIGEST_INTERVAL_MS` (default 24h) controls how long must have
elapsed since the last real send before another is due — the same two-knob shape
`GATE_REMINDER_CHECK_INTERVAL_MS`/`GATE_REMINDER_THRESHOLD_MS` already established.

Per active channel (single-tenant, `MVP_TENANT_ID`, same assumption every other repository/dashboard
query in this codebase already makes): completed-run count since the last digest (with real run ids),
`needs_attention` count, and `paused_gate1`/`paused_gate2` ("waiting on you") count — sent via the
existing `founderChannel.notify` interface, no new transport code. `Tenant.lastFounderDigestSentAt`
is only updated **after** a real send succeeds, never speculatively before, so a failed send is
naturally retried on the next tick.

### I2 — Post-hoc "why didn't it work" tagging

A real, free-form Telegram command, `tag <runId> <word> [notes]`, parsed by a new, pure
`parsePostHocTagCommand` (`run-pipeline/post-hoc-tag.ts`) and routed from
`notify-founder/telegram-channel.ts`'s existing `message:text` handler — checked first,
unconditionally, before the existing reply-to-message/single-pending-gate resolution logic, so a tag
command can never be accidentally consumed as an edited-script reply to an unrelated, simultaneously
open gate. This is the project's first genuinely *unsolicited* incoming message: every prior flow
(`requestApproval`) only ever resolves a promise the original caller is already blocking on.

A matched command writes a new `ReviewLog` row via the existing `insertReviewLog` repository
function — no schema change at all — distinguished by a new `agent: 'founder-post-hoc'` value so
`dashboard.repository.ts`'s existing `agent = 'human'` gate-rate queries can't accidentally pick
these up. No fixed tag vocabulary is enforced: the design doc's own examples ("weak hook," "topic
already saturated," "bad thumbnail frame") are illustrative, not exhaustive, matching the design
doc's own "cheap" framing over a rigid enum the founder would have to memorize.

`parsePostHocTagCommand` returns one of three outcomes, not just "matched or not": a well-formed
`command`, a `malformed` attempt (starts with the word `tag` but doesn't otherwise parse — gets a
real usage-hint reply, not silent fallthrough), or `not-a-tag-attempt` (doesn't start with `tag` at
all — untouched, falls through to the pre-existing gate-reply logic unchanged, since it could
legitimately be an edited script). This three-way split was a direct response to this task's own
Verify step, which explicitly asked for a real, honest reply on a malformed attempt rather than
silence.

## Verification — real, live, per the task's own bar

1. **A real digest, sent over real Telegram, with real counts from the real dev database.**
   `dry-run.ts digest` (first-ever call, `Tenant.lastFounderDigestSentAt` was `null`) sent
   successfully — `sent=true` — covering the one real active channel with its actual completed/
   needs-attention/waiting counts (58 real `needs_attention` rows had accumulated across this
   session's testing; more on that below).
2. **`Tenant.lastFounderDigestSentAt` was actually persisted**, confirmed via a direct DB read
   (`2026-09-16T09:58:23.975Z`), and a second, immediate `dry-run.ts digest` call correctly reported
   `sent=false` — the due-check genuinely prevents a duplicate send, not just in theory.
3. **A real Telegram message-length constraint, found and handled before it could bite.** The real
   dev database had accumulated 58 `needs_attention` `PipelineRun` rows from this session's own
   testing — enough that listing every one individually would have exceeded Telegram's real
   4096-character `sendMessage` limit and made the real send itself fail. Caught by inspecting the
   real row counts before the first live send (not discovered via a failed API call), and fixed with
   a real per-category cap (5 listed, `"...and N more"`) plus a defensive whole-message truncation —
   verified by the real send actually succeeding against this exact real data.
4. **A real tag command against a real, existing completed run.** `dry-run.ts tag <realRunId>
   weak_hook "the opening was too slow, took 8 seconds..."` produced a real `ReviewLog` row, read
   back directly from the database with the exact `agent: 'founder-post-hoc'`, `verdict: 'weak_hook'`,
   and `rationale` text sent.
5. **A real, live-found bug, caught and fixed within this task.** The first version of the Telegram
   handler used `void recordPostHocTag(...).then(...)` (fire-and-forget). The first real
   `dry-run.ts tag` run reported success but the `ReviewLog` row genuinely did not exist afterward —
   `dry-run.ts`'s own process exit (immediately after `simulateIncomingTelegramMessage` resolves) beat
   the fire-and-forget promise to completion, since grammy's `handleUpdate` only awaits what the
   handler function itself returns, not an unawaited promise started inside it. This isn't only a
   test-harness artifact — the identical race exists in production any time the process is
   mid-shutdown when a tag command arrives. Fixed by making the handler `async` and genuinely
   `await`-ing the write and the reply; re-run confirmed the real row now exists.
6. **A real "run not found" reply for an unknown run id**, confirmed via an added log line
   surfacing the exact real reply text: `"No run found with id 00000000-0000-0000-0000-000000000000
   — check the id and try again."`
7. **A real malformed-command reply**, confirmed the same way: `tag not-a-real-uuid weak_hook
   "malformed test"` produced `"\"not-a-real-uuid\" doesn't look like a real run id (expected a full
   UUID, like the ones in the daily digest)."` — not silence.
8. **No regression in the existing gate-reply flow.** A full real run through intake → script
   generation → script review → a real Gate 1 approve (real Telegram message, simulated reply)
   completed successfully after the handler was made `async` and the new tag-command branch was
   added ahead of the existing reply-to-message logic — confirming the reordering didn't break the
   pre-existing, working flow.

## Files Created/Modified

- Created:
  - `docs/execution/sprint2/tasks/task6.md`
  - `studio/src/run-pipeline/founder-digest.ts`, `founder-digest.test.ts`
  - `studio/src/run-pipeline/post-hoc-tag.ts`, `post-hoc-tag.test.ts`
- Modified:
  - `studio/src/models/schema.prisma` — `Tenant.lastFounderDigestSentAt`
  - `studio/src/types/tenant.types.ts` — domain field
  - `studio/src/models/repositories/tenant.repository.ts` — `updateTenantLastDigestSentAt`
  - `studio/src/config/env.ts` — `FOUNDER_DIGEST_INTERVAL_MS`, `FOUNDER_DIGEST_CHECK_INTERVAL_MS`
  - `studio/src/notify-founder/telegram-channel.ts` — the new tag-command branch, made `async`
  - `studio/src/index.ts` — `startFounderDigestChecker`
  - `studio/scripts/dry-run.ts` — `digest`/`tag` commands, for real manual verification

## Schema Changes Applied

`Tenant.lastFounderDigestSentAt DateTime?` — real migration
(`20260916095129_sprint2_founder_digest`). I2 needed no schema change at all. See `sprint2/SCHEMA.md`.

## Test Results

```
npm run build       -> clean
npm run lint         -> clean
npm run typecheck    -> clean
npm test             -> 13 test files passed (13), 79 tests passed (79)
```

Plus the real, live Telegram/DB verification described above.

## Deviations from Spec

- **`parsePostHocTagCommand`'s three-way return type (`command`/`malformed`/`not-a-tag-attempt`)**
  wasn't in the original plan — the first version returned `PostHocTagCommand | null`, silently
  falling through on any non-match. This task's own Verify step ("a malformed/unknown-runId tag
  command gets a real, honest error reply rather than silently doing nothing") surfaced that a bad
  UUID or a missing tag word would otherwise go unanswered, which reads as the feature silently not
  working, not as a deliberate non-match. Split into three outcomes so a genuine typo gets a helpful
  reply while a message that never intended to be a tag command (an edited script, say) stays
  untouched.
- **The Telegram handler was made `async`, a real fix for a real bug found during this task's own
  live verification** (see Verification item 5) — not a spec change, but worth flagging since it
  touches the shared `message:text` handler every gate reply also goes through. Re-verified via a
  real Gate 1 approve flow afterward with no regression.
- **A per-category run-listing cap plus a defensive whole-message truncation**, not in the original
  plan — found necessary only once the real dev database's actual row counts (58 accumulated
  `needs_attention` test runs) were checked against Telegram's real, documented 4096-character
  `sendMessage` limit, before the first live send rather than after a failure.

## Sign-Off

- Task Objective: Met. I1 sends a real digest with real counts, safely handling a real message-length
  constraint. I2 writes real `ReviewLog` rows from a real Telegram command, replies honestly on every
  outcome (success, unknown run, malformed input), and a real, live-found data-loss bug was caught
  and fixed within the same task rather than shipped.
- Schema Impact: One small, additive migration (`Tenant.lastFounderDigestSentAt`). See
  `sprint2/SCHEMA.md`.
- Business Logic: `sprint2/BUSINESS_LOGIC.md` updated with both flows' design and the real
  fire-and-forget finding.
- Tests: Passing (79/79), plus real live verification for every I1/I2 item above.
- Ready for Integration: Yes. No open founder action from this task. This was Track C's last item —
  Sprint 2 is complete.
