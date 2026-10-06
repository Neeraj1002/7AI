# Admin Sprint 1 BE Task 1: Platform-Admin Identity, Audit Log, and the Read-Only Cross-Tenant API

**Read `docs/execution/admin/ADMIN_TASK_TEMPLATE.md` and `docs/execution/admin/ADMIN_MODULE_DESIGN.md` in
full before starting.** Branch: `admin_sprint1_be` (this task creates it from a fresh `origin/main`; the FE task has its own
branch, see the template's sections 2 and 4).

**Objective**: give the platform owner a safe, audited, read-only API across every tenant, channel, run, cost
and bug report, behind a new Admin level, close the hole that lets any tenant owner read every tenant's
bug reports, and let the founder open the run behind a bug report (stages, errors, costs, the deployed
commit) without SQL.

**Duration**: R0 ~0.5h, R1 ~3h, R2 ~1.5h, R3 ~2.5h, R4 ~2h, R5 ~2.5h, R6 ~2h, R7 ~1.5h, R8 ~3.5h, R9 ~3.5h,
R10 ~1.5h. ~24h.

**Depends On**: **closure PR #48 (`Sprint3_CLOSURE`, closure R1) merged to `main` first.** It builds the weekly budget
window and `checkBudget()`; R6 reuses both instead of re-deriving them, and after the founder's D4 decision
(2026-10-06: the tenant's weekly budget decides the channel ceilings, never the reverse) it also carries the
override validation and `MIN_CHANNEL_SHARE_USD`. Branch from `origin/main` after that merge. If #48 is not merged
when this task is scheduled, stop and tell the founder; do not copy its code.

**Owning Component**: `studio/src/api/` (new `admin` router, `trpc.ts`, `bugs.ts`), `studio/src/auth/`,
`studio/src/models/` (schema, new `admin.repository.ts`, `user.repository.ts`), `studio/scripts/`.

**Success Criteria**:
1. A tenant `owner` session calling any `admin.*` procedure, or `bugs.list` / `bugs.updateTriage`, gets
   `FORBIDDEN`. The ops token and a session whose user has `isPlatformAdmin = true` succeed.
2. `admin.overview`, `admin.tenants.list/get`, `admin.budget.get`, `admin.usage.*`, `admin.bugs.list`,
   `admin.audit.list` return correct cross-tenant data on a seeded sandbox DB that reproduces the tricky
   cases found on preview (an override equal to the pool; a pool already spent; `$0` cost rows; an old
   YouTube credential; stale gates).
3. `admin.budget.get` reports the F9 case (`override_reserves_whole_pool`, the other channel at a `$0` share)
   without the founder running SQL.
4. Every admin write (bug triage, platform-admin flag change) writes an `admin_audit_log` row in the same
   transaction. No admin response contains a secret.
5. No existing tenant-scoped router changed behaviour.
6. Bug reports can be set to a new status `awaiting_verification` and carry a short note (at most 500
   characters), through both `admin.bugs.updateTriage` and the existing `bugs.updateTriage` (ops token).
7. `admin.runs.get` returns a run's stages, errors, costs and bundle availability **without any tenant content**;
   tenant content comes only from `admin.runs.content`, and every such call writes an audit row. A bug report
   whose context names a run links to it.
8. `admin.system.info` returns the deployed commit and **boolean** config flags only; no secret or env value
   appears in any response.

---

## Verified findings (2026-10-06, read from `D:\Study Material\7AI\studio`, a local checkout; re-check against `main`, don't re-litigate)

- **Auth shape.** `auth/request-identity.ts` resolves `{ kind: 'session', userId, tenantId, role }`,
  `{ kind: 'ops-token' }` (the `API_AUTH_TOKEN`), or nothing. `api/trpc.ts` `createContext` turns the ops token
  into `{ tenantId: MVP_TENANT_ID, userId: null, role: 'owner' }` and throws `UNAUTHORIZED` otherwise. The
  context has **no field saying which kind it was**, so today an ops-token call and a tenant-owner session
  are indistinguishable except `userId === null`. R1 adds it.
- **`bugs.list` / `bugs.updateTriage` leak.** `api/routers/bugs.ts` `assertOwner` only checks
  `role === 'owner'`, and `BugReport` has **no `tenantId`**, so any invited tester (always an `owner` of their
  own tenant) can list and triage every tenant's reports. R3 fixes it.
- **There is no cross-tenant read path.** Every dashboard function in `dashboard.repository.ts` takes a
  `tenantId`. `admin.repository.ts` is new and is the only code allowed to aggregate across tenants.
- **Budget gate internals reused as-is.** `run-pipeline/budget-gate.ts` exports `computeChannelBudgetCeilings`
  (pure). The gate's spend comes from `sumUsageCostForTenantPlatform` /
  `sumUsageCostForTenantChannelPlatform` (`usage-event.repository.ts`). `listActiveChannelsByTenantAndPlatform`
  and `findAgentQuota` exist. The allocator only warns when overrides *exceed* the pool, not when they equal
  it, which is how the preview tenant `d0617c67-...` ended up with a `$0` share for Underdogs.
- **Credential age.** `AgentCredential` has `createdAt` and `updatedAt`; `updatedAt` is the last save (the
  value used in the 2026-10-05 diagnosis). The refresh token column is `refreshTokenEncrypted`: **never
  select it** in any admin query (use an explicit `select`).
- **Schema conventions.** VARCHAR plus CHECK instead of native enums; `gen_random_uuid()` ids; camelCase
  quoted columns; additive migrations. `BugReport` deliberately has no foreign keys (a report must never be
  blocked by referential integrity); `admin_audit_log` follows that convention.
- **Run status values** are the ones in the schema/types (`pending`, `running`, `paused_gate1`,
  `paused_gate2`, `needs_attention`, `completed`, `failed`). Read the actual set from `types`; don't
  hardcode a copy.
- **Real preview data to design against** (2026-10-05): tenants `d0617c67-...` (pool $2.00, spent $1.2975,
  channel *Not In Your Notebook* override $2.00, *Underdogs* no override, two inactive sample channels),
  `a25db916-...` (MyAIPets, credential saved 2026-09-28), `913fee7d-...`, and the MVP tenant
  `00000000-0000-0000-0000-000000000001` (both $0). `usage_events` has `$0` rows for `gpt-image-1.5` and for
  `unknown/unknown`.

## Founder decisions already made — don't reopen

- Two roles only: **Admin** (platform) and **Account owner** (`owner`). `approver` is dormant: do not create,
  check or expose it.
- The Admin flag is **read from the database on every admin call**, not copied into the session token.
- This sprint is **read-only** except bug triage and the script that sets the Admin flag. No budget edits, run
  actions, tenant creation or suspension (Admin Sprint 2).
- **DA-6 (2026-10-06): structure by default, content only on an explicit, audited call.** Admin responses carry
  ids, statuses, stages, truncated errors, timestamps, costs and key **names**. Tenant content (a brief, a stage
  output, a plan, a transcript, a bundle file) is returned only by `admin.runs.content`, one call per view, and
  every call writes an `admin_audit_log` row. Nothing else in the admin API returns content.
- The founder is both an Account owner (own tenant) and an Admin.

## Roles and permissions

| Procedure | Admin (flagged user or ops token) | Account owner | Unauthenticated |
|---|---|---|---|
| `admin.whoami` | yes (`platformAdmin: true`) | yes (`platformAdmin: false`) | `UNAUTHORIZED` |
| every other `admin.*` | yes | `FORBIDDEN` | `UNAUTHORIZED` |
| `bugs.list`, `bugs.updateTriage` (existing) | yes | **`FORBIDDEN` (was allowed, R3)** | `UNAUTHORIZED` |
| `admin.runs.get`, `admin.runs.content`, `admin.system.info` | yes | `FORBIDDEN` | `UNAUTHORIZED` |
| everything else (existing routers) | unchanged | unchanged | unchanged |

---

### R0 (Role: `BE`) — Start the sprint: branch, docs commit, scaffolding docs

**Where**: `D:\Study Material\7AI`.

**Fix**: follow the template's "Starting the sprint" steps exactly (clean `main`, fresh pull, read
`sprint1/STATUS.md`, `git checkout -b admin_sprint1_be`, record the branch in `STATUS.md`, claim this task's row
as `In Progress`). First commit `ADMIN_SPRINT1_DOCS: admin track docs for sprint 1`, containing only the
untracked admin docs delivered to the working tree. Then create `docs/execution/admin/sprint1/SCHEMA.md`
(the two changes in "Schema Impact" below) and `docs/execution/admin/sprint1/BUSINESS_LOGIC.md` (the rules in
"Business Logic" below), and commit as `ADMIN_SPRINT1_TASK1_BE_R0: sprint scaffolding docs`. Push, and open
the draft PR as the template says.

**Verify**: `git log` shows the two commits on `admin_sprint1_be`; `STATUS.md`'s `Branch` column reads
`admin_sprint1_be`; the draft PR exists and is not marked ready.

---

### R1 (Role: `BE`) — Admin identity: the flag, the context, `adminProcedure`, `admin.whoami`, the script

**Fix**:
1. **Migration** `admin_sprint1_platform_admin_and_audit_log` (idempotent, additive): add
   `User.isPlatformAdmin Boolean @default(false)` and create `admin_audit_log` (see Schema Impact). Add
   `isPlatformAdmin` to the `User` domain type and `toDomainUser`. Do not touch `User.role`.
2. **Context.** In `api/trpc.ts`, extend `Context` with `identityKind: 'session' | 'ops-token'`, set by
   `createContext` from the resolved identity. No other behaviour change; existing routers ignore it.
3. **`requirePlatformAdmin(ctx)`** in a new `api/admin-auth.ts`: returns an actor
   `{ kind: 'ops-token' | 'session', userId: string | null }` when `ctx.identityKind === 'ops-token'`, or when
   `ctx.userId` maps (via `findUserById`, a fresh read every call) to a user with `isPlatformAdmin === true`.
   Otherwise throws `TRPCError FORBIDDEN` with the fixed message `Admin only`. A session whose user row no
   longer exists is `FORBIDDEN`. Never reveal why.
4. **`adminProcedure`** in `api/trpc.ts` (or `admin-auth.ts`, re-exported): `publicProcedure` plus a
   middleware calling `requirePlatformAdmin` and putting the actor on `ctx.admin`. Every `admin.*` procedure
   except `whoami` uses it.
5. **`admin` router** skeleton in `api/routers/admin/index.ts` (one file per group, filled in by R2-R7),
   mounted as `admin` in `api/router.ts`. `admin.whoami` (a `publicProcedure`, any signed-in session) returns
   `{ platformAdmin: boolean, userId: string | null }`, computed the same fresh-read way (`platformAdmin`
   is `true` for the ops token, whose `userId` is `null`). The app uses `userId` to show "You" in the audit log.
6. **`scripts/set-platform-admin.ts <email> [--revoke]`**: finds the user by email (`findUserByEmail`), sets or
   clears the flag in a transaction that also writes an `admin_audit_log` row (`actorKind: 'script'`,
   `action: 'platform_admin.grant'|'platform_admin.revoke'`, `targetType: 'user'`, before/after). Fails with a
   clear message for an unknown email. Idempotent: granting an already-flagged user prints that and writes no
   row. Same style as `scripts/invite-tenant.ts`.

**Verify** (sandbox DB, via the R8 fixture): `set-platform-admin.ts <founder email>` flips the flag and writes
one audit row; running it again changes nothing; `--revoke` clears it. `admin.whoami` returns `true` for the
flagged session and the ops token, `false` for a plain owner session, `UNAUTHORIZED` with no token. Revoke,
then call an admin procedure with the same still-valid token: `FORBIDDEN` immediately (proves the per-call
database read).

---

### R2 (Role: `BE`) — Audit writer and `admin.audit.list`

**Fix**:
1. `models/repositories/admin-audit.repository.ts`: `writeAdminAudit(tx, { actor, action, targetType,
   targetId?, tenantId?, before?, after?, reason? })` that takes a Prisma transaction client and is only ever
   called inside the same transaction as the change it records. `before`/`after` are plain JSON and must pass
   through a `redact()` helper that drops any key matching `/token|secret|password|authorization|key/i`.
2. `admin.audit.list({ limit (default 50, max 200), cursor?, tenantId?, action? })`: newest first, cursor by
   `createdAt` + `id`, returns `{ items, nextCursor }`. Items are the stored rows plus `actorEmail: string |
   null` (one extra query over the distinct `actorUserId`s on the page; `null` for the ops token, scripts and
   unknown users) and `tenantName: string | null`. No other joins.

**Verify**: a unit test shows `redact` removes secret-looking keys (nested too); `audit.list` pages through 120
fixture rows in newest-first order with a stable cursor; filtering by `tenantId` returns only that tenant's
rows.

---

### R3 (Role: `BE`) — Close the bug-report leak; move triage behind Admin and audit it

**Where**: `api/routers/bugs.ts`, new `api/routers/admin/bugs.ts`.

**Fix**:
1. Replace `assertOwner(ctx.role)` in `bugs.list` and `bugs.updateTriage` with `requirePlatformAdmin(ctx)`.
   Behaviour for the **ops token is unchanged** (hot-fixer and `curl` use keep working); a tenant `owner`
   session now gets `FORBIDDEN`. The unauthenticated submission routes under `/bugs*` (the tester form) are
   **not touched**.
2. `admin.bugs.list({ status?, reportType?, area?, priority?, limit? })`: the same data as `bugs.list` plus
   filters, newest first, plus `triageNote`, `runId` and `run` (step 6). `admin.bugs.updateTriage({ id, status?,
   area?, priority?, note? })`: reuses `updateBugReportTriage` and writes an audit row (`action: 'bug.triage'`,
   `targetType: 'bug_report'`, before/after of the four fields, note included) in one transaction. `note` is
   at most 500 characters, trimmed; an empty string clears it; it **replaces** the previous note (the audit log
   keeps the history).
3. `admin.bugs.options()` returns `{ statuses, reportTypes, areas, priorities }` from the repository's
   `BUG_REPORT_*` constants, so the app never keeps its own copy of the enums.
4. Leave `bugs.list` / `bugs.updateTriage` in place for backward compatibility; both delegate to the same
   repository functions. Do not delete them.

5. **New status and note (founder, 2026-10-06).** Add the status value `awaiting_verification` ("fixed in code,
   not yet verified on the deployed build") to `BUG_REPORT_STATUSES`, and a nullable
   `bug_reports."triageNote" VARCHAR(500)`. Migration `admin_sprint1_bug_triage_note_and_status`, additive and
   idempotent. First check how `status` is constrained: if the table has a CHECK constraint, drop and recreate
   it with the new value (guard with `IF EXISTS`); if it is only the TypeScript constant, change the constant.
   `admin.bugs.options()` then returns the new value with no other change, and the existing `bugs.updateTriage`
   (ops token, used by the hot-fixer) accepts `note` and the new status too.
6. **Bug to run link.** Add a pure `extractRunId(report)` in `util/run-id.ts` that returns the run UUID from the
   report's context, or `null`. Read `BugReport` in `schema.prisma` and `insertBugReport` for the exact column;
   the tester form records the screen path (for example `/run/<uuid>`). It must handle a path with a query
   string, a full URL, and a **short id prefix** (not resolvable: return `null`). `admin.bugs.list` resolves all
   run ids with **one** `findMany` (no N+1) and returns `run: { id, status, tenantId, tenantName } | null` next
   to `runId: string | null` (a `runId` with `run: null` means the run no longer exists).

**Verify** (sandbox DB): with an owner session for tenant B, `bugs.list` and `admin.bugs.list` return
`FORBIDDEN`; with the ops token both return all reports; `admin.bugs.updateTriage` changes the row and writes
exactly one audit row whose `before`/`after` match; calling it with an unknown id fails and writes **no** audit
row (rolled back). Setting `status: 'awaiting_verification'` with a note persists and is returned by
`admin.bugs.list` and `bugs.list`; a 501-character note is rejected; the migration is a no-op the second time;
`extractRunId` unit tests cover `/run/<uuid>`, `/run/<uuid>?x=1`, a full URL, a short prefix, an empty context and
garbage; the fixture report whose context names the fixture run returns its `run` summary.

---

### R4 (Role: `BE`) — `admin.overview`

**Fix**: one query-backed procedure returning:
```ts
{
  generatedAt: string,
  weekStartUtc: string,                    // Monday 00:00 UTC, from util/week.ts (below)
  totals: { tenants, users, activeChannels, inactiveChannels },
  runsThisWeek: { total, completed, failed, needsAttention, running, pausedGate1, pausedGate2, pending },
  openNow:      { pausedGate1, pausedGate2, needsAttention, running },   // all-time, currently in that state
  spend:        { thisWeekUsd, allTimeUsd },
  decisionQueue: Array<{
    kind: 'budget_zero_share' | 'budget_pool_exhausted' | 'youtube_connection_old'
        | 'run_needs_attention_stale' | 'gate_pending_stale' | 'bug_untriaged' | 'cost_gap',
    severity: 'high' | 'medium' | 'low',
    tenantId: string | null, tenantName: string | null,
    channelId?: string, runId?: string,
    message: string, since: string | null
  }>
}
```
1. Add `studio/src/util/week.ts` exporting `currentWeekStartUtc(now = new Date()): Date` (Monday 00:00 UTC). If
   `budget-gate.ts` already exports an equivalent helper (closure R1 landed), import that instead and do not
   duplicate it.
2. Decision-queue rules (constants at the top of the file, each commented): `budget_zero_share` and
   `budget_pool_exhausted` come from R6's analysis for every tenant (`high`); `youtube_connection_old` when an
   `AgentCredential.updatedAt` is older than **6 days** (`medium`; the OAuth consent screen is in Testing
   mode, where tokens expire after 7 days); `run_needs_attention_stale` when `needs_attention` for more than
   **24h** (`high`); `gate_pending_stale` when `paused_gate1`/`paused_gate2` for more than **12h**
   (`medium`); `bug_untriaged` one summarised item with a count when any report has `area` null (`low`);
   `cost_gap` one summarised item when `usage_events` has `$0` rows in the last 7 days outside the known free
   providers (`medium`). Sorted by severity, then oldest `since` first, capped at 50.
3. Use `groupBy`/aggregates, never one query per tenant.

**Verify** (sandbox): the totals equal a hand count of the fixture; the decision queue contains exactly the
planted problems and nothing for the healthy tenant; an empty database returns zeros and an empty queue, not
an error.

---

### R5 (Role: `BE`) — `admin.tenants.list` and `admin.tenants.get`

**Fix**:
1. `admin.tenants.list()` returns, per tenant: `id, name, createdAt, ownerEmails[], userCount,
   activeChannelCount, runsThisWeek, lastRunAt, spendThisWeekUsd, spendAllTimeUsd, poolCeilingUsd | null,
   warningCount` (the number of R6 warnings), sorted by `spendThisWeekUsd` descending. Aggregates, not N+1.
2. `admin.tenants.get({ tenantId })` returns the tenant plus:
   - `users[]`: `id, email, name, role, isPlatformAdmin, createdAt` (no push token, no chat id);
   - `channels[]`: `id, name, platform, isActive, ownerUserId, defaultVoice, defaultPrivacyStatus,
     budgetOverrideUsd, hasYoutubeCredential, credentialUpdatedAt, credentialAgeDays, spentAllTimeUsd,
     spentThisWeekUsd, runsByStatus, lastSnapshotAt` (latest `PerformanceSnapshot` time), selected with an
     explicit `select` that **cannot** include `refreshTokenEncrypted`;
   - `recentRuns[]` (latest 15): `id, channelId, channelName, status, currentStage, lastError` (truncated to
     500 chars), `createdAt, updatedAt, costUsd` (sum of that run's `usage_events`). **No `briefText`, no
     `intakeParsed`, no stage `input`/`output`.**
3. Unknown `tenantId` → `NOT_FOUND`. A tenant with no channels or no quota returns empty arrays / `null`
   ceiling, not an error.

**Verify**: the fixture's three tenants appear with the right owners, counts and spend; the response for each
contains none of the keys `refreshTokenEncrypted`, `briefText`, `expoPushToken`, `telegramChatId` (a test
walks the JSON and fails on any of them); an unknown id is `NOT_FOUND`.

---

### R6 (Role: `BE`) — `admin.budget.get`: effective ceilings and warnings, read-only

**Fix**: `admin.budget.get({ tenantId, platform = 'youtube' })` returns:
```ts
{
  tenantId, platform,
  poolCeilingUsd: number | null,           // the tenant's stored weekly budget (D4): channels split it, it is never derived from them
  windowKind: 'weekly',                    // what the gate enforces (closure R1 made it weekly)
  weekStartUtc: string,
  gateSpentUsd: number,                    // the figure the gate compares to the pool, same function the gate calls
  spentThisWeekUsd: number,
  reservedByOverridesUsd: number,
  remainingPoolUsd: number,                // pool - reservedByOverrides, floored at 0 (as the allocator does)
  channels: Array<{
    channelId, name, isActive, overrideUsd: number | null,
    effectiveCeilingUsd: number | null,    // from computeChannelBudgetCeilings over ACTIVE channels; null for inactive
    gateSpentUsd: number, spentThisWeekUsd: number,
    status: 'ok' | 'at_limit' | 'zero_share' | 'inactive'
  }>,
  warnings: Array<{ code:
      'no_quota' | 'override_exceeds_pool' | 'override_reserves_whole_pool'
    | 'zero_share' | 'pool_exhausted' | 'below_guide' | 'override_starves_others',
    channelId?: string, message: string }>
}
```
1. Put the analysis in a **pure function** `analyzeBudget({ poolCeilingUsd, channels, gateSpent, weekSpent })`
   in `run-pipeline/budget-analysis.ts` (no database), so it is unit-testable; the procedure only loads data.
   It must call `computeChannelBudgetCeilings` (do not reimplement the allocation).
2. `gateSpentUsd` must come from the **same functions the gate uses** (`sumUsageCostForTenantPlatform` and
   `sumUsageCostForTenantChannelPlatform` in `usage-event.repository.ts`), so the screen can never disagree with
   the gate. **Both take an optional trailing `since?: Date` and return LIFETIME spend when it is omitted.** Always
   pass `since: currentBudgetWindowStart()`; a call without it silently shows lifetime spend next to a weekly
   limit. Prefer `loadChannelBudgetView(tenantId, platform)` (exported from `budget-gate.ts`: the weekly budget,
   each channel's effective ceiling, the active channels) as the source of the budget and the ceilings, and add
   the spend with the two sum functions. `gateSpentUsd` and `spentThisWeekUsd` are the same figure from the same
   call; keep both fields for a stable contract. Import `currentBudgetWindowStart()` and
   `nextBudgetWindowStart()` (Monday 00:00 UTC) from `budget-gate.ts`; do not write a second week helper. The
   new `sinceDate`-taking aggregate in `admin.repository.ts` is only for R7's other weeks; do not change the
   gate's functions. Do NOT call `checkBudget` once per channel to build this table: it throws
   `NoBudgetConfiguredError` when the tenant has no budget row and a plain `Error` for an inactive channel.
   Catch `NoBudgetConfiguredError` (or check the view for a missing budget) and report `no_quota`.
3. `windowKind` is the constant `'weekly'`. Do not add `BUDGET_WINDOW_KIND` to `budget-gate.ts`: closure R1 shipped
   the weekly window, so there is nothing to switch. Add `weekStartUtc` (`currentBudgetWindowStart()`) and
   `resetsAtUtc` (`nextBudgetWindowStart()`).
4. Warning rules: `no_quota` when the tenant has no `AgentQuota` for the platform; `override_exceeds_pool`
   when overrides sum above the pool; `override_reserves_whole_pool` when `remainingPool = 0` and at least one
   active channel has no override; `zero_share` per active default-share channel whose ceiling is `0`;
   `pool_exhausted` when `gateSpentUsd >= poolCeilingUsd`; `below_guide` (informational, not an error) when the
   weekly budget is below `WEEKLY_BUDGET_GUIDE_PER_CHANNEL_USD (20) x active channels`, which is how a newly
   added channel diluting the others shows up. Take its `message` from `budgetDilutionWarning(view)` (returns
   `string | null`), so the app and the admin screen can never word or threshold it differently;
   `override_starves_others` when an override leaves any other active default-share channel below
   `MIN_CHANNEL_SHARE_USD` (= 5, **confirmed by the founder on 2026-10-06**). Import `MIN_CHANNEL_SHARE_USD` and
   `WEEKLY_BUDGET_GUIDE_PER_CHANNEL_USD` from `budget-gate.ts`; do not hardcode a second copy.
   `override_reserves_whole_pool` can use the `onPoolFullyReserved` callback that `computeChannelBudgetCeilings`
   now accepts (its signature is otherwise unchanged) or `shareReservedByOverrides` on a `BudgetRefusal`. `status` per channel: `inactive`; else
   `zero_share` if the ceiling is `0`; else `at_limit` if `gateSpentUsd >= effectiveCeilingUsd`; else `ok`.
5. Read-only: the procedure changes nothing and writes no audit row.

**Verify**: unit tests for `analyzeBudget` covering: normal split; one override smaller than the pool; override
**equal** to the pool with a second default-share channel (must produce `override_reserves_whole_pool` and
`zero_share`, exactly the preview `d0617c67-...` case); overrides greater than the pool; no channels; no
quota; pool exhausted. In the sandbox, `admin.budget.get` for the fixture's F9 tenant returns the Underdogs
analogue at `zero_share`, and `gateSpentUsd` equals what `isBudgetAvailable` sees for the same tenant. Add cases
for `below_guide` (a $40 budget with three active channels) and `override_starves_others`. Add a test that
`gateSpentUsd` for an event dated last week is NOT counted (proves `since` is passed), and one where the tenant
has no budget row (`no_quota`, no throw out of the procedure).

---

### R7 (Role: `BE`) — `admin.usage.*`

**Fix**: all optional-filtered by `tenantId`, all aggregates in `admin.repository.ts`:
- `admin.usage.byWeek({ weeks = 8, tenantId? })` → `[{ weekStartUtc, costUsd, events }]`, oldest first,
  empty weeks included as zeros.
- `admin.usage.byAgent({ sinceDays = 30, tenantId? })` → `[{ agent, provider, model, calls, costUsd }]`
  sorted by `costUsd` descending.
- `admin.usage.byRun({ limit = 20, tenantId? })` → `[{ pipelineRunId, tenantId, channelName, status, events,
  costUsd }]`, most recent first.
- `admin.usage.gaps({ sinceDays = 30 })` → rows with `costUsd = 0`, grouped by `agent, provider, model`:
  `{ agent, provider, model, events, firstAt, lastAt, metadataKeys: string[] }` (the **key names** found in
  `metadata` across up to 20 sample rows, never values). This is how the founder finds the `gpt-image-1.5` and
  `unknown/unknown` rows without SQL.

**Verify**: `byAgent` totals equal `byWeek` totals for the same window on the fixture; `gaps` returns the
planted `$0` groups; no value from `metadata` appears in any response.

---

### R8 (Role: `BE`) — Sandbox fixture, tests, and regression guard

**Fix**:
1. **`scripts/seed-admin-fixture.ts`**: creates a deterministic fixture in a **sandbox** database and refuses
   to run unless `DATABASE_URL`'s database name ends in `_sandbox` or `_test` (never `sevenai_dev` or
   `sevenai_preview`). Contents: tenant A (pool $2.00; channel X with override $2.00; channel Y no override;
   two inactive samples; a user flagged `isPlatformAdmin`), tenant B (healthy, pool $20, one channel, one
   owner user), tenant C (pool $2.00 and spend above it). Runs in every status including a `needs_attention`
   run 2 days old and a `paused_gate2` run 1 day old; `usage_events` across agents including `$0` rows for
   `gpt-image-1.5` and `unknown/unknown`; one `AgentCredential` with `updatedAt` 8 days ago and
   `refreshTokenEncrypted = 'fixture-not-a-token'` (never a real token); 8 bug reports (4 untriaged, one `awaiting_verification` with a note, one whose context is `/run/<fixture run
   uuid>`), and one run with three attempts (a stage skipped for budget with a reason, and a `video_review` with
   `qualityMetrics`), plus a run created before those fields existed. Prints
   one session token per fixture user via `signSessionToken` for curl testing.
2. **Tests** (`npx vitest run`): the `requirePlatformAdmin` matrix (ops token ok; flagged session ok; unflagged
   session `FORBIDDEN`; session for a deleted user `FORBIDDEN`; flag revoked between two calls); `analyzeBudget`
   (R6); `currentWeekStartUtc` boundary (Sunday 23:59:59 UTC vs Monday 00:00:00 UTC, and a non-UTC-looking
   input); `redact`; the "no secret keys in any admin response" walk (R5); an integration check that
   existing tenant routers (`runs.list`, `dashboard.operational`) still return only the caller's tenant's data
   (regression guard for success criterion 5); the R3, R9 and R10 tests listed in their Verify sections.
3. Add a short "How to run the fixture and call the admin API with curl" note to the report (not a new doc).

**Verify**: a fresh sandbox DB seeds cleanly twice (the second run is a no-op or a clean re-seed, documented);
the script refuses to run against a non-sandbox database name; the full suite passes.

---

### R9 (Role: `BE`) — Run inspector: `admin.runs.get`, `admin.runs.content`

**Where**: new `api/routers/admin/runs.ts`, `admin.repository.ts`. Reuse the helpers PR #47 (Sprint 3 Task 13)
added for bundles (`runs.getAttemptBundle`'s manifest/`getObjectText` path); do not write a second one. If a
column named below does not exist on the table, omit that field and say so in the report.

**Fix**:
1. `admin.runs.get({ runId })` returns **structure only** (DA-6):
```ts
{
  run: { id, tenantId, tenantName, channelId, channelName, status, currentStage,
         lastError: string | null,                 // truncated to 500 chars
         createdAt, updatedAt, creationOptionKeys: string[],   // key NAMES only (visualSource, formatKey, ...)
         profileVersionId: string | null },        // null until Sprint 4 Task 1 exists
  stages: Array<{ stageName, attemptNumber, status, startedAt: string | null, finishedAt: string | null,
                  reason: string | null,           // only the documented reason/error/message keys, <= 300 chars
                  outputKeys: string[],            // top-level key NAMES only
                  qualityMetrics: Record<string, number | boolean | string> | null }>,   // video_review, Sprint 4 Task 8 R7; null on older runs
  usage: Array<{ at, agent, provider, model, costUsd, zeroCost: boolean, metadataKeys: string[] }>,
  totals: { costUsd, events, zeroCostEvents },
  gates: Array<{ gate: 1 | 2, decision, at, decidedByUserId: string | null }>,   // review log WITHOUT rationale text
  bundle: { attempts: number[] }                   // attempts that have a debug bundle (hasR2Bundle), [] if none
}
```
   Unknown `runId` is `NOT_FOUND`. A run without `qualityMetrics`, a bundle or a usage row returns `null` / `[]`,
   never an error (older runs predate those fields). `qualityMetrics` is numbers, booleans and short strings
   only; a test fails if a nested object or a string longer than 120 characters appears.
2. `admin.runs.content({ runId, kind, attemptNumber?, stageName?, file? })` is the **only** procedure that returns
   tenant content. `kind` is `'brief' | 'stage_output' | 'bundle_manifest' | 'bundle_file'`. It returns the text
   or JSON (run it through the R2 `redact()` pass; drop any key matching `/token|secret|password|api[-_]?key/i`),
   or, for `bundle_file`, a short-lived presigned URL via the PR #47 helper. **Write the audit row first**
   (`action: 'run.content_view'`, `targetType: 'run'`, `targetId: runId`, `tenantId`, `after: { kind,
   attemptNumber, stageName, file }`), and if that write fails return no content. Cap a text response at
   200 KB and say when it was truncated.
3. No cross-tenant run **list** in this sprint: the entry points are a bug report (R3), a tenant's
   `recentRuns` (R5) and the app's own links. A list/search comes with Admin Sprint 2.

**Verify** (sandbox DB, fixture run with three attempts): the `get` response for it contains none of the keys
`briefText`, `intakeParsed`, `script`, `transcript`, `plan`, `rationale` and no stage `input`/`output` body (a test
walks the JSON and fails on any); `qualityMetrics` and the budget-skipped stage's `reason` come through; the `$0`
usage rows have `zeroCost: true`; an owner session gets `FORBIDDEN` on both procedures; an old run without the
newer fields returns nulls and empty arrays; `content` writes **exactly one** audit row per call and returns
nothing when the audit insert is made to fail; an unknown run is `NOT_FOUND`; a planted token-like key in a
fixture stage output does not appear in the `content` response.

---

### R10 (Role: `BE`) — `admin.system.info`: deployed commit and safe config flags

**Where**: new `api/routers/admin/system.ts`, `api/system-info.ts`.

**Fix**: `admin.system.info()` returns:
```ts
{ commit: string | null, nodeEnv: string, bootedAt: string, uptimeSeconds: number,
  flags: { mediaStub: boolean, stockFootageStub: boolean, aiVisualsStub: boolean, r2Configured: boolean,
           openaiConfigured: boolean, youtubeOauthConfigured: boolean } }
```
1. `commit`: the short git hash. Read `GIT_COMMIT` if the deploy sets it; otherwise run `git rev-parse --short
   HEAD` once at boot with a 2-second timeout and cache the result; if neither works return `null` (never
   throw).
2. `flags` come from a **whitelist constant** in `system-info.ts`, each flag a boolean derived from env **presence
   or truthiness**. `r2Configured` is true only if every R2 variable the storage code needs is non-empty. No
   env **value** and no key name list is ever returned.
3. Read-only, no audit row.

**Verify**: a test sets fake secrets (`OPENAI_API_KEY=sk-test-123`, a fake R2 secret) and asserts that no string
in the serialised response contains them and that every `flags` value is a boolean; `commit` is `null` when `git`
is unavailable; `r2Configured` flips when one R2 variable is cleared. Compare `commit` with
`git log -1 --oneline` in the sandbox checkout.

---

## Schema Impact

Delta only. Full definitions go in `docs/execution/admin/sprint1/SCHEMA.md` (R0).

### Tables Modified
- `users`: add `isPlatformAdmin BOOLEAN NOT NULL DEFAULT false`. No backfill needed (every existing user
  becomes a non-admin; the founder is set by `scripts/set-platform-admin.ts`). Not breaking for in-flight runs.
- `bug_reports`: add `triageNote VARCHAR(500) NULL`, and allow the status value `awaiting_verification` (R3).
  Existing rows keep their status; the note starts empty.

### Tables Created
- `admin_audit_log`: `id uuid pk`, `actorKind varchar(20)` (`session`|`ops-token`|`script`, CHECK),
  `actorUserId uuid null`, `action varchar(100)`, `targetType varchar(50)`, `targetId varchar(100) null`,
  `tenantId uuid null`, `before jsonb null`, `after jsonb null`, `reason text null`, `createdAt timestamptz
  default now()`. Indexes on `(createdAt)` and `(tenantId, createdAt)`. **No foreign keys** (an audit row must
  survive deletion of the thing it describes).

### Migration Files
`admin_sprint1_platform_admin_and_audit_log` (R1) and `admin_sprint1_bug_triage_note_and_status` (R3): both
additive and idempotent (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, guarded constraint changes),
each applies cleanly to a fresh DB and is a no-op on one that has it.

## Business Logic / State Transition

### What this task implements
Authorization and audit rules only; no pipeline state changes.
- An admin call is allowed iff the caller is the ops token, or a session whose user row currently has
  `isPlatformAdmin = true`.
- Every write made through an admin procedure or admin script writes an audit row in the same transaction.

### Preconditions
- The migration is applied. The founder's user exists (they log in by magic link today).

### Postconditions
- After a granted/revoked flag, the next admin call reflects it immediately.
- An audit row exists if and only if the change committed.

### Failure Modes & Handling
- Unknown tenant or user id: `NOT_FOUND`, no audit row.
- A failed transaction rolls back the change **and** its audit row together.
- A tenant with missing data (no quota, no channels, no runs) yields empty or `null` fields and warnings,
  never a 500.
- If the audit write itself fails, the change fails (an unaudited admin write is not allowed). A content view
  whose audit row cannot be written returns no content.

## Implementation

### Files to Create
- `studio/src/api/admin-auth.ts`, `studio/src/api/routers/admin/index.ts` (+ `overview.ts`, `tenants.ts`,
  `budget.ts`, `usage.ts`, `bugs.ts`, `audit.ts`, `runs.ts`, `system.ts`)
- `studio/src/models/repositories/admin.repository.ts`, `admin-audit.repository.ts`
- `studio/src/run-pipeline/budget-analysis.ts`, `studio/src/util/week.ts`, `studio/src/util/run-id.ts`,
  `studio/src/api/system-info.ts`
- `studio/scripts/set-platform-admin.ts`, `studio/scripts/seed-admin-fixture.ts`
- tests next to each new module
- `docs/execution/admin/sprint1/SCHEMA.md`, `BUSINESS_LOGIC.md`

### Files to Modify
- `studio/src/models/schema.prisma` + the new migration folder
- `studio/src/types/*` (`User` domain type)
- `studio/src/models/repositories/user.repository.ts` (`isPlatformAdmin` in `toDomainUser`)
- `studio/src/api/trpc.ts` (`identityKind`, `adminProcedure`), `studio/src/api/router.ts` (mount `admin`)
- `studio/src/api/routers/bugs.ts` (R3), `studio/src/models/repositories/bug-report.repository.ts` (R3: `triageNote`,
  the new status, `note` in `updateBugReportTriage`)
- `studio/src/run-pipeline/budget-gate.ts` (read-only for this task: import `currentBudgetWindowStart`, `nextBudgetWindowStart`, `loadChannelBudgetView`, `budgetDilutionWarning`, `computeChannelBudgetCeilings`, `MIN_CHANNEL_SHARE_USD` and `WEEKLY_BUDGET_GUIDE_PER_CHANNEL_USD`; change nothing)
- `studio/src/models/repositories/usage-event.repository.ts` (read-only: the two sum functions, always called with `since`)

### Integration Points
- The FE task (`sprint1/fe/task1.md`) consumes every `admin.*` procedure through the generated `AppRouter`
  type. Do not rename procedures or output fields after R1 without updating that task and noting it in the
  report.

## Testing

```bash
cd studio
npm run build && npm run lint && npm run typecheck
npx vitest run
npx tsx scripts/seed-admin-fixture.ts     # sandbox DB only
```
Expected: no TypeScript errors, no lint warnings, all tests passing, fixture seeds, and every R# Verify holds.
Plus a real HTTP pass against a locally started server on the sandbox DB: `curl` each admin procedure with the
ops token (success), a fixture owner token (`FORBIDDEN`), and no token (`UNAUTHORIZED`), pasted into the
report. For the migration, confirm it applies to a fresh DB and is a no-op on a DB that already has it.

## Report Template

`docs/execution/admin/report/sprint1/be/task1.md`, using the template's section 9, plus: (1) the three
`curl` outcomes per procedure family; (2) the F9 case output from `admin.budget.get`; (3) one real
`admin_audit_log` row from a triage; (4) a **Founder Actions** section with these exact steps, run after the
founder merges the PR:
1. Confirm the deploy applied the migration (`pm2 logs sevenai`, and `\d users` shows `isPlatformAdmin`).
2. On the VPS: `cd /var/www/7AI/studio && npx tsx scripts/set-platform-admin.ts neeraj100296@gmail.com`.
3. Call `admin.overview` and `admin.budget.get` for tenant `d0617c67-b7bd-47b1-9501-d316d2d66a15` with the ops
   token (same `curl` shape as the `bugs.list` call used on 2026-10-05) and compare the numbers with the SQL
   results from that day.
4. From a tenant-owner account other than the founder's, confirm `bugs.list` now returns `FORBIDDEN`.
5. Call `admin.system.info` with the ops token: `commit` must equal `git log -1 --oneline` on the VPS and the flags
   must match the server's `.env` (names are never returned). Then open a real bug's run with `admin.runs.get`.

## Additional Notes

### Cross-track impact (do not edit these docs from this task; the BA chat updates them)
- `docs/execution/bugs/HOTFIXER_AGENT_PROTOCOL.md` and `bugs/Sprint3/closureTask.md` R0 say bug triage works
  with an "owner session or the ops token". After R3 it is **Admin session or ops token**. Hot-fixer use of the
  ops token is unaffected. After R3 the status `awaiting_verification` and a short `note` exist, so the protocol's
  "Bug lifecycle" section should then say: a merged-but-unverified fix is set to `awaiting_verification` with the PR
  number in the note (until then it stays `open`).
- `bugs/Sprint3/closureTask.md` R1 (weekly window, `checkBudget()`, and after 2026-10-06 the D4 budget model in
  step 5b) is now a **dependency** of this task, not a coordination point; this task only reads what R1 builds.
  Admin Sprint 2's budget-edit write must use the same override validation, so put the validator in
  `budget-gate.ts`, not in a router.
- The drafted "YouTube link + INR" task edits the Dashboard cost card; unrelated to this task's files.

## Known Issues / Future Improvements

- Admin Sprint 2 adds the writes: budget edit with a preview, run force actions (clear budget hold, mark
  failed, force a gate), tenant suspend.
- `admin.overview` recomputes on every call; fine at this table size, and cacheable later.
- Credential "age" is an estimate of token life under the OAuth consent screen's Testing mode; it can't see the
  real token expiry.
- Tenant content is exposed only through `admin.runs.content` (an audit row per view, DA-6). A cross-tenant run
  list and search, a side-by-side attempt diff, and run actions (retry, cancel, clear budget hold, force gate)
  are Admin Sprint 2.

## Links & References
- `docs/execution/admin/ADMIN_MODULE_DESIGN.md`, `ADMIN_TASK_TEMPLATE.md`
- `docs/execution/bugs/Sprint3/closureTask.md` (F9/F10 findings that motivate R6/R7)
- `docs/execution/sprint3/BUSINESS_LOGIC.md` (J1/K1 auth and gate-ownership rules)
- `docs/server/deployment/preview/detail.md`, `docs/server/usefulcmds.md` (VPS paths and `psql`)

## Git Workflow

Per `ADMIN_TASK_TEMPLATE.md` section 4. This task **creates** `admin_sprint1_be` from a fresh `origin/main` in
`D:\Study Material\7AI`, records it in `sprint1/STATUS.md` at once, commits R0's docs first, then one commit per
item `ADMIN_SPRINT1_TASK1_BE_R<X>: ...`, then `ADMIN_SPRINT1_TASK1_BE_REPORT: Platform-Admin Identity, Audit
Log, and the Read-Only Cross-Tenant API` with the report and the STATUS row. Open the draft PR after the first
push (`admin_sprint1_be: Platform-Admin Identity, Audit Log, Read-Only Admin API`), and mark it ready with `gh pr
ready` after the closing commit. The FE task starts only after the founder has merged this PR. Never push to
`main`, never merge, never open a second PR.
