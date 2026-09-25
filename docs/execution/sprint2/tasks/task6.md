# Sprint 2 Task 6: Founder Daily Digest + Post-Hoc "Why Didn't It Work" Tagging

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.**

**Objective**: Close out Track C's last two items — a periodic summary so multi-channel status
doesn't require checking each Telegram thread individually, and a cheap way for the founder to
attach their own post-hoc read on an underperforming video, feeding a richer training signal than
raw metrics alone.
**Duration**: 3-5 hours.
**Depends On**: None functionally (Track C, same "near-zero coupling to Track B" posture Tasks 4/5
established) — the last item in Track C per `MVP_PART3_CONTENT_QUALITY_AND_GROWTH_LOOP.md` §2 and
`SPRINT_ROADMAP.md`'s Sprint 2 scope line.
**Owning Component**: `run-pipeline/` (a new periodic checker, same shape as `gate-reminder.ts`),
`notify-founder/` (routing an unsolicited incoming command, a genuinely new direction for this
module), design docs.
**Success Criteria**: (1) A real digest message is sent over real Telegram, with real counts pulled
from the real database — not a synthetic example. (2) A real `tag <runId> <word> [notes]` command
sent over real Telegram produces a real `ReviewLog` row, readable back from the database. (3) An
unrecognized/malformed tag command gets a real, honest error reply, not silent failure or a crash.

## Task Requirement

### I1 — Founder daily digest
**Where**: `MVP_PART_3...md` §2 / `MVP_ROADMAP_OCT15.md` Section 17: *"One end-of-day summary across
all live channels — how many runs completed, how many are waiting on you — so multi-channel status
doesn't require checking each thread individually."*

**Fix**: A new periodic checker (`run-pipeline/founder-digest.ts`), registered in `index.ts` the same
way `gate-reminder.ts` already is (a plain `setInterval` tick against Postgres — this project's
established "cron + Postgres, no magic" convention; no new job-queue/cron-library dependency). Given
this project's dev process restarts far more often than once a day (confirmed across nearly every
task this session), a naive `setInterval(fn, 24h)` would likely never actually fire in practice — so
"is it due" is judged against a real, persisted `Tenant.lastFounderDigestSentAt` timestamp (a small,
additive migration), not just elapsed process uptime. The checker itself still runs on a much shorter
`setInterval` (checking "is it due yet," not "send now unconditionally"), mirroring
`GATE_REMINDER_CHECK_INTERVAL_MS` vs. `GATE_REMINDER_THRESHOLD_MS`'s existing two-knob shape.

Per active channel (this project's single-tenant assumption, same as every dashboard/repository
query already makes): count of runs completed since the last digest (or the trailing interval if no
digest has ever been sent), count of runs currently `needs_attention`, and count of runs currently
waiting on a gate (`paused_gate1`/`paused_gate2`) — real run ids included so a reply (I2 below) can
reference one directly. Sent via the existing `founderChannel.notify` interface — no new transport
code.

### I2 — Post-hoc "why didn't it work" tagging
**Where**: `MVP_PART3...md` §2: *"`ReviewLog` captures pre-publish verdicts only. Add a cheap manual
tagging step for the founder's own post-hoc read on an underperforming video ('weak hook,' 'topic
already saturated,' 'bad thumbnail frame') — much richer training signal for Continuous Learning than
raw metrics alone."*

**Fix**: A real, free-form Telegram command — `tag <runId> <word> [free-text notes]` — parsed by a
new, pure `parsePostHocTagCommand` (mirroring `gate1/index.ts`'s `parseGateReply`: exact grammar,
fail closed rather than guess), writing a real `ReviewLog` row via the existing `insertReviewLog`
repository function (`agent: 'founder-post-hoc'`, a new, distinct value from the existing `'human'`
gate-verdict rows so it can't be miscounted by `dashboard.repository.ts`'s existing gate-rate
queries). No fixed tag vocabulary is enforced — the design doc's own examples ("weak hook," "topic
already saturated," "bad thumbnail frame") are illustrative, not exhaustive, and a solo founder
typing their own words in their own language is the actual "cheap" this task asks for, not a rigid
enum they have to memorize.

This is the project's first *unsolicited* incoming Telegram message — every prior flow
(`requestApproval`) is outbound-initiated, with a reply only ever resolving a promise the original
caller is already blocking on. `notify-founder/telegram-channel.ts`'s message handler needs a new,
narrowly-scoped branch to route a `tag ...`-shaped message into `run-pipeline/post-hoc-tag.ts`'s
business logic before falling through to the existing reply-to-message/single-pending-gate
resolution logic — ordered so a tag command can never be accidentally consumed as an edited-script
reply to an unrelated, simultaneously-open gate.

**Verify**: a real end-to-end test — trigger `runFounderDigestCheck` for real (real Telegram message,
real counts against real DB rows), then send a real `tag <runId> ...` command back over Telegram
(simulated reply, same no-live-round-trip convention `dry-run.ts`'s `gate1`/`gate2` commands already
use) referencing a real, existing `PipelineRun`, and confirm the resulting `ReviewLog` row exists
with the real values via a direct DB read-back. Separately, confirm a malformed/unknown-runId tag
command gets a real, honest error reply rather than silently doing nothing.

## Schema Impact
One small, additive migration: `Tenant.lastFounderDigestSentAt DateTime?` — nullable, `null` for
every existing tenant (never sent yet). No other schema changes — `ReviewLog` already has every
column I2 needs (`agent`/`verdict`/`rationale`, `stageId` already nullable for a use case with no
specific stage).

## Business Logic / State Transition
Neither I1 nor I2 touches `PipelineRun.status` or the state machine's own transitions — both are
read-only observers (I1) or an out-of-band annotation (I2) layered on top of the existing pipeline,
not a new stage.

## Testing
```bash
npm run build && npm run lint && npm run typecheck && npm test
```
Plus I1/I2's real live Telegram verification described above.

### Documentation reconciliation
- `docs/execution/sprint2/{SCHEMA,BUSINESS_LOGIC,STATUS}.md`.
- `docs/design_doc/MVP_PART3_CONTENT_QUALITY_AND_GROWTH_LOOP.md`: mark both items picked up.
- `docs/execution/KNOWN_ISSUES_AND_BLOCKERS.md`: only if real testing turns up a real founder-action
  gap or design finding, per this project's established practice.

## Report Template
`execution/sprint2/reports/task6.md`, standard shape.
