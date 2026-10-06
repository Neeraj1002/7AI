# 7AI Admin Module — Design Proposal

**Status**: proposal for founder review (2026-10-05); updated 2026-10-06 (two roles only, Sprint 1 task files written). Nothing here is built. Findings below were read from the
local checkout at `D:\Study Material\7AI` and from the SQL the founder ran on the preview VPS on 2026-10-05;
re-verify against `main` before building any item.

**Purpose**: today the only way to see across tenants, agents, spend and bugs is to run SQL on the VPS and paste
the results (that is how the budget problem in `bugs/Sprint3/closureTask.md` F9/F10 was found). The admin
module gives the platform owner one place to **see** the whole system, **modify** the things that today need
SQL or a script, and **decide** the things that are waiting on a person, with every change recorded.

---

## 1. What exists today (verified from code)

| Fact | Where | Consequence |
|---|---|---|
| Two tenant roles exist in the schema, `owner` and `approver`, stored as `User.role` (`VARCHAR(20)`, default `owner`). Both are **tenant-scoped**: a user belongs to exactly one tenant. | `schema.prisma` `model User` | There is no role for "the person who runs the platform". |
| New testers are created by `scripts/invite-tenant.ts` as a new tenant plus an `owner` user. **Nothing in the code ever creates an `approver`.** | `scripts/invite-tenant.ts`, `user.repository.ts` | `approver` exists in the type and the schema comment only. |
| The session JWT carries `userId`, `tenantId`, `role`, copied from the User row at login (magic link). The `API_AUTH_TOKEN` ops token resolves to `role: 'owner'` on the MVP tenant. | `auth/jwt.ts`, `auth/magic-link.ts`, `api/trpc.ts` | The ops token is effectively the founder's super-key, but every other endpoint still scopes it to one tenant. |
| `canResolveGate(ctx, channel)` = same tenant AND (caller is the channel's `ownerUserId` OR caller's role is `owner`). `loadManageableChannel` (update / archive) **reuses the same function**. | `run-pipeline/gate-ownership.ts`, `routers/channels.ts` | An `approver` who is a channel's `ownerUserId` could also manage that channel. "Approver: view + approve, nothing else" is a comment, not a rule. **Decision 2026-10-06: `approver` is dormant** (see 2.1), so this stays as is. |
| `bugs.list` and `bugs.updateTriage` only check `role === 'owner'`, and `BugReport` has **no `tenantId`**. | `routers/bugs.ts`, `schema.prisma` | **Any tenant's owner can list and triage every tenant's bug reports.** Every invited tester is an `owner`. This is a real privilege gap, small to fix (A0). |
| Dashboards (`getOperationalDashboard`, `getCostDashboard`, ...) all take a `tenantId`. | `dashboard.repository.ts` | There is no cross-tenant read path at all. |
| Budget refusal text is generic; override-equals-pool gives other channels a $0 ceiling with no warning (closure F9); image and some provider cost is recorded as $0 (closure F10). | `budget-gate.ts`, `usage_events` | The admin module's budget and cost screens are only trustworthy after closure R1. |
| A founder digest already exists (`run-pipeline/founder-digest.ts`). | `notify-founder/` | The admin Overview supersedes the *content* of the digest; the digest stays as the push channel. |

---

## 2. Role model

### 2.1 Two roles for now: Admin and Account owner

**Founder decision, 2026-10-06: the system runs on two roles, Admin and Account owner.** The `approver`
role is not built, not exposed and not invited. It has nobody to give it to: a user who adds YouTube channels
to the app manages them and approves their gates, so approving is part of being the Account owner. The value
`approver` stays allowed in the `User.role` column (no migration, nothing breaks), but no code creates or
checks for it. See 2.4 for when to bring it back.

The cleanest fix for "who runs the platform" is **not** to overload `owner`. Every invited tester is an
`owner` of their own tenant, so "owner" can't also mean "owner of the platform". Keep the tenant role as it
is and add a separate, orthogonal platform flag.

| Level | Who | How it is represented | Scope |
|---|---|---|---|
| **Admin** (new, platform admin) | The founder, and nobody else for now | `User.isPlatformAdmin Boolean @default(false)`, set only by a script. The flag is **read from the database on every admin call**, not copied into the session token, so removing it takes effect immediately. The `API_AUTH_TOKEN` ops token also counts as Admin on `admin.*` routes | Every tenant, every channel, every run, every setting |
| **Account owner** (exists as `User.role = 'owner'`) | A tenant's primary user: the founder in their own tenant, each invited tester in theirs | `User.role = 'owner'` | Their own tenant only: their channels, runs, gates and spend |

