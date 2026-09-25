# Sprint 3 Task 4: Per-Tenant Budget Provisioning + YouTube Quota Headroom Check

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.**

**Objective**: Make sure a real new tenant can actually submit a first brief (today it would hit
`NoBudgetConfiguredError` immediately — nothing seeds a budget ceiling for anyone but the founder's
original tenant), and check the real YouTube API quota headroom before ~10 testers' combined usage
finds the ceiling live.
**Duration**: 3-5 hours build (L1) + a real, live investigation (L2, not gated on effort).
**Depends On**: Task 1 (session auth / real tenant signup path) for L1. L2 is independent — can run
in parallel with any other Sprint 3 task, or before them.
**Owning Component**: `run-pipeline/budget-gate.ts`, `models/repositories/agent-quota.repository.ts`,
external Google Cloud Console investigation.
**Success Criteria**: (1) A real new tenant, created through Task 1's signup flow, has a real
`AgentQuota` row immediately — confirmed by DB read, not just "the code path exists." (2) A first
real brief submission from that tenant succeeds past the budget gate. (3) The real, current YouTube
Data API quota usage/ceiling for this project is stated plainly in the report, with a real
quota-increase request filed if the estimate warrants it.

## Task Requirement

`MVP_PART2_MULTI_USER_AND_FLEXIBLE_CREATION.md` Section 0: "Per-tenant budget enforcement is now
required, not someday... each tenant still needs its own real `AgentQuota` ceiling, enforced, before
this goes to real testers," and separately: "YouTube API quota is per Google Cloud project, not per
connected channel... worth checking current quota and requesting an increase proactively... rather
than discovering the ceiling live during the test."

### L1 — Auto-seed `AgentQuota` for every new tenant
**Where**: `AgentQuota` is already correctly modeled `UNIQUE(tenantId, platform)`
(`week2/SCHEMA.md`), and `run-pipeline/budget-gate.ts`'s `isBudgetAvailable` already enforces a real
per-tenant ceiling, split fairly across that tenant's own channels
(`computeChannelBudgetCeilings`, Week 5 Task 4) — **this enforcement math does not need to be
rebuilt**, it's already genuinely per-tenant. What's actually missing, confirmed by reading
`models/repositories/agent-quota.repository.ts` in full: it exports only `findAgentQuota` — there is
no insert/upsert function at all, and `isBudgetAvailable` throws `NoBudgetConfiguredError` the
instant `findAgentQuota` returns `null`. Exactly one `AgentQuota` row has ever existed, seeded once
by hand (Week 2 Task 4) for the founder's own tenant.

**Fix**: `agent-quota.repository.ts` gains `insertAgentQuota(tenantId, platform, budgetCeilingUsd)`.
Task 1's signup path (`POST /auth/request-link` for a *new* user — this task assumes Task 1 landed
without self-serve account creation, per that task's own note, so clarify here: a new `Tenant`+
`User`(`owner`) is created by the founder — e.g. a small internal `scripts/invite-tenant.ts`, mirroring
`scripts/set-channel-default-voice.ts`'s shape, not a public signup form, matching MVP_PART2 §0's own
"~10 testers," founder-controlled framing) calls `insertAgentQuota` for the new tenant + `'youtube'`
in the same transaction as tenant creation — a tenant is never left without a budget row, the same
"postcondition always holds, never partially" discipline this project's `BUSINESS_LOGIC.md` sections
already require elsewhere.

**Default ceiling**: MVP_PART2 §0 already accepts "AI costs on us" as the deliberate testing-phase
default (not the permanent model, but correct for now) — pick a real number and **state it plainly
in the report**, same "don't pick a real dollar figure silently" discipline Week 2 Task 4 used for
the founder's own original ceiling; this task should not invent a number without flagging it for
founder confirmation.

**Verify**: a real new tenant created through the real invite/signup path has a real `AgentQuota`
row immediately, confirmed by a direct Postgres read (not inferred from the code path alone) — and a
first real brief submission from that tenant's session reaches `runVideoGenerationStage`'s cost gate
successfully rather than throwing `NoBudgetConfiguredError`.

