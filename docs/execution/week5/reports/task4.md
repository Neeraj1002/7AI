# Week 5 Task 4: Fact-Check Flagging, Fair Budget Allocation, Model-Tier Cleanup, and a Real Test Harness

**Date**: 2026-09-13
**Status**: Complete
**Files Created**: 8 (`studio/scripts/set-channel-budget-override.ts`, `studio/vitest.config.mts`,
`studio/tsconfig.build.json`, one Prisma migration directory, 4 test files)
**Files Modified**: 8
**Tests**: All Passing (`npm run typecheck && npm run lint && npm run build && npm test` clean;
each of C1-C4 additionally verified live/real per its own acceptance bar)

## What Was Done

### C1 — Intake-parsing's model tier

`src/llm/registry.ts`'s `intake-parsing` entry changed from `claude-sonnet-5` to `claude-haiku-4-5`,
matching `script-review`/`video-intelligence-own-draft`'s existing correct cheap/fast tiering. The
registry's own comment block, which had explicitly called this out as an undecided deviation, was
rewritten to say it's fixed as of this task rather than leaving a stale note describing a bug that
no longer exists.

**Verification deviated from the task's suggested method, for a real reason.** The task asked to
confirm via a `UsageEvent` row recording `model = 'claude-haiku-4-5'` after a real Intake call. While
setting that check up, `grep` across `state-machine.ts` showed `runIntakeStage` never calls
`insertUsageEvent` at all — Intake has never written a `UsageEvent` row, in any week. So instead:

1. Called `callLLM({ purpose: 'intake-parsing', ... })` directly against a real brief and printed the
   raw response — confirmed the real Anthropic call came back tagged `model: claude-haiku-4-5`.
2. Ran a full real intake call through `dry-run.ts` and confirmed the parsed output was still
   structurally valid (the cheaper model didn't break extraction).
3. Queried `usageEvent` rows for that run afterward to double-check the metering gap itself —
   **0 rows**, confirming the finding rather than assuming it.

This metering gap is a genuine, previously-undocumented finding, not part of C1's scope (which was
specifically the model tier, not adding metering) — see Deviations below and the new
`KNOWN_ISSUES_AND_BLOCKERS.md` §3 entry.

The fix is also locked in by a real regression test (`src/llm/registry.test.ts`):
`resolvePurpose('intake-parsing')` is asserted to equal `{ provider: 'anthropic', model:
'claude-haiku-4-5' }`, so this exact deviation (an unreviewed default silently reappearing) can't
happen again unnoticed.

### C2 — Fair per-channel budget allocation

Implemented the founder-directed algorithm exactly as specified on 2026-09-13: equal split by
default, a per-channel override that always wins.

