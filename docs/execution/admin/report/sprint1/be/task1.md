# Admin Sprint 1 BE Task 1: Platform-Admin Identity, Audit Log, and the Read-Only Cross-Tenant API

**Date**: 2026-10-06
**Status**: Complete — founder actions pending
**Branch**: `admin_sprint1_be`, commits `ADMIN_SPRINT1_TASK1_BE_R*` (draft PR [#50](https://github.com/Neeraj1002/7AI/pull/50), marked ready by the closing step)
**Files Created**: 50 (incl. 7 admin docs and this report)  **Files Modified**: 9 (8 code, 1 STATUS row)  **Tests**: all passing (44 files, 276 tests; lint, typecheck and build clean)

## What Was Done

Everything in `be/task1.md` R0 to R10, and nothing outside it (no write actions beyond bug triage and the
platform-admin script; no budget edit, run action or tenant action).

- **R0** worktree `D:\Study Material\7AI-admin-be` from `origin/main` at `efb7feb` (contains closure PR #48), docs commit
  `ADMIN_SPRINT1_DOCS: admin track docs for sprint 1` (the five delivered docs only, per the template), SCHEMA.md and
  BUSINESS_LOGIC.md, STATUS row claimed, draft PR opened.
- **R1** `User.isPlatformAdmin`, `Context.identityKind`, `requirePlatformAdmin` (fresh database read every call, fixed
  `Admin only` message), `adminProcedure`, `admin.whoami`, `scripts/set-platform-admin.ts` (idempotent, audited).
- **R2** `writeAdminAudit` (transaction client only) with `redact()`, `admin.audit.list` (keyset cursor, newest first).
- **R3** `bugs.list` / `bugs.updateTriage` now require Admin (ops token unchanged), `admin.bugs.list/updateTriage/options`,
  status `awaiting_verification`, `triageNote` (max 500), `extractRunId` and the bug-to-run link (one `findMany`).
- **R4** `admin.overview` (aggregates, decision queue with the commented thresholds).
- **R5** `admin.tenants.list` / `admin.tenants.get` (structure only, explicit selects).
- **R6** `admin.budget.get` on a pure `analyzeBudget` that calls `computeChannelBudgetCeilings` and
  `budgetDilutionWarning`; spend from the gate's own two sum functions with `since: currentBudgetWindowStart()`.
- **R7** `admin.usage.byWeek/byAgent/byRun/gaps`.
- **R8** `scripts/seed-admin-fixture.ts` (refuses non-`_sandbox`/`_test` databases), tests, tenant-isolation regression guard.
- **R9** `admin.runs.get` (structure only) and `admin.runs.content` (audit row first; no content if that write fails).
- **R10** `admin.system.info` (short commit hash, boot time, six boolean flags from a whitelist).

Commit order differs from the numbering: **R6 was committed before R4 and R5**, because the overview's decision queue and the
tenants list's `warningCount` both consume R6's analysis (R8 last, R9 and R10 before it, because the fixture holds data
for them). Each item is still one commit, pushed after every commit; there is one extra `R8` fix-up commit and one `R1`
commit that moved the `AdminAuditLog` model within `schema.prisma` (see Deviations).

## Files Created/Modified

Created (studio): `src/api/admin-auth.ts`, `src/api/system-info.ts`, `src/api/routers/admin/{index,audit,bugs,budget,overview,runs,system,tenants,usage}.ts`,
`src/models/repositories/{admin,admin-audit,admin-runs,admin-tenants,admin-usage}.repository.ts`,
`src/run-pipeline/budget-analysis.ts`, `src/util/run-id.ts`, `src/test-support/{sandbox,walk-keys,admin-fixture}.ts`,
`scripts/{set-platform-admin,seed-admin-fixture}.ts`, two migrations, and a `.test.ts` next to each module.
Created (docs): the five delivered admin docs, `sprint1/SCHEMA.md`, `sprint1/BUSINESS_LOGIC.md`, this report.

Modified: `schema.prisma`, `types/user.types.ts`, `user.repository.ts` (`isPlatformAdmin`), `api/trpc.ts` (`identityKind`,
`adminProcedure`), `api/router.ts` (mount `admin`), `api/routers/bugs.ts`, `bug-report.repository.ts`,
`api/watermark-route.ts` (one-line: it builds a `Context` by hand and needed `identityKind` to type-check; behaviour unchanged),
and `sprint1/STATUS.md` (this task's row only). `budget-gate.ts` and `usage-event.repository.ts` are **untouched**.

## Schema Changes Applied

- `20261006100000_admin_sprint1_platform_admin_and_audit_log`: `users."isPlatformAdmin"`, table `admin_audit_log`
  (CHECK on `actorKind`, indexes on `(createdAt)` and `(tenantId, createdAt)`, no foreign keys).
- `20261006100100_admin_sprint1_bug_triage_note_and_status`: `bug_reports."triageNote" VARCHAR(500)`,
  **`status` widened `VARCHAR(20)` -> `VARCHAR(32)`** (`awaiting_verification` is 21 characters), guarded
  `DROP CONSTRAINT IF EXISTS bug_reports_status_check` (no such constraint exists in the migrations).

Verified: both apply to a fresh database (`prisma migrate deploy`), a second deploy is "No pending migrations", and each
file re-run by hand with `psql -v ON_ERROR_STOP=1` is a no-op. `prisma migrate diff` from the migrated database to
`schema.prisma` is empty. Merge check against Sprint 4: see Founder Actions.

## Evidence

All run against a **sandbox database that I created and dropped** (`sevenai_admin_sandbox`, seeded by `seed-admin-fixture.ts`);
`sevenai_preview` and `sevenai_dev` were never connected to. No real token anywhere: the fixture uses `fixture-not-a-token`,
the ops token was `sandbox-ops-token-not-real`.

### How to run the fixture and call the admin API with curl

```bash
cd studio
# 1. a sandbox database (name MUST end _sandbox or _test) and a studio/.env.local pointing at it
createdb sevenai_admin_sandbox
#    .env.local: DATABASE_URL=postgresql://<you>@127.0.0.1:5432/sevenai_admin_sandbox, API_AUTH_TOKEN=<any fake>, JWT_SECRET=<32+ chars>
export $(grep -v '^#' .env.local | xargs)      # the Prisma CLI reads .env, not .env.local
npx prisma migrate deploy
# 2. seed (re-running is a clean re-seed); prints one session token per fixture user
npx tsx scripts/seed-admin-fixture.ts
# 3. start the API and call it
npm run dev                                     # API on API_PORT (default 4000)
OPS=<your fake API_AUTH_TOKEN>
curl -s -H "Authorization: Bearer $OPS" http://localhost:4000/trpc/admin.overview
# input goes in ?input={"json":{...}} (URL-encoded) for queries, and {"json":{...}} as the POST body for mutations
curl -s -H "Authorization: Bearer $OPS" \
  "http://localhost:4000/trpc/admin.budget.get?input=%7B%22json%22%3A%7B%22tenantId%22%3A%22a0000001-0000-4000-8000-000000000001%22%7D%7D"
curl -s -X POST -H "Authorization: Bearer $OPS" -H "Content-Type: application/json" \
  -d '{"json":{"runId":"e0000001-0000-4000-8000-000000000001","kind":"brief"}}' http://localhost:4000/trpc/admin.runs.content
# a plain owner token (OWNER_B from the seed output) must give 403 FORBIDDEN; no token gives 401
```

Fixture ids: tenants `a0000001-0000-4000-8000-00000000000{1,2,3}` (A: F9 case, B: healthy, C: pool spent), multi-attempt run
`e0000001-0000-4000-8000-000000000001`. To run the database-backed tests, point `.env.local` at the sandbox; with any other
database they are skipped, never run.

### Real HTTP outcomes (server on the sandbox database; OPS = ops token, OWNER = a plain owner of tenant B, NONE = no token)

| Procedure family | OPS token | Owner session | No token |
|---|---|---|---|
| `admin.whoami` | 200 `{"platformAdmin":true,"userId":null}` | 200 `{"platformAdmin":false,...}` | 401 unauthorized |
| `admin.overview`, `admin.tenants.list/get`, `admin.budget.get` | 200 | 403 FORBIDDEN | 401 |
| `admin.usage.byWeek/byAgent/byRun/gaps` | 200 | 403 FORBIDDEN | 401 |
| `admin.bugs.list/options/updateTriage`, legacy `bugs.list` | 200 | 403 FORBIDDEN | 401 |
| `admin.audit.list`, `admin.runs.get`, `admin.runs.content`, `admin.system.info` | 200 | 403 FORBIDDEN | 401 |

(All 17 calls x 3 identities were exercised; the full table is reproduced by the same script on the fixture.)

### R1 / R2: identity and audit
`set-platform-admin.ts founder@fixture.test` -> `granted ... one admin_audit_log row written`; again -> `already an Admin -
nothing changed, no audit row written`; `--revoke` -> `revoked`; unknown email -> exit 1, `no User with email ... nothing changed`.
`admin.whoami` was `true` for the flagged session and the ops token, `false` for a plain owner, 401 with no token. After
`--revoke`, **the same still-valid token** got `{"code":"FORBIDDEN","message":"Admin only"}` on `admin.audit.list` immediately
(per-call database read). Unit matrix in `admin-auth.test.ts` (ops token, flagged, unflagged, deleted user, no user id, revoke
between two calls). `audit.list` pages 120 rows newest-first with ties on the timestamp and no duplicates, filters by tenant,
and survives a garbage cursor (`admin-audit.repository.test.ts`). `redact` removes secret-looking keys at every depth.

### R3: bugs
A tenant-owner session gets FORBIDDEN on `bugs.list`, `bugs.updateTriage`, `admin.bugs.list/options/updateTriage`; the ops
token lists everything through both. One triage produced exactly one audit row:

```
actorKind ops-token | action bug.triage | targetType bug_report | targetId f0000001-0000-4000-8000-000000000001 | tenantId null
before {"area":null,"note":null,"status":"open","priority":"annoying"}
after  {"area":"BE","note":"curl pass","status":"awaiting_verification","priority":"annoying"}
createdAt 2026-10-06T10:06:52.985Z
```

An unknown id is `NOT_FOUND` and writes no audit row; a 501-character note is rejected on both routes and writes nothing; an empty note
clears it; `awaiting_verification` plus a note persist and come back from `admin.bugs.list` and `bugs.list`. `extractRunId` unit tests cover
`/run/<uuid>`, `?x=1`, a full URL, a short prefix, empty, garbage. The fixture report whose context names the run returns
`run: {id, status: "paused_gate2", tenantId, tenantName}`; the short-prefix report returns `runId: null`.

### R4: overview (fixture vs SQL hand count, taken at the same moment)
```
SQL:  tenants=4 users=4 active/inactive channels=4|2  runs this week = completed 1, failed 1, paused_gate1 1, paused_gate2 2, pending 1, running 1
      open now (gate1,gate2,needs,running)=1|2|1|1   spend week/all = 5.5475 / 10.5475
API:  totals {tenants 4, users 4, activeChannels 4, inactiveChannels 2}; runsThisWeek total 7 (same split); openNow {1,2,1,1}; spend {5.5475, 10.5475}
```
(`tenants=4` is the three fixture tenants plus the MVP tenant a migration seeds.) The decision queue held exactly the planted problems:
`high run_needs_attention_stale (A)`, `high budget_pool_exhausted (C)`, `high budget_zero_share (A)`, `medium youtube_connection_old (A)`,
`medium gate_pending_stale (A)`, `medium cost_gap`, `low bug_untriaged`, and nothing for healthy tenant B. A migrated database with
no fixture returns zeros and an empty queue.

### R5: tenants
The three fixture tenants come back with the right owners, counts and spend. A test walks every response and fails on any of the keys
`refreshTokenEncrypted`, `briefText`, `intakeParsed`, `expoPushToken`, `telegramChatId`, `input`, `output` or any of the planted secret
values; none appear. Unknown id is `NOT_FOUND`; a tenant with no channels or quota returns empty arrays and a `null` ceiling.

### R6: the F9 case, from `admin.budget.get` for fixture tenant A (the `d0617c67-...` shape)
```
poolCeilingUsd 2, gateSpentUsd 1.2975 (last week's $5 row NOT counted), reservedByOverridesUsd 2, remainingPoolUsd 0
Fixture Notebook  override 2  effectiveCeilingUsd 2  status ok
Fixture Underdogs override null effectiveCeilingUsd 0 status zero_share
warnings: override_reserves_whole_pool ("Channel limits use the whole $2.00 weekly budget, leaving 1 channel(s) without their own
          limit at $0.00; every run on them is refused."), zero_share (Fixture Underdogs), below_guide (gate-module wording)
```
Against the gate itself: `checkBudget(A, Notebook)` is `ok`, `checkBudget(A, Underdogs)` is `{ok:false, scope:'channel', shareReservedByOverrides:true}`, the
ceilings equal `loadChannelBudgetView`'s, and the bulk (all-tenants) analysis equals the single-tenant one. `analyzeBudget` unit tests: normal split,
override smaller than the pool, override equal to the pool (F9), overrides above the pool, no channels, no quota, pool exhausted, `below_guide`
($40 over three channels), `override_starves_others`, inactive channels.

### R7: usage
`byAgent` totals equal `byWeek` totals for the same window; empty weeks are zeros; `gaps` returns the planted `openai/gpt-image-1.5` and
`unknown/unknown` groups with `metadataKeys` and no metadata value anywhere (a planted value is asserted absent).

### R9: run inspector (fixture run with three attempts)
`get` contains none of `briefText`, `intakeParsed`, `script`, `transcript`, `plan`, `rationale` and no stage input/output; the budget-skipped
attempt's `reason` ("Account spend limit reached ...") and `qualityMetrics` come through (scalars only; a test fails on a nested object or a string over
120 characters); `$0` rows have `zeroCost: true`; `bundle.attempts` is `[1, 3]`; an old run returns empty arrays and nulls. Owner sessions get FORBIDDEN on both
procedures. `content` wrote exactly one audit row per call (the real row, from HTTP):
`action run.content_view | targetType run | targetId e0000001-...-0001 | tenantId a0000001-...-0001 | after {"kind":"brief"}`;
it returns **nothing** (`INTERNAL_SERVER_ERROR`) when the audit insert is made to fail, redacts a planted `apiToken` key from a stage output and a
planted `apiKey` from the manifest, hands back a presigned URL with `ttl=600`, and an unknown run is `NOT_FOUND` with no audit row.

### R10: system info
Real response on the sandbox server: `{"commit":"0220194","nodeEnv":"development","bootedAt":...,"uptimeSeconds":84,"flags":{"mediaStub":true,
"stockFootageStub":false,"aiVisualsStub":false,"r2Configured":false,"openaiConfigured":false,"youtubeOauthConfigured":true}}`; `commit` equals
`git log -1 --oneline` (`0220194`) in the sandbox checkout. Tests set `OPENAI_API_KEY=sk-test-123` and a fake R2 secret and assert neither (nor any R2 value) is in
the response, every flag is a boolean, `commit` is `null` when git fails, and `r2Configured` flips when one R2 variable is cleared.

## Test Results

```
npm run lint         -> clean
npm run typecheck    -> clean
npm run build        -> clean
npx vitest run       -> Test Files 44 passed (44), Tests 276 passed (276)   (three consecutive runs, no flakes, with the sandbox database)
```
Before this task: 28 files / 194 tests. Database-backed tests are `describe.skipIf(!SANDBOX)`; the sandbox guard itself is unit-tested.

## Deviations from Spec

1. **`bug_reports.status` widened to `VARCHAR(32)`.** The task assumed the new value only needed a constant change; it is 21 characters and the column was 20. Recorded in SCHEMA.md.
2. **No new `util/week.ts`.** The task said import the helper if closure R1 shipped one; it did (`currentBudgetWindowStart`), so R8's boundary test pins that function (Sunday 23:59:59 vs Monday 00:00:00 UTC and a +05:30 input) instead of a duplicate `currentWeekStartUtc`.
3. **R1 and R2 were first verified before the R8 fixture existed**, against a throwaway two-user seed (R1's Verify says "via the R8 fixture"). Both were re-verified against the real fixture at R8 (`fixture.test.ts`, the HTTP pass above). The throwaway seed is not in the repository.
4. **`extractRunId` prefers the real `BugReport.runId` column** (set by the tester form when valid) and falls back to parsing `screenContext`.
5. **`admin.runs.content` is a mutation, not a query.** It has a side effect (the audit row); a cached/refetched query could leave a view unaudited or audit it twice. **The FE task must call it with `mutationOptions`.** Recorded in BUSINESS_LOGIC.md.
6. **`decidedByUserId` is omitted from `gates[]`**: `review_logs` has no column recording who decided (human decisions are `agent: 'human'`). Per the task, the field is omitted.
7. **`profileVersionId` is always `null`.** The column exists only on the unmerged `sprint4_be` branch, not on `main`. After Sprint 4 Task 1 merges, add `profileVersionId: true` to the `select` in `admin-runs.repository.ts` and return it.
8. **No standalone `hasR2Bundle` helper exists** (it is a response field of `runs.get` built inline). `admin-runs.repository.ts` applies the identical predicate (`video_generation` stage whose output has `r2ManifestKey`) as `stageHasBundle`; `isR2Configured`, `getObjectText` and `getPresignedDownloadUrl` are reused from `storage/r2-client`, and the manifest lookup mirrors `runs.getAttemptBundle`. `runs.ts` was not modified.
9. **Stage `reason`** comes from the stage's `error` column first (that is where the budget refusal text of a skipped attempt lives, not in `output`), then the documented `reason`/`error`/`message` output keys, each truncated to 300. **`qualityMetrics.softWarnings`** (a string array) is joined into one short string so no nested value is returned.
10. **`admin.budget.get` reads the quota with `findAgentQuota`** (what `loadChannelBudgetView` itself reads) and lists all channels, instead of calling `loadChannelBudgetView` directly: that function lists only active channels and logs a `console.error` on every call for a misconfigured tenant (noise per admin read). A test asserts the ceilings equal `loadChannelBudgetView`'s. `below_guide` is raised when `budgetDilutionWarning(view)` returns a message (the gate module's own rule: the lowest default-share ceiling is under $20), not by re-deriving "budget < $20 x channels".
11. **`override_reserves_whole_pool` fires when overrides EQUAL the pool** (the gate's `onPoolFullyReserved` case); overrides above it give `override_exceeds_pool`. `override_starves_others` fires only for a positive sub-$5 share (a $0 share is already `zero_share`).
12. **Legacy `bugs.updateTriage` is now audited too**, through the same repository function as `admin.bugs.updateTriage` (the business rules forbid an unaudited admin write, and the hot-fixer's status change is one). Its unknown-id failure is now `NOT_FOUND` instead of a raw Prisma error.
13. **`cost_gap` in the overview excludes known free providers** (`pexels`, `youtube`, `youtube-analytics`); `admin.usage.gaps` lists every `$0` group.
14. **`AdminAuditLog` sits before `BugReport` in `schema.prisma`** (not at the end) so it cannot conflict with a model appended at the end of the file by the Sprint 4 branch; a trial merge showed that was the one conflict I would have added.

SCHEMA.md and BUSINESS_LOGIC.md were updated to match (items 1, 5, 11, 12).

## Founder Actions

After you review and merge PR #50 (I did not merge it):

1. Confirm the deploy applied the migrations: `pm2 logs sevenai`, and `\d users` shows `isPlatformAdmin`, `\d admin_audit_log` exists, `\d bug_reports` shows `triageNote` and `status` as `character varying(32)`.
2. On the VPS: `cd /var/www/7AI/studio && npx tsx scripts/set-platform-admin.ts neeraj100296@gmail.com` (idempotent; writes one `platform_admin.grant` audit row).
3. Call `admin.overview` and `admin.budget.get` for tenant `d0617c67-b7bd-47b1-9501-d316d2d66a15` with the ops token (same `curl` shape as the `bugs.list` call used on 2026-10-05) and compare the numbers with the SQL results from that day. Expect `override_reserves_whole_pool` and a `zero_share` warning for Underdogs, `gateSpentUsd` this week only.
4. From a tenant-owner account other than yours, confirm `bugs.list` now returns `FORBIDDEN`.
5. Call `admin.system.info` with the ops token: `commit` must equal `git log -1 --oneline` on the VPS and the flags must match the server's `.env` (names are never returned). Then open a real bug's run with `admin.runs.get`.

Also, for whoever merges next:

6. **Sprint 4 overlap.** `sprint4_be` adds migration `20261006080445_sprint4_channel_profiles` (tables `channels`, `pipeline_runs`, new `channel_profile_versions`); mine touch `users`, `bug_reports`, new `admin_audit_log`, so there is no table overlap, and the sprint4 SQL applied cleanly on top of a database that already had mine. Its timestamp sorts **before** mine; `prisma migrate deploy` applies pending migrations in order, so that is fine on the VPS, but `prisma migrate dev` would call it out of order on a developer database. `git merge-tree` shows `sprint4_be` already conflicts with current `main` in `state-machine.ts`, `video-generation/index.ts`, `dashboard*.ts` (not files this task touches); with this branch the only additional conflict was `schema.prisma`, which I removed (Deviation 14). `origin/main` had not moved since I branched, so `git merge origin/main` was a no-op.
7. **FE agent**: `admin.runs.content` must be called as a mutation (Deviation 5); every other procedure and output field is as written in `be/task1.md`, none renamed.

## Sign-Off
- Task Objective: Met
- Schema Impact: SCHEMA.md updated (status column widened to `VARCHAR(32)`)
- Business Logic: BUSINESS_LOGIC.md updated (content is a mutation; budget warning semantics; both triage routes audited)
- Security rules (section 7): all met (deny by default via `adminProcedure`; flag read from the database per call; tenant is an explicit input and `ctx.tenantId` is never read; no secret returned; every write audited in the same transaction; no impersonation; existing tenant routers unchanged and regression-tested)
- Ready for Integration: Yes (after the founder actions above)