### L2 — Real YouTube API quota headroom check (investigation, not necessarily code)
**Where**: nothing in this codebase checks or surfaces YouTube Data API quota usage. The default
project-level cap is 10,000 units/day; a real upload (Publishing) costs roughly 1,600 units, and
each `videos.list`/stats poll a handful — all draw from **one shared pool per Google Cloud project**,
not per connected channel, so every tester's uploads and Performance Analytics' periodic polling
(`ANALYTICS_POLL_INTERVAL_MS`, default 6h) all compete for the same daily ceiling once Task 5/N's
channel expansion and Task 6/O's real per-user OAuth land.

**Fix**: a real, live check against this project's actual Google Cloud Console quota page for the
YouTube Data API v3 — not an estimate from documentation alone. Compute a real daily-unit estimate
at a realistic ~10-tester cadence (e.g. 1-2 uploads/day/tester + periodic stats polling across every
active channel) and compare against the real current ceiling. If the estimate is close to or over
the ceiling, file a real quota-increase request now — same "1-2 week lead time, don't discover the
ceiling live" lesson `docs/execution/week1/reports/task7-youtube-setup.md` already paid for once for
OAuth scope approval. This task is explicitly allowed to conclude "headroom is fine, no request
needed, here's the math" — it doesn't have to produce a founder-action item if the real numbers
don't call for one, but it must state the real numbers either way, not skip the check because the
current single-channel usage happens to be fine.

**Verify**: the report states the real, current quota ceiling and real current usage for this
project's actual Google Cloud project (a screenshot or copied figure from the real Console page, not
assumed default), the real per-operation unit costs cited from Google's own current documentation,
and the resulting estimate — plus, if a request was filed, its real submission confirmation.

## Schema Impact

### Tables Modified
None new. This task adds a write path (`insertAgentQuota`) to an existing table's repository —
`week2/SCHEMA.md`'s `AgentQuota` shape is unchanged.

### Migration File
None for L1 (no schema change — a code path was simply missing). None for L2 (investigation only).

## Business Logic / State Transition

### What this task implements
No new `PipelineRun` states. L1 closes a real gap in tenant-creation's postconditions: today, "a
`Tenant` exists" does **not** guarantee "a brief submitted against this tenant can pass the budget
gate" — after this task, it does, unconditionally, for every tenant created through the real
invite/signup path.

### Preconditions
L1: a new `Tenant` + owning `User` is being created (Task 1's invite flow).

### Postconditions
L1: every `Tenant` row has a corresponding `AgentQuota` row for `'youtube'` before its first
`PipelineRun` can be created — no tenant is ever left in the "exists but can't actually run anything"
state `NoBudgetConfiguredError` currently allows.

### Failure Modes & Handling
If `insertAgentQuota` fails mid-transaction, tenant creation itself must roll back (both in the same
transaction, per the Fix above) — a `Tenant` without a budget row is a genuinely invalid state for
this application, not a degraded-but-acceptable one, since every subsequent brief submission for it
would fail anyway.

### Reference
`week2/BUSINESS_LOGIC.md` Section 2 — the existing cost-gate transition, unchanged by this task
(only its seeding path changes). `week5/BUSINESS_LOGIC.md`'s C2/C4 sections — the existing
per-channel fairness math this task's seeding feeds, also unchanged.

## Testing
```bash
npm run build && npm run lint && npm run typecheck && npm test
```
Plus L1's real tenant-creation-through-budget-gate verification and L2's real Cloud Console check
above.

## Documentation reconciliation
- `docs/execution/sprint3/SCHEMA.md`, `BUSINESS_LOGIC.md`, `STATUS.md`.
- `docs/execution/KNOWN_ISSUES_AND_BLOCKERS.md`: if L2 concludes a quota increase is needed, add it
  as a founder-action row, same convention Sprint 2's G1/H1 used, until Google confirms the increase.
- `docs/design_doc/MVP_PART2_MULTI_USER_AND_FLEXIBLE_CREATION.md`: note Section 0's budget-fairness
  and quota items as picked up by this task.

## Report Template
`execution/sprint3/reports/task4.md`, standard shape. State L1's chosen default ceiling and L2's real
quota numbers plainly — don't let either read as assumed rather than checked.
