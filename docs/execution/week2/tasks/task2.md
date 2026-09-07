# Week 2 Task 2: Founder Notification / Approval-Gate Interface

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** It defines the Git Workflow (branch/commit/PR steps for this task), the `STATUS.md` update this task must make, and the section structure this file follows. This file states only this task's specifics — the template governs everything else, so don't skip it.

**Objective**: Split `studio/src/notify-founder/` into an interface (`requestApproval`, `notify`) and a Telegram adapter underneath, per `docs/decisions/LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md`, so future call sites (Script Review, Gate 1) never import `grammy` directly.
**Duration**: 2–3 hours
**Depends On**: Week 1 Task 6 (Telegram bot scaffold — code exists; live bot-token verification may still be a founder-pending item, check `docs/execution/week1/STATUS.md`)
**Owning Component**: Orchestrator (founder notification is an Orchestrator responsibility per `AGENT_FLEET_DESIGN.md` 4.10)
**Success Criteria**: `notify-founder/` exposes an interface that any future call site can depend on without knowing Telegram exists underneath; existing Week 1 send/receive behavior is preserved.

## Task Requirement

This is a smaller, more contained change than Task 1 — the decision doc deliberately deferred the *full* interface signature (the three-reply-command grammar, per-run threading, etc.) to Gate 1 itself, since that's not being built this task. Build a minimal-but-real interface sufficient for "send the founder a message, optionally wait for and return a reply" — not the full Gate 1 UX. Over-building this now, ahead of Gate 1's actual requirements, is the exact over-engineering Principle 10 warns against.

### Context
`docs/decisions/LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md`'s "Founder notification / approval-gate interface" section. `MVP_ROADMAP_OCT15.md` Section 17 (Gate 1's eventual reply grammar — for context on where this is headed, not something to build now).

### Acceptance Criteria
- [ ] An interface file (e.g. `studio/src/notify-founder/channel.ts`) defines `notify(message: string): Promise<void>` and `requestApproval(message: string): Promise<{ reply: string }>` (or equivalent — exact naming is this task's call, but keep it minimal).
- [ ] A Telegram adapter (e.g. `studio/src/notify-founder/telegram-channel.ts`) implements the interface using the existing `bot.ts`/`send-receive-loop.ts` logic.
- [ ] `grammy` is imported only inside the Telegram adapter file — verify with a grep.
- [ ] Existing Week 1 send/receive-loop behavior is unchanged in effect (regression-free), whether or not it can be live-verified this task (see Testing).

## Schema Impact

No schema changes.

## Business Logic / State Transition

No new `PipelineRun`/`PipelineStage` transitions. Gate 1's actual approval flow — which stages pause on which gate, how a reply resumes a run — is explicitly out of scope here; this task only prepares the interface boundary Gate 1 will later call into.

### Reference
`docs/decisions/LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md`.

## Implementation

### Files to Create
- `studio/src/notify-founder/channel.ts` — the interface.
- `studio/src/notify-founder/telegram-channel.ts` — the Telegram implementation, built from the existing `bot.ts`/`send-receive-loop.ts` logic.

### Files to Modify
- `studio/src/notify-founder/bot.ts`, `send-receive-loop.ts` — refactor into (or be absorbed by) `telegram-channel.ts`; whichever shape keeps the change smallest is fine, as long as the import-boundary rule holds.

### Detailed Steps
1. Read the existing `bot.ts` + `send-receive-loop.ts` to understand what Week 1 actually built.
2. Define the interface first (`channel.ts`), sized to what's genuinely known to be needed now.
3. Move the Telegram-specific logic behind it.
4. Grep-verify `grammy` only appears in the adapter file.

### Integration Points
- No other code calls into `notify-founder/` yet this week — this task is preparation, not wiring. Script Review and Gate 1 (whenever they're built) will be the first real callers of `requestApproval`.

## Testing

### Test Commands
```bash
npm run build
npm run lint
npm run typecheck
```

### Expected Results
- TypeScript compilation: No errors
- ESLint: No warnings
- Import-boundary grep: `grammy` only in `telegram-channel.ts`

### How to Verify
1. Run the three commands above.
2. Check `docs/execution/week1/STATUS.md` for Task 6's current status. If the founder has since added a live bot token: send a real test message through the new interface and confirm it arrives, close out Task 6's `Done — action needed` status. If not: note in this task's report that live verification is still pending the same founder action as Week 1 Task 6 — don't treat this as a new blocker, it's the same one.

## Additional Notes

Keep the interface's surface area small on purpose — it's meant to be revised once Gate 1 is actually built and its real requirements (reply parsing, threading) are known, not treated as final now.

## Links & References
- [LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md](../../decisions/LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md)
- [docs/execution/week1/STATUS.md](../week1/STATUS.md) — Task 6's status
- [MVP_ROADMAP_OCT15.md](../../roadmap/MVP_ROADMAP_OCT15.md) — Section 17, for context only