In the app and in this document, call `owner` **"Account owner"** and the new level **"Admin"**, so the word
"owner" stops meaning two things. The founder is both: an Account owner of their own tenant, plus an Admin on
top.

### 2.2 Permission matrix

`R` = see, `W` = modify, `D` = decide (an approval-type action that changes an outcome), `-` = none.

| Capability | Admin | Account owner |
|---|---|---|
| Cross-tenant overview, tenants list, system health, agents, audit log | R W D | - |
| Create / suspend a tenant; set a tenant's weekly budget; set a channel override | W D | - (read-only view of own budget) |
| Own tenant's channels: create, edit, archive, connect YouTube | W | W |
| Own tenant's users | W | R (no invite flow in v1: one user per tenant today) |
| Runs: view, create, retry, cancel | R W | R W |
| Gate 1 / Gate 2: approve, revise, reject | D (override, logged) | D |
| Force actions on a stuck run (clear budget hold, mark failed, re-drive) | W D (reason required) | - |
| Bug reports: view all, triage | R W D | - (can submit) |
| Cost and usage | R all tenants | R own tenant |
| Budget increase | D | - (can request, A4) |

### 2.3 Enforcement fixes this needs (small, in Admin Sprint 1)

1. **Add an `adminProcedure`** next to `publicProcedure`: it passes only for the ops token or a session whose
   user row has `isPlatformAdmin = true` (looked up per call).
2. **Replace `assertOwner` in `bugs.ts` with that admin check.** Tenants keep the submission form
   (unchanged). This closes the leak where any tenant's owner can list and triage every tenant's bug reports.
3. **Ops token stays**, but only as an Admin credential on `admin.*` routes and scripts; it is never a tenant
   owner's token again once tenants have their own sessions.

(`canResolveGate` / `canManageChannel` splitting was only needed for `approver`; it is dropped until that
role returns.)

### 2.4 When `approver` comes back

When a tenant needs a second person who reviews and approves videos but must not touch channels, budgets or
YouTube connections (an editor, an agency client). At that point: an invite flow, a role check on gate
resolution, `canResolveGate` / `canManageChannel` split, and a decision on whether an approver sees all of a
tenant's channels or only assigned ones (a `channel_members` table). Until then it does not exist.

---

## 3. Module map: what the founder can see, modify and decide

Each screen answers a question the founder has had to ask via SQL. Source queries are the ones already run.

| Screen | See | Modify | Decide | Replaces |
|---|---|---|---|---|
| **Overview / Decision queue** | Tenants, active channels, runs by status this week, spend this week vs ceilings, failing runs, YouTube connections near expiry, open bugs | - | A single list of everything **waiting on you** (see 3.1) | The founder digest as a dashboard; ad-hoc SQL |
| **Tenants** | All tenants: owner email, channels, users, runs, weekly spend, status | Create a tenant (replaces `invite-tenant.ts`), suspend / reactivate, rename | Approve a budget request | `scripts/invite-tenant.ts` |
| **Budgets** | Per tenant: weekly pool, spent this week, **effective ceiling per channel**, warnings (an override that swallows the pool, a channel at $0) | Edit the weekly pool, set / clear a channel override, with a preview of the resulting ceilings before saving | Grant or refuse an increase | `UPDATE agent_quotas ...`, `UPDATE channels SET "budgetOverrideUsd"`, `set-budget-ceiling.ts` |
| **Channels & connections** | All channels across tenants: active, owner, voice, privacy default, YouTube connection age and state, last analytics snapshot | Archive / restore, set default voice, assign owner | Mark a connection as needing reconnect (notifies the account owner) | The poll / credential-age SQL |
| **Runs** | Cross-tenant list with filters (tenant, channel, status, stage, date); run detail with stages, errors, cost per run, budget refusal reason | Retry, cancel, **clear a budget hold**, re-drive a stuck run | Force-approve or force-reject a gate on someone's behalf (reason required, logged) | `runs.list` per tenant, `close-stale-test-runs.ts`, `list-stale-running-runs.ts` |
| **Cost & usage** | Spend per week, tenant, channel, **agent / model**, cost per run, cost per published video; alerts for rows recording $0 (closure F10) | - | - | The three cost SQL queries |
| **Agents** | Per agent (script-generation, script-review, video-production-planning, video-generation, video-intelligence, metadata, intake): calls, cost, failure rate, median duration, model in use | Later (A5): per-agent model and defaults | - | The by-agent SQL |
| **System health** | Last analytics poll time and result per channel, `invalid_grant` counts, R2 configured, stub flags on (`MEDIA_STUB`, `STOCK_FOOTAGE_STUB`, `AI_VISUALS_STUB`), which env keys are present (**names only**), process boot time | - | - | `pm2 logs` spelunking; the `poll` command |
| **Bugs & feedback** | All reports with run link, priority, area, status | Triage (status / area / priority) via the existing `updateTriage` logic | Close as fixed / by design / won't fix | `curl /trpc/bugs.list` |
| **Users** | Users per tenant, role, last login | Deactivate (later) | - | `psql` on `users` |
| **Audit log** | Every admin write: who, what, target, before and after, reason, time | - | - | Nothing exists today |

