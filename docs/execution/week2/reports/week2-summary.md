# Week 2 Summary: Script Side

**Dates**: Week 2 (executed 2026-09-07 to 2026-09-08)
**Status**: All 7 tasks complete. The full text-only loop — a brief goes in, a founder decision comes out the other side, real LLM calls throughout — runs end-to-end. Two items intentionally left open, not blocking: a live (non-simulated) Gate 1 round trip, and YouTube OAuth/quota (Week 1 Task 7, founder-only, unrelated to this week's work).

## What Got Built

- **LLM / text-completion layer** (`studio/src/llm/`): provider-agnostic, purpose-keyed (`intake-parsing`, `script-generation`, `script-review`), built on Vercel AI SDK confined entirely behind `client.ts`. Extended mid-week to compute `costUsd` from a per-model pricing table, once Script Generation needed real cost tracking.
- **Founder notification / approval-gate interface** (`studio/src/notify-founder/`): split into `channel.ts` (interface) and `telegram-channel.ts` (the only file touching `grammy`), evolved from Task 2's flat single-pending placeholder to Task 6's real per-run threading via Telegram's `reply_to_message` correlation — verified with two concurrent gates resolving independently.
- **Intake migrated** off a direct Anthropic SDK call onto the new LLM layer, closing a Week 1 deferral. Its real-call path was verified against genuine, sensible model output.
- **Script Generation** (`studio/src/agents/script-generation/`): the first real agent and the first real money spent in the system. Brought `agent_quotas`/`usage_events` into existence alongside it, with a soft budget-ceiling gate ($2.00, founder-confirmed) checked before every call.
- **Script Review** (`studio/src/agents/script-review/`): a lightweight rubric score plus a video-generation-fit check, cheap-tier model (`claude-haiku-4-5`), no auto-revision loop — always completes regardless of score.
- **Approval Gate 1** (`studio/src/agents/gate1/`): the reply grammar from `MVP_ROADMAP_OCT15.md` Section 17 (`approve`/`reject [reason]`/edited-text), dispatching all three outcomes correctly, with the edited text becoming the sanctioned input for whatever comes next while the original AI draft stays untouched in history.
- **Resumability extended** across the whole sequence: `resume-on-startup.ts` previously only knew how to resume `intake` (all it needed to be, in Week 1) — Task 7 found and fixed this gap, and a real kill-mid-`script_generation` test confirmed clean recovery with no duplicate billing.

## What Deviated from the Docs, and Why

1. **`requestApproval`'s signature changed** from a bare `message: string` (Task 2) to `{ threadKey, message }` (Task 6) — anticipated by Task 2's own "revise once Gate 1's real requirements are known" note, not a surprise.
2. **Gate 1 threading is `reply_to_message` correlation, not Telegram forum topics** — the founder's chat with the bot is a private DM, which doesn't support topics. A same-single-pending fallback exists for founder convenience, scoped to exactly one open gate.
3. **`resume-on-startup.ts` needed a real fix, not just an extension** — it only dispatched to `runIntakeStage`; Task 7 added dispatch for all four real stages. This was caught by actually running the resumability re-test, not by inspection alone.
4. **An honest, unplanned finding**: once `resume-on-startup.ts` could resume every stage, running `resume` picked up *every* `PipelineRun` still sitting at `status = 'running'` in the dev database — including stale leftover test fixtures from Week 1 and earlier Week 2 testing, not just the intentional test target. This correctly incurred real (if small — about $0.03 total) spend on those old runs. It's the exact behavior "resumability" promises, applied honestly to real accumulated test data rather than a clean isolated fixture. Worth remembering for a real deployment: stale `running` rows are not free to leave lying around once every stage is resumable.
5. **Real-LLM verification for Week 1 Task 4/5**, previously deferred, was substantively closed this week (Task 3) — with a careful caveat that the first successful real call used this session's own sandbox API routing, not a founder-supplied key. That caveat is now moot: a real founder key landed in `.env.local` on 2026-09-07, and Tasks 4 through 7 all spent real money against it directly, no sandbox routing involved.
6. **A real bot token and chat ID landed mid-week** (2026-09-07), which is what made Task 6's real-send verification possible at all. The founder was not available for a live reply round trip during this session — an explicit instruction, not a workaround — so all three Gate 1 reply outcomes were verified against simulated incoming Telegram updates (the same `handleUpdate` code path a real webhook/poll update takes), with the live-human-reply criterion explicitly left open rather than marked closed.

None of these deviations required changing the fundamental shape of `SCHEMA.md` or `BUSINESS_LOGIC.md` — both were reviewed against actual implementation in Task 7 and found accurate, with a few implementation-detail notes added (see `BUSINESS_LOGIC.md`'s "Implementation Reconciliation" section). Week 1's stale "Known temporary coupling" note (flagged by Task 3, deliberately left as a follow-up) was also finally cleaned up in Task 7.

## Deliverables Checklist (from Task 7's acceptance criteria)

- [x] A single real brief flows through `intake → script_generation → script_review → paused_gate1` without manual intervention between stages (`scripts/dry-run.ts full`)
- [x] At `paused_gate1`, all three reply outcomes resume correctly (verified via simulated replies — see the live-round-trip caveat above)
- [x] Resumability re-verified across the longer sequence — real kill-mid-`script_generation`, clean resume, no duplicate `UsageEvent` rows
- [x] The budget-gate path exercised in this task's own integration verification, not just Task 4's isolated test
- [x] `docs/execution/week2/STATUS.md` — one row per task, 1 through 7
- [x] `SCHEMA.md`/`BUSINESS_LOGIC.md` reviewed and reconciled against actual implementation

## What Should Feed Into Week 3 Planning

- Video Generation (Week 3) is the next real agent — it should follow the same pattern Script Generation established: budget-gate check (a *separate* one, per this week's own note that Video Generation's cost gate is explicitly deferred to Week 3), per-attempt `UsageEvent` metering, Zod-validated output.
- `resume-on-startup.ts`'s dispatch table will need a `video_generation` entry the moment that stage exists — the pattern is now established (`STAGE_RESUMERS` record), just needs the new function added.
- The narrow non-atomic-write race between a stage's `completeStage` call and the following `updatePipelineRun(currentStage)` call (two separate writes, not one transaction) was noted during Task 7's resumability work but not fixed — low probability, pre-existing since Week 1, and fixing it would mean making repository functions transaction-aware across the board. Worth a real look once more stages exist and the odds of hitting that narrow window climb.
- Two things now genuinely block on the founder, tracked in `STATUS.md`: a live Gate 1 round trip (low urgency, mechanism already proven) and the Week 1 YouTube OAuth/quota submission (higher urgency — historically a 1-2 week lead time, and Week 3's Video Generation doesn't strictly need it, but Publishing eventually will).

## Cost Summary

Real money spent this week, across all verification (not production use — there isn't any yet): roughly **$0.06-0.08 total**, spanning Intake, Script Generation (premium tier), Script Review (cheap tier), and the incidental resumption of stale test runs during Task 7's resume-on-startup fix verification. Trivial in absolute terms, but tracked here for the same reason `UsageEvent` exists at all — cheap now, and the habit of actually looking matters more than the number.