**Schema**: `Channel.budgetOverrideUsd Decimal? @db.Decimal(10, 2)`, added via a real
`prisma migrate dev --name week5_channel_budget_override` (not a `Json` convention this time — see
`week5/SCHEMA.md` for the full migration). `null` (every existing/new channel's default) means
"use the equal-split share"; a set value means "this channel's ceiling is exactly this."

**Allocation logic** — `computeChannelBudgetCeilings`, a pure function in `run-pipeline/budget-gate.ts`
with no DB access, specifically so it could be unit tested directly (see C4):
- Splits channels into overridden (`budgetOverrideUsd` set) and default-share (`null`).
- `reservedByOverrides` = sum of overridden channels' amounts; `remainingPool` = pool ceiling minus
  that, **floored at 0 with a loud `console.warn`** (naming the tenant/platform and the overshoot
  amount) if overrides alone exceed the pool — never silently divides by a negative number.
- `equalShare` = `remainingPool / count(default-share channels)`, guarded against divide-by-zero.
- Each channel's effective ceiling = its own override if set, else `equalShare`.

`isBudgetAvailable` gained a `channelId` parameter and now refuses if **either** the pool total is
exhausted (existing check, unchanged) **or** this channel's own spend
(new `sumUsageCostForTenantChannelPlatform`) meets or exceeds its effective ceiling. Both call sites
in `state-machine.ts` updated to pass `channel.id`; the refusal message updated to name both possible
causes since a caller can no longer assume pool-exhaustion was the reason.

**Setting an override**: `scripts/set-channel-budget-override.ts <channelId> <usdAmount|clear>`,
mirroring `scripts/set-budget-ceiling.ts`'s existing one-off convention exactly. No in-app UI — per
the task's own framing, that's Part 2 settings-screen territory, out of scope for a
single-founder-operator MVP.

**Verification — all four scenarios, against real fixture channels and a real DB**:
1. Two fixture channels, both `null` override, pool = $1000 (see Deviations for why not $10) — both
   resolved to a $500 effective ceiling.
2. Set one channel's override to $8 via the real script — that channel resolved to $8, the other
   correctly resolved to the *remaining* pool split (not still $500).
3. Drove the overridden channel's simulated spend to $8.01 — its `isBudgetAvailable` returned
   `false`; the other channel's was unaffected.
4. Pathological case — override sum ($15) exceeding a small pool ($10) — confirmed the warning fired
   with the exact `{ reservedByOverrides: 15, poolCeilingUsd: 10 }` shape, the default-share channel
   resolved to $0 (not negative/NaN), and nothing threw.

### C3 — Script Review's `factualConcerns`

Added `factualConcerns: z.array(z.string())` to `ScriptReviewOutputSchema` (empty when nothing looks
off) and a new paragraph to `SYSTEM_PROMPT` explicitly framing this to the model as a plausibility
check against its own knowledge, not a verified fact-check — `llm/client.ts` has no tool use or
retrieval wired in, confirmed by reading it before choosing this approach. Same call, same cheap
tier, no new `purpose` — mirrors the rest of Script Review's output into `ReviewLog.rationale`
(Week 2 Task 5's existing convention) via a new `factualConcernsNote` appended when non-empty.

**Verification — two real, contrasting LLM calls**, using the same niche/style inputs Week 2's
hummingbird test used:
- A script with a planted factual error (a wrong claim about a well-known phenomenon) produced a
  non-empty `factualConcerns` array naming the specific, correct concern.
- A clean script on the same topic/style produced an empty array.

A genuinely search-grounded fact-check (the model actually looking something up, as a distinct
`purpose`) is explicitly deferred — new integration scope once the LLM layer supports tool use, not
a same-shape addition to an existing call. Logged in `KNOWN_ISSUES_AND_BLOCKERS.md` §6.

### C4 — Real test harness

Adopted `vitest` (`npm install -D vitest`, `"test": "vitest run"` replacing the old
`echo "Error: no test specified" && exit 1` stub). Four test files, 27 real assertions, covering
exactly the four functions specified:

- `src/agents/gate1/index.test.ts` (6 tests) — `parseGateReply`: exact "approve" match, no
  fuzzy-match false positive on "approved!"/"not approve", reject-with-reason, bare reject, edit
  fallback, and a typo'd "aprove" correctly falling through to edit rather than false-matching
  approve.
- `src/agents/publishing/youtube-client.test.ts` (8 tests) — `mapGoogleError` (exported for direct
  testability): `ECONNREFUSED`/`ENOTFOUND`/`EAI_AGAIN` classified transient/retryable; HTTP
  503/429, `ECONNRESET`, `ETIMEDOUT` classified non-transient (this is exactly B4's classification
  from Task 2, which that task's own report flagged as "verified only by manual testing" — now a
  real regression test); and context preservation on the mapped error.
- `src/llm/registry.test.ts` (4 tests) — every registered purpose resolves to a valid
  provider+model; the C1 regression test described above; `script-generation` stays on the premium
  tier; pricing resolution for every in-use model, and a clear throw for an unknown model.
- `src/run-pipeline/budget-gate.test.ts` (8 tests) — `computeChannelBudgetCeilings`: equal split,
  override + remainder split (single and multi-channel), all-channels-overridden (no
  divide-by-zero), the pathological override-exceeds-pool warning (asserting the exact call
  arguments), no-warning-when-overrides-fit, a lone channel getting the full pool, and an empty
  channel list returning an empty map without throwing.

**A real build/test-config bug found and fixed while finishing this item**: after all four test
files passed individually, running the full required sequence together showed `npm run build`
compiling `.test.ts` files into `dist/**/*.test.js` (CommonJS output), and the subsequent `npm test`
picked up both the source tests (passing) and the compiled duplicates (failing —
`Error: Vitest cannot be imported in a CommonJS module using require()`) because `tsconfig.json` had
no test-file exclusion. Fixed at the root cause with two coordinated changes: `vitest.config.mts`
now explicitly sets `test.include: ['src/**/*.test.ts']` / `test.exclude: ['dist/**', 'node_modules/**']`
so vitest never scans `dist/` regardless of what's in it; and a new `tsconfig.build.json` (extending
the base config, additionally excluding `src/**/*.test.ts`) is what `npm run build` now points at,
so `dist/` never gets test files compiled into it in the first place — `npm run typecheck` still
uses the unmodified base `tsconfig.json` and continues to typecheck the test files. Verified by
deleting `dist/` entirely, rebuilding, confirming no `.test.js` files existed under it, then
re-running the full sequence clean.

DB-backed integration tests (the fixture-`PipelineRun` style tests Task 2/3 already do manually) are
explicitly deferred — real, valuable, genuinely bigger scope (test-DB setup) than this task, logged
in `KNOWN_ISSUES_AND_BLOCKERS.md` §6 as a Week 6 candidate.

## Files Created/Modified

- Created:
  - `studio/scripts/set-channel-budget-override.ts`
  - `studio/src/models/migrations/20260913173843_week5_channel_budget_override/migration.sql`
  - `studio/vitest.config.mts`
  - `studio/tsconfig.build.json`
  - `studio/src/agents/gate1/index.test.ts`
  - `studio/src/agents/publishing/youtube-client.test.ts`
  - `studio/src/llm/registry.test.ts`
  - `studio/src/run-pipeline/budget-gate.test.ts`
- Modified:
  - `studio/src/llm/registry.ts` — C1 tier fix + comment cleanup
  - `studio/src/agents/script-review/index.ts` — C3 `factualConcerns` field + prompt paragraph
  - `studio/src/run-pipeline/state-machine.ts` — C2 `isBudgetAvailable` call sites + refusal message; C3 `factualConcernsNote` in the rationale
  - `studio/src/models/schema.prisma` — C2 `Channel.budgetOverrideUsd`
  - `studio/src/types/channel.types.ts` — C2 domain type field
  - `studio/src/models/repositories/channel.repository.ts` — C2 `toDomainChannel` + `listActiveChannelsByTenantAndPlatform`
  - `studio/src/models/repositories/usage-event.repository.ts` — C2 `sumUsageCostForTenantChannelPlatform`
  - `studio/src/run-pipeline/budget-gate.ts` — C2 full rewrite (`computeChannelBudgetCeilings`, channel-aware `isBudgetAvailable`)
  - `studio/src/agents/publishing/youtube-client.ts` — C4, exported `mapGoogleError` for direct testability
  - `studio/package.json` — C4 `test`/`build` scripts, `vitest` devDependency

## Schema Changes Applied

`Channel.budgetOverrideUsd Decimal? @db.Decimal(10,2)` — real migration, applied via
`prisma migrate dev`. See `week5/SCHEMA.md` for the full column definition, SQL, and allocation
algorithm detail.

## Test Results

```
npm run typecheck   -> clean
npm run lint        -> clean
npm run build       -> clean (dist/ confirmed free of .test.js files)
npm test            -> 4 files passed (4), 27 tests passed (27)
```

### Real, live verification (summary — full detail above under each item)

- C1: direct `callLLM` call confirmed `claude-haiku-4-5`; real `dry-run.ts` intake call confirmed
  structural validity; `usageEvent` query confirmed (and helped discover) the Intake metering gap.
- C2: real fixture channels through all four specified scenarios (equal split, override, exceeding
  override, pathological over-allocation), against a real Postgres DB via `prisma`.
- C3: two real, contrasting Anthropic calls (planted-error script vs. clean script) on Week 2's
  hummingbird-style test inputs.
- C4: `npm test` real run, 27/27 passing, plus the full four-command sequence together.

## Deviations from Spec

- **C1's suggested verification (a `UsageEvent` row) doesn't apply — Intake writes none.** Not a
  deviation in the fix itself, but in how it was proven: verified via a direct `callLLM` call and a
  real `dry-run.ts` run instead. The underlying gap (`runIntakeStage` never calls
  `insertUsageEvent`) is a genuine, previously-undocumented finding, explicitly **not fixed** in this
  task — it's out of C1's stated scope (the model tier, not metering). Documented as a new
  tech-debt item in `KNOWN_ISSUES_AND_BLOCKERS.md` §3: real Anthropic spend from every Intake call
  across all five weeks has never been recorded in `UsageEvent`, which also means the pool-level
  budget check (`sumUsageCostForTenantPlatform`, used by C2) has always undercounted real spend by
  that amount.
- **C2's verification test initially used pool=$10 (per the task's own example numbers) and got a
  confusing result** — Step 3 (driving one channel's spend to $8.01) unexpectedly made the *other*
  fixture channel's `isBudgetAvailable` return `false` too. Investigation showed the pool-level check
  sums *all* historical `usage_events` for the tenant/platform with no time window, and the project's
  real accumulated spend from all prior weeks' testing (~$1.10) plus the test's own deltas pushed the
  cumulative total past $10 — correctly tripping the (separate, prior) pool-exhausted check, not a
  bug in the per-channel logic. Rescaled the test to pool=$1000 (well above real historical spend) to
  cleanly isolate per-channel allocation. Not a `budget-gate.ts` bug — the pool check summing all
  history with no window is existing, pre-Task-4 behavior, working as designed.
- **C3's fact-check is explicitly a plausibility check, not a verified one** — this was the task's
  own explicit framing (`llm/client.ts` has no tool use), not a scope-narrowing decision made
  independently. A real search-grounded version is deferred, logged in `KNOWN_ISSUES_AND_BLOCKERS.md`
  §6 as originally specified.
- **C4 surfaced and fixed a real build/test-config bug** (`dist/` pollution with compiled test
  files) that wasn't anticipated by the task spec — necessary to make `npm test` reliable at all
  once `npm run build` had run first, not optional polish.

## Sign-Off

- Task Objective: Met — all four items (C1-C4) fixed with real evidence; nothing silently skipped.
  The one new real finding (Intake's missing `UsageEvent`) surfaced during C1's verification is
  explicitly documented here and in `KNOWN_ISSUES_AND_BLOCKERS.md`, not silently absorbed or ignored.
- Schema Impact: One real migration — `Channel.budgetOverrideUsd`. See `week5/SCHEMA.md`.
- Business Logic: `week5/BUSINESS_LOGIC.md` updated with all four deltas; no transition-table changes.
- Tests: `npm run typecheck && npm run lint && npm run build && npm test` all clean; every C1-C4 item
  additionally verified live/real per its own acceptance bar above.
- Ready for Integration: Yes.
