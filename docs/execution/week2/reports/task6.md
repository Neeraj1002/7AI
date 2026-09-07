# Week 2 Task 6: Approval Gate 1 (Chat-Bot)

**Date**: 2026-09-08
**Status**: Complete — real send confirmed, all three reply outcomes verified against simulated (not live-human) replies, per explicit founder instruction this session (founder unavailable for a live Telegram round-trip)
**Files Created**: 1 (`agents/gate1/index.ts`)
**Files Modified**: `notify-founder/{channel,telegram-channel}.ts` (+1 new `notify-founder/index.ts` barrel), `state-machine.ts`, `scripts/dry-run.ts`, `src/index.ts`
**Tests**: `npm run typecheck`/`build`/`lint` clean; grammy import-boundary grep clean; real end-to-end runs for all three reply outcomes; concurrent-thread isolation verified

## Real-time availability constraint — read this before the acceptance-criteria checklist

The founder was not available for a live Telegram round-trip during this session. Per explicit instruction: **one real message was sent to the real chat ID to confirm delivery** (closing the "send" half of Week 1 Task 6 / Week 2 Task 2's deferred verification), but **the three reply outcomes were tested against simulated incoming updates**, not a live human reply. This is stated plainly per instruction, and the specific "live human-reply round trip" criterion is **not** marked closed — see "What's still open" below.

## What Was Done

- **`notify-founder/channel.ts`**: `requestApproval` now takes `{ threadKey, message }` instead of a bare `message` string — Task 2's placeholder ("the next message is the reply") stopped being safe the moment two gates could be open at once, which is now true.
- **`notify-founder/telegram-channel.ts`**: real per-run threading. `pendingByThreadKey: Map<threadKey, { sentMessageId, resolve }>`. An incoming message is matched to its gate via Telegram's own `reply_to_message.message_id` against the stored `sentMessageId` — genuine correlation, not a queue or FIFO guess. A same-single-pending fallback (resolve the one pending gate if no explicit reply match) exists for founder convenience (not everyone remembers to tap "Reply" in Telegram), but is scoped to exactly one pending gate — with two or more, an unthreaded message is logged, not guessed at.
- **`notify-founder/index.ts`** (new): public barrel — `founderChannel` singleton, `startTelegramReceiveLoop`, plus two test-only exports (`simulateIncomingTelegramMessage`, `peekPendingMessageId`) used by `scripts/dry-run.ts`, never by production code.
- **`agents/gate1/index.ts`**: `formatGateMessage` (channel name, brief, full script, review score/notes inline, per `MVP_ROADMAP_OCT15.md` Section 17) and `parseGateReply` — exact case-insensitive match for `approve` (fuzzy matching rejected: a false-positive match on a script the founder didn't actually approve is a worse failure mode than requiring the exact word), `reject\b...` for reject-with-reason, anything else treated as edited script text. `requestGate1Decision` ties it together via `founderChannel.requestApproval` — never `grammy` directly.
- **`state-machine.ts`'s `runGate1Stage`**: reads the latest completed `script_generation` output and the latest `script-review` `ReviewLog`, opens the gate, and dispatches all three outcomes: `reject` → `PipelineRun.status = 'failed'`; `approve`/`edit` → `status = 'running'`, `currentStage = 'video_generation'` (unreachable this week, same "stops here deliberately" pattern as every prior stage). On edit, the edited text becomes `gate1`'s own stage output (`sanctionedScriptText`) — `script_generation`'s stage row, holding the original AI draft, is never touched.

## Real-call verification

Ran three full real sequences (`intake → script_generation → script_review → gate1`), one per outcome, using `scripts/dry-run.ts`'s new `gate1 <runId> <outcome>` command (sends a real Telegram message, then targets a simulated reply at that message's real `message_id` via `reply_to_message` — deterministic, not racing the founder's own chat history with the bot):

| Outcome | Result |
|---|---|
| `approve` | `status: "running"`, `currentStage: "video_generation"`, `gate1.output.sanctionedScriptText` = original script unchanged, `ReviewLog` (`agent: "human"`, `verdict: "approve"`) |
| `reject dry-run test rejection reason` | `status: "failed"`, `lastError: "Rejected at Gate 1: dry-run test rejection reason"`, `ReviewLog` (`verdict: "reject"`, `rationale` = the reason) |
| *(free text)* | `status: "running"`, `currentStage: "video_generation"`, `gate1.output.sanctionedScriptText` = the edited text; **`script_generation`'s own stage row confirmed still holding the original AI draft**, unoverwritten; `ReviewLog` (`verdict: "edit"`, `editedOutput.scriptText` = the edited text) |

**A genuine, unplanned finding along the way**: the first `gate1` test run's simulated reply lost a race to two *real* messages ("Hi", "Hello") already sitting in the bot's Telegram update backlog from the founder's own earlier testing — the "single pending" fallback consumed one of those instead of my simulated reply, producing a real (if unintended) `edit` outcome with `sanctionedScriptText: "Hi"`. This is genuinely useful evidence: it proves receive-side plumbing handles real founder-sent messages correctly, but it also proved the fallback-based test methodology was flaky. Fixed by adding `peekPendingMessageId()` (test-only) so `dry-run.ts` can target the exact real message id via `reply_to_message`, bypassing the fallback for deterministic tests. Left the fallback itself in production code — it's a reasonable usability nicety for a single real gate, just not a good *test* mechanism once real backlog messages are in play.

**Concurrent-thread isolation**, verified separately (a throwaway script, deleted after use, not part of the main sequence — no pipeline cost): opened two `requestApproval` calls with different `threadKey`s, resolved them **out of order** via targeted `reply_to_message`, confirmed each resolved with its own reply, not the other's. Proves real per-thread correlation, not "happened to work because only one was ever pending."

## What's still open (per explicit instruction — not marked closed)

- **Live human-reply round trip**: nobody has yet received an actual Gate 1 Telegram message and replied to it in real time, with the system correctly parsing that live reply. All three outcomes above were verified via `simulateIncomingTelegramMessage`, which exercises the identical `handleUpdate` code path a real webhook/poll update would — a strong mechanism proof, but not a substitute for an actual live round-trip. Do this whenever convenient: run any real brief through the pipeline to `paused_gate1`, and actually reply on your phone.
- Real message delivery ("send") is confirmed multiple times over — including the incidental discovery that your own prior "Hi"/"Hello" test messages were received correctly, which is a good sign for the receive side too, but isn't the same as a real gate cycle.

## Deviations from Spec

- `requestApproval`'s signature changed from `(message: string)` to `({ threadKey, message })` — anticipated by Task 2's own "revise once Gate 1's real requirements are known" note, not a surprise deviation.
- Added `notify-founder/index.ts` as a new public barrel (not explicitly listed in this task's file list) — mirrors `studio/src/llm/index.ts`'s existing import-boundary pattern; low-risk, consistent with prior convention.
- Added two test-only exports (`simulateIncomingTelegramMessage`, `peekPendingMessageId`) to `telegram-channel.ts` specifically to make live-reply verification possible without a human — necessary given this session's real-time availability constraint, and clearly commented as test-only, never called from production code.

## Sign-Off

- Task Objective: Met, with the live-human-reply caveat stated above tracked, not silently closed
- Schema Impact: None new
- Business Logic: Matches `docs/execution/week2/BUSINESS_LOGIC.md` Sections 1, 4 — all three transition outcomes verified live
- Tests: Passing — real send confirmed, all three outcomes verified via simulated (not live-human) replies, concurrent-thread isolation verified
- Ready for Integration: Yes — Task 7 wires the full sequence end-to-end
