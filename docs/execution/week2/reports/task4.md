# Week 2 Task 4: Script Generation Agent

**Date**: 2026-09-08
**Status**: Complete — real end-to-end verification performed, including the budget-gate path
**Files Created**: 6 (2 types, 2 repositories, 1 agent, 1 budget-gate module) + 1 migration
**Files Modified**: `state-machine.ts`, `schema.prisma`, `retry-with-backoff.ts`, `llm/{types,registry,client,index}.ts`, `parse-brief.ts` (dedup only), `scripts/dry-run.ts`
**Tests**: `npm run typecheck`/`build`/`lint` clean; real LLM call verified with sensible output; budget-gate path verified by deliberately exhausting the ceiling

## Budget ceiling — stated plainly, per this task's own instruction

**`AgentQuota.budgetCeilingUsd` was set to $2.00`** for `(tenant, youtube)`. This was explicitly confirmed with the founder before seeding (real money, not silently picked) — asked directly with a $5/$20/custom choice, founder replied "2" (i.e. $2.00). At Script Generation's actual observed cost (~$0.0047/call with `claude-sonnet-5`, see below), this allows roughly 400 real calls before the gate trips — a conservative backstop, trivially adjusted later since it's a plain config row (`UPDATE agent_quotas SET "budgetCeilingUsd" = ...`).

## What Was Done

- **Schema**: `agent_quotas` and `usage_events` tables migrated exactly per `docs/execution/week2/SCHEMA.md`, including the hand-added `platform` `CHECK` constraint (matching `channels.platform`'s convention) and the seed `AgentQuota` row. Migration confirmed idempotent (`prisma migrate deploy` → no pending migrations).
- **LLM layer extended** (Task 1's `studio/src/llm/`) to compute `costUsd`: `registry.ts` gained a `MODEL_PRICING` table (current Anthropic rates, confirmed via the `claude-api` skill: `claude-sonnet-5` $2/$10 per M input/output tokens, `claude-haiku-4-5` $1/$5, for Task 5's use). `client.ts` computes `costUsd` from token counts + pricing and now returns a `ProviderCallResult` (was `LLMResponse`); `index.ts`'s public `callLLM` attaches `provider`/`model` to form the full `LLMResponse` — so call sites can write a `UsageEvent` row without importing `registry.ts` directly, preserving Task 1's import boundary.
- **Error context for failed calls**: `TransientStageError`/`NonTransientStageError` (`retry-with-backoff.ts`) gained an optional `context` field; `client.ts` attaches `{ provider, model }` when it throws, and a new `getStageErrorContext()` helper reads it back. This exists because a failed call has no token counts to log, but the acceptance criteria still wants `provider`/`model` on its `UsageEvent` row — without this, a failed attempt could only log `'unknown'`/`'unknown'`.
- **`budget-gate.ts`**: `isBudgetAvailable(tenantId, platform)` — sums `UsageEvent.costUsd` across every channel on that `(tenant, platform)` (joining through `Channel`, since `UsageEvent` itself only stores `channelId`, not `platform`) and compares to `AgentQuota.budgetCeilingUsd`. Throws `NoBudgetConfiguredError` if no quota row exists, rather than silently allowing unlimited spend.
- **`agents/script-generation/index.ts`**: `generateScript({ topic, constraints, styleGuide })` — calls `studio/src/llm/` with `purpose: 'script-generation'` (already premium-tier `claude-sonnet-5` from Task 1, matching `AGENT_FLEET_DESIGN.md` 8.1's "don't cost-optimize this step"), validates the `{ scriptText, captions, hashtags }` response with Zod, same JSON-extraction/error-mapping convention Task 3 established for Intake.
- **`state-machine.ts`'s `runScriptGenerationStage`**: mirrors `runIntakeStage`'s shape — persist-before-advance, idempotent re-run on resume. New this task: the budget check runs *before* a real stage attempt exists (a refusal is recorded as a `skipped` stage, not `failed` — nothing actually ran); and **every real LLM attempt, including each retry, writes its own `UsageEvent` row** — the metering call is wrapped inside the function passed to `withRetryAndCircuitBreaker`, not once around the whole retried call, specifically so a retried call doesn't undercount real spend.
- Promoted `extractJsonText` (duplicated between Intake and now Script Generation) into `studio/src/llm/extract-json.ts`, a shared helper — the second real consumer is what earned this promotion, not done speculatively for one.

## Real-call verification (not a stub)

Given a real `ANTHROPIC_API_KEY` is now in `.env.local` (added 2026-09-07), ran a real end-to-end test per this task's own cost-conscious guidance (a small number of real calls, not looped iteration):

1. **Happy path**: a real brief ("why cats knead with their paws...") through `intake` → `script_generation` produced a genuinely good script, captions, and 7 hashtags. `UsageEvent` row: `340` input / `406` output tokens, `costUsd: "0.0047"`, `provider: "anthropic"`, `model: "claude-sonnet-5"`. `PipelineRun.currentStage` correctly advanced to `script_review`.
2. **Budget-gate path**: temporarily set the seeded `AgentQuota.budgetCeilingUsd` to `$0.001` (below the $0.0047 already spent), ran a fresh brief through intake (stubbed, to save cost — the gate test doesn't need a real intake call) and `script_generation`. Result: stage recorded as `skipped` (not `failed`), `error: "AgentQuota.budgetCeilingUsd would be exceeded"`, run moved to `needs_attention`, **zero** `UsageEvent` rows written (correctly — nothing ran). Restored the ceiling to `$2.00` afterward.

## Test Results

```
npm run typecheck   -> clean
npm run build       -> clean
npm run lint        -> clean

Real dry run (intake -> script_generation): sensible script + captions + hashtags,
  UsageEvent row with real token counts and costUsd, currentStage -> script_review
Budget-gate dry run (ceiling exhausted): stage skipped (not failed), needs_attention,
  zero UsageEvent rows, ceiling restored to $2.00 afterward
```

## Deviations from Spec

- `costUsd`'s placement inside `studio/src/llm/client.ts` (rather than, say, the agent computing it) matches the task's own instruction ("Task 4 confirms the exact placement") — no deviation, just confirming the design choice made concrete.
- Extended `TransientStageError`/`NonTransientStageError` with an optional `context` field (not in this task's file list) — necessary to satisfy "every call — success or failure — writes a UsageEvent row with resolved... provider, model" without the agent re-resolving the registry on a failure path, which would violate Task 1's import-boundary rule.
- `extractJsonText` promoted out of `parse-brief.ts` into a shared `studio/src/llm/extract-json.ts` — a direct, low-risk consequence of Script Generation needing the identical logic, not scope creep.

## Sign-Off

- Task Objective: Met
- Schema Impact: `agent_quotas`, `usage_events` created exactly per `docs/execution/week2/SCHEMA.md`; migration idempotent
- Business Logic: Matches `docs/execution/week2/BUSINESS_LOGIC.md` Sections 1-2 — budget-gate branch and `script_generation → script_review` transition both verified live
- Tests: Passing — real LLM call and budget-gate path both verified against real (not stubbed) behavior
- Ready for Integration: Yes — Task 5 (Script Review) consumes this stage's output directly
