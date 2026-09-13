# Week 5 Task 4: Fact-Check Flagging, Fair Budget Allocation, Model-Tier Cleanup, and a Real Test Harness

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.**

**Objective**: Close out the four real, still-open items from `KNOWN_ISSUES_AND_BLOCKERS.md` Section 2/3
that Week 5 Task 2 did **not** cover (Task 2 handled B1/B2/B4 — the transaction race, the stale-resume
sweep, and Publishing's upload idempotency; this task is everything else still open in those sections
that isn't a founder-external blocker).
**Duration**: 5-7 hours (C2 now includes a real Prisma migration and a founder-facing override script,
not just a runtime formula)
**Depends On**: Week 5 Task 1 (real end-to-end run) — done. Independent of Task 2/3's specific fixes,
but sequenced after them so this doesn't collide with B1-B5's in-flight changes to the same files.
**Owning Component**: Script Review agent, LLM registry, Orchestrator (`run-pipeline/budget-gate.ts`),
new test infrastructure.
**Success Criteria**: Every item below is fixed with evidence, or explicitly deferred in the report
with a stated reason — no silent skips. Same bar as Task 2.

## Task Requirement

### C1 — Intake-parsing is on the wrong model tier
**Where**: `src/llm/registry.ts` line 33 — `'intake-parsing': { provider: 'anthropic', model: 'claude-sonnet-5' }`.
Classified as extraction/classification (cheap/fast tier) per `AGENT_FLEET_DESIGN.md` 8.1, but still
resolves to the premium model — inherited unchanged from Week 1's original default, never a deliberate
choice (confirmed by the registry's own comment at lines 12-14).
**Fix**: change the entry to `claude-haiku-4-5`, matching `script-review` and
`video-intelligence-own-draft`'s existing correct tiering. Update the file's own comment block (lines
8-20) to drop this from the list of known deviations once fixed — don't leave a stale note describing
a bug that no longer exists.
**Verify**: one real Intake call (a fresh brief through `parse-brief.ts`) confirms the resulting
`UsageEvent` row records `model = 'claude-haiku-4-5'` and produces a structurally valid parsed brief —
same acceptance bar as any other tier change, since a cheaper model must still actually do the job.

### C2 — Pooled per-platform budget has no fair-access policy across channels
**Where**: `src/run-pipeline/budget-gate.ts` — `isBudgetAvailable(tenantId, platform)` checks only the
pooled total (`sumUsageCostForTenantPlatform` vs. `AgentQuota.budgetCeilingUsd`), with no per-channel
awareness at all. Flagged since `AGENT_FLEET_DESIGN.md` Section 6.4: pooling the ceiling doesn't
guarantee fair access to it — one channel's runs processing first each day could consume the whole
platform budget before other channels are ever scheduled.

**Fix (founder direction, 2026-09-13): equal split by default, per-channel override available.**
Every channel on a platform starts with an equal share of that platform's pooled
`AgentQuota.budgetCeilingUsd` — but a specific channel's share must be independently adjustable (a
channel you care more about gets a bigger reservation; a low-priority one gets less), not fixed at
`1/N` forever. This is a real, persisted per-channel setting, not just a runtime formula, so it needs
an actual schema change:

**Schema**: add `Channel.budgetOverrideUsd Decimal? @db.Decimal(10, 2)` (nullable — `schema.prisma`,
next to the other channel-level settings like `postingCadence`). `null` (the default for every
existing and newly-created channel) means "use the equal-split share"; a set value means "this
channel's ceiling is exactly this, regardless of channel count."

**Allocation logic** (`budget-gate.ts`, or a new `computeChannelBudgetCeiling` helper alongside it):
1. Load the platform's `AgentQuota.budgetCeilingUsd` (the pool) and every active `Channel` for that
   `(tenantId, platform)`.
2. Split channels into overridden (`budgetOverrideUsd` set) and default (`null`).
3. `reservedByOverrides` = sum of all overridden channels' `budgetOverrideUsd`.
4. `remainingPool` = `budgetCeilingUsd - reservedByOverrides`. **If this goes negative (overrides
   alone exceed the pool), don't silently divide by a negative number** — treat it as a real
   misconfiguration: log a clear warning naming the tenant/platform and the overshoot amount, and
   floor `remainingPool` at 0 (every default-share channel gets $0 until the founder fixes the
   overrides or raises the pool). Surface this loudly, don't bury it.
5. `equalShare` = `remainingPool / count(default-share channels)` (0 if there are none, guard the
   divide-by-zero).
6. This channel's effective ceiling = its own `budgetOverrideUsd` if set, else `equalShare`.
7. `isBudgetAvailable(tenantId, channelId, platform)` returns `false` if **either** this channel's own
   spend (new repository query, `sumUsageCostForTenantChannelPlatform` alongside the existing
   `sumUsageCostForTenantPlatform` in `usage-event.repository.ts` — `UsageEvent` already carries
   `channelId`) exceeds its effective ceiling, **or** the pool total is exhausted (existing check,
   unchanged). Update every call site (search for it — at minimum the video-generation budget gate per
   `week2/BUSINESS_LOGIC.md` Section 2) to pass `channelId`.

**Setting an override**: the app has no channel-settings UI yet (per the roadmap doc, channel config
is still founder-edited directly for the MVP — same posture as everything else channel-level right
now). Add a `scripts/set-channel-budget-override.ts <channelId> <usdAmount|clear>` script, same shape
and same throwaway/one-off convention as the existing `scripts/set-budget-ceiling.ts` (`clear` sets it
back to `null`, i.e. back to the equal-split default). A real in-app control for this is Part 2 UI
work (`MVP_PART2_MULTI_USER_AND_FLEXIBLE_CREATION.md` territory, once there's an actual settings
screen) — don't build one now, the script is the correct scope for a single-founder-operator MVP.

**Migration**: a real Prisma migration this time (`prisma migrate dev`), not just a documented `Json`
convention — `budgetOverrideUsd` is a new typed, nullable column. No backfill needed: every existing
channel is `null` by construction, which is exactly the equal-split default.

**Verify**: (1) two fixture `Channel`s on the same tenant/platform, both `null` override, pool = $10 —
confirm each resolves to a $5 effective ceiling. (2) Set one channel's override to $8 via the new
script — confirm that channel now resolves to $8 and the other resolves to the remaining $2 (not
still $5). (3) Drive the overridden channel's simulated spend to $8.01 — confirm its
`isBudgetAvailable` returns `false` while the other channel's is unaffected. (4) A deliberately
pathological case — override sum exceeding the pool — confirm it logs the warning and doesn't throw
or produce a negative/NaN share.

### C3 — Script Review has no factual-accuracy check
**Where**: `src/agents/script-review/index.ts` — the rubric (`ScriptReviewOutputSchema`, lines 12-21;
`SYSTEM_PROMPT`, lines 29-47) scores quality/engagement/clarity/brand/video-gen-fit but never asks the
model to look at factual claims at all. Open since Week 2 (`AGENT_FLEET_DESIGN.md` 4.5's Open
Questions) — surfaced by a real test script about hummingbird flight biomechanics that happened to
hold up, but nothing would have caught it if it hadn't.
**Real constraint worth knowing before choosing an approach**: `src/llm/client.ts` calls
`generateText` with no tool use wired in at all (confirmed reading it for this task) — there is no
web-search or retrieval grounding anywhere in the LLM layer today. A genuinely verified fact-check
(the model actually looking something up) is new integration scope, not a same-shape addition to an
existing cheap-tier call.
**Recommended fix, matching the project's own "don't over-engineer" principle**: extend the *existing*
`script-review` call rather than add a new purpose or a new call — add a `factualConcerns: string[]`
field to `ScriptReviewOutputSchema` (empty array if none) and a paragraph to `SYSTEM_PROMPT` asking the
model to flag any specific factual claims that seem incorrect, outdated, or unverifiable **based on
its own knowledge** — explicitly framed to the model (and in this codebase's comments) as a
plausibility check, not a verified fact-check, since there's no grounding. This costs nothing extra
(same call, same cheap tier) and turns an unreviewed gap into at least a flagged one the founder sees
at Gate 1 alongside the rest of the review. Mirror `factualConcerns` into `pipeline_stages.output`
same as the rest of the review output, same pattern Week 2 Task 5 established.
**Explicitly out of scope for this task, worth a line in the report as a deferred idea**: a real
search-grounded fact-check pass as a distinct `purpose` (`script-review-factcheck` or similar) once
the LLM layer actually supports tool use — bigger lift, not this task.
**Verify**: a real script with at least one planted factual error produces a non-empty
`factualConcerns` array; a real script with no planted errors produces an empty array on the same
niche/style inputs Week 2's hummingbird test used, or similar — show both.

### C4 — No automated test runner exists anywhere in the project
**Where**: `package.json`'s `"test"` script is still the default `echo "Error: no test specified" &&
exit 1` stub. Every verification across five weeks and the frontend track has been real/manual — rigorous,
but no regression suite, and it doesn't scale as business logic accumulates (the doc's own words).
**Fix, scoped deliberately narrow — don't try to stand up full DB-integration testing in this task**:
adopt `vitest` (TypeScript/ESM-native, no config ceremony, fits the existing `tsx`-based toolchain)
and write real unit tests for pure-logic functions that don't need a live database or LLM call —
exactly the functions already sitting there untested:
- `parseGateReply` (`src/agents/gate1/index.ts`) — the approve/reject/edit parsing logic.
- `mapGoogleError` (`src/agents/publishing/youtube-client.ts`) — the transient/non-transient
  classification, already flagged in that file's own comment as verified only by manual testing.
- `resolvePurpose`/`resolvePricing` (`src/llm/registry.ts`) — including a regression test that C1's
  tier fix actually stuck (asserts `'intake-parsing'` resolves to `claude-haiku-4-5`, not
  `claude-sonnet-5`), so this exact deviation can't silently reappear.
- `computeChannelBudgetCeiling`'s pure allocation math (C2) — the equal-split/override/remaining-pool
  arithmetic, including the negative-`remainingPool` and zero-default-channels edge cases, isolated
  from the DB queries around it.
**Explicitly deferred, note in the report**: DB-backed integration tests (the fixture-`PipelineRun`
style tests Task 2/3 already do manually) — real, valuable, but a bigger lift (test DB setup) than
this task's scope; a natural Week 6 candidate once this first slice is in place.
**Verify**: `npm test` runs and passes with real assertions (not placeholder `expect(true).toBe(true)`
tests) for all four items above.

### Documentation reconciliation
- `docs/execution/KNOWN_ISSUES_AND_BLOCKERS.md`: move C1-C4 out of Sections 2/3 once fixed, dated, with
  what changed — same convention Task 2 used for B1-B5. Add the deferred search-grounded fact-check
  idea (C3) and DB-integration-testing idea (C4) to Section 5 ("Not yet built") rather than letting them
  disappear once the narrower versions ship.
- `docs/execution/week5/SCHEMA.md`/`BUSINESS_LOGIC.md`: document C2's real migration
  (`Channel.budgetOverrideUsd`, the allocation algorithm, the new `set-channel-budget-override.ts`
  script) and C3's schema field addition (`factualConcerns`).
- `docs/execution/week5/STATUS.md`: add Task 4's row.

## Testing
```bash
npm run build && npm run lint && npm run typecheck && npm test
```
Plus each item's manual verification above.

## Report Template
`execution/week5/reports/task4.md`, standard shape. For each of C1-C4: what was actually done, how
verified, deviations with reasoning — same bar as Task 2/3's reports.