### 3.1 The decision queue (the "decide" part)

A computed list on the Overview, each item with one-tap actions. Initial set:

1. **Budget holds**: a run or channel is blocked by budget (closure R1) → raise ceiling / leave.
2. **Expired or expiring YouTube connection**: a channel's credential is older than 6 days while the OAuth
   consent screen is in Testing (the 7-day expiry we hit with MyAIPets) → notify owner / archive channel.
3. **Runs in `needs_attention`** older than a day → retry / mark failed / open.
4. **Gates pending** longer than N hours on any tenant → nudge the owner, or force-resolve.
5. **Untriaged bug reports** (`area` is null).
6. **Cost recording gaps**: usage rows with `$0` cost → investigate.
7. **New tenant signups waiting** (A4, only if invite requests are ever added).

---

## 4. API design

A new `admin` router in `studio/src/api/routers/admin.ts`, mounted in `api/router.ts` next to the others.

- **`adminProcedure`**: a tRPC middleware that passes only when the identity is a platform-admin session or
  the ops token. Every `admin.*` call is rejected otherwise, regardless of tenant role.
- **Tenant is always an explicit input** on admin calls (`tenantId`); admin procedures never read
  `ctx.tenantId`. This is the opposite of every other router, on purpose.
- **Reads** go through new repository functions (`admin.repository.ts`) that run Prisma aggregates, not
  raw SQL, so they follow the schema.
- **Writes** go through `writeAdminAudit(ctx, action, target, before, after, reason)` in the same
  transaction as the change.

| Group | Endpoints (first cut) |
|---|---|
| Overview | `admin.overview` (counts + the decision queue) |
| Tenants | `admin.tenants.list`, `.get`, `.create`, `.setStatus` |
| Budgets | `admin.budget.get({tenantId})` (pool, spent this week, per-channel effective ceilings + warnings), `.preview({tenantId, pool?, overrides?})`, `.update` |
| Channels | `admin.channels.list`, `.setActive`, `.setVoice`, `.flagReconnect` |
| Runs | `admin.runs.list`, `.get`, `.retry`, `.cancel`, `.clearBudgetHold`, `.forceGate({decision, reason})` |
| Usage | `admin.usage.byWeek`, `.byAgent`, `.byRun`, `.gaps` |
| Health | `admin.health.analytics`, `.config` (flags and key **names**, never values) |
| Bugs | `admin.bugs.list`, `.updateTriage` (moves the logic out of `bugs.ts`) |
| Users | `admin.users.list`, `.invite`, `.setRole`, `.deactivate` |
| Audit | `admin.audit.list` |

`admin.budget.update` must reuse the allocator from closure R1 (`checkBudget` / `computeChannelBudgetCeilings`)
so the screen shows exactly what the gate will enforce, and must refuse saves that give an active channel a
$0 share unless confirmed.

---

## 5. Data model changes (minimal, each a separately approved migration)

| Change | Why | Phase |
|---|---|---|
| `User.isPlatformAdmin Boolean @default(false)` | Platform admin level | A1 |
| `admin_audit_log` (`id`, `actorUserId` null for ops token, `actorKind` session/ops-token, `action`, `targetType`, `targetId`, `tenantId` null, `before` JSON, `after` JSON, `reason`, `createdAt`) | Accountability for every admin write | A1 |
| `Tenant.status` (`active` / `suspended`) | Suspend a tenant without deleting; the run gate refuses suspended tenants | A2 |
| `Channel.reconnectRequestedAt` (nullable) | "Flag for reconnect" from the decision queue | A3 |
| `budget_requests` (tenantId, requestedBy, amount, note, status) | Owner asks, admin decides | A4 |
| `platform_settings` (key, value JSON) | Per-agent model and defaults at runtime instead of env/code | A5 |

No change to `User.role`: it keeps its allowed values; only `owner` is ever written or checked.

---

## 6. Security rules

1. Admin routes are **deny-by-default**: the only way in is the platform-admin flag or the ops token.
2. **Never return secrets**: no tokens, refresh tokens, API keys, or env values. Env checks return key
   **names present or missing** only (same rule as Task 13/R1's `.env` check).
3. **Every write is audited**, with a required `reason` for force actions and budget changes.
4. **No impersonation in v1.** The admin reads other tenants' data but never signs in as them.
5. The ops token is for scripts and `curl` only; the app uses a real platform-admin session so admin actions
   carry a person's identity in the audit log.
6. Tenants never see other tenants' ids, names or spend. Fix the `bugs.list` leak in A0.

---

## 7. Phases (proposed tasks, in this order)

| Phase | Scope | Est. | Depends on |
|---|---|---|---|
| **A0 Hotfix** | Move `bugs.list` / `bugs.updateTriage` behind a platform-admin check (script sets the founder's `isPlatformAdmin`) | ~2h | Nothing. Folded into Admin Sprint 1. |
| **A1 Foundation** | `isPlatformAdmin` column, `adminProcedure`, `admin_audit_log`, `admin.overview`, `admin.tenants.list/get`, `admin.audit.list`; app: Admin section visible only to admins, Overview + Tenants (read-only) | ~6-8h | A0 |
| **A2 Budgets and runs** | `admin.budget.*` with preview, `admin.runs.*` with force actions and clear-budget-hold, tenant suspend | ~6-8h | A1; closure R1 (weekly window, `checkBudget`) |
| **A3 Channels, health, cost, bugs** | Channels and connections screen, health screen, usage screens, bug triage screen, decision queue items 2, 5, 6 | ~6-8h | A1; closure R1 step 7 (accurate cost) |
| **A4 Account screen** | Users screen, deactivate; Account owner's own read-only budget and users screen; budget requests | ~5h | A1 |
| **A5 Agents and runtime settings** | Per-agent stats and, later, editable defaults via `platform_settings` | ~8h | A3 |

The module's first useful moment is **A1 + A2**: that alone replaces the SQL used to find F9.

### 7.1 Sprint mapping (task files)

Work is organised in **Admin sprints** under `docs/execution/admin/`, with its own template
(`ADMIN_TASK_TEMPLATE.md`), branches `admin_sprint<N>_be` and `admin_sprint<N>_fe` cut from `origin/main` (FE after the BE PR merged), and reports under
`docs/execution/admin/report/sprint<N>/{be,fe}/`.

| Admin sprint | Tasks | Covers |
|---|---|---|
| **Sprint 1** (the "see" release) | `sprint1/be/task1.md`, `sprint1/fe/task1.md` | A0 + A1, plus **read-only** slices of A2/A3: budget view with warnings, usage and cost gaps, bug triage, audit log. The only writes are bug triage and a script that sets the platform-admin flag. |
| Sprint 2 (the "modify" release), not yet written | | A2 writes: budget edit with preview, run force actions, tenant suspend; depends on `bugs/Sprint3/closureTask.md` R1 |
| Later | | A3 channels/health, A4, A5 |

---

## 8. Founder decisions needed

- **DA-1 — Where does it live?** Recommendation: **inside the existing Expo app**, as an Admin section shown
  only to platform admins, reusing the same tRPC client and types. Tables become cards with drill-down so it
  works on a phone. Alternative: a separate web console (better for wide tables and bulk work, a second
  codebase to keep). Start in the app; build a web console only if the tables prove too cramped.
- ~~DA-2 — What can an approver see?~~ **Withdrawn 2026-10-06**: no approver role for now (2.1, 2.4).
- **DA-3 — Who is a platform admin?** Recommendation: only your account, set by script, never through the
  app. Do you want a second admin account later?
- **DA-4 — Can an Account owner change their own budget?** Recommendation: no; they see it and request more
  (A4). Costs are on you in the testing phase.
- **DA-5 — Does the founder digest stay?** Recommendation: yes, as the push summary; it should read from the
  same `admin.overview` data once A1 exists, so the two never disagree.

## 9. Out of scope (deliberately)

Impersonating a tenant; billing and payments (INR display aside); a full RBAC system with custom roles
(`MVP_PART2` deliberately kept two roles); editing prompts from the UI; deleting tenants or data
(archive and suspend only); self-serve signup.

## 10. Links

- `docs/execution/bugs/Sprint3/closureTask.md` — F9/F10 (the findings that motivated this), R1 (weekly budget,
  `checkBudget`), R3 (success rate per published video, per-gate analytics), D1-D3.
- `docs/design_doc/MVP_PART2_MULTI_USER_AND_FLEXIBLE_CREATION.md` — the tenant model.
- `docs/execution/admin/ADMIN_TASK_TEMPLATE.md`, `docs/execution/admin/sprint1/` — the admin track's template and first tasks.
- `studio/src/run-pipeline/gate-ownership.ts`, `studio/src/api/routers/bugs.ts`, `studio/src/api/trpc.ts` —
  where the role checks live today.
