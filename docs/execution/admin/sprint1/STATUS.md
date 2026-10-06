# Admin Sprint 1 Status: The "See" Release (platform-admin identity, audit log, read-only cross-tenant views)

**Sprint status**: Both tasks written, not started. **BE Task 1 is blocked until closure PR #48 (`Sprint3_CLOSURE`, branch of the Bugs Sprint 3 closure task) is merged to `main`**: it builds the weekly budget window, `checkBudget()` and, per the founder's 2026-10-06 decision (D4), the budget-model validation that BE Task 1's budget view reads. After that, BE Task 1 must complete and its PR must be merged before FE Task 1 starts.
**Last updated**: 2026-10-06 (BE Task 1 now depends on closure PR #48; no code yet)

**Branches: `admin_sprint1_be` (BE Task 1) and `admin_sprint1_fe` (FE Task 1)**, each cut from a fresh
`origin/main` by its own task, one draft PR each, marked ready by that task. The FE branch is cut **after the BE
PR is merged** (see `ADMIN_TASK_TEMPLATE.md` section 2). Do not merge; never push to `main`.

| Task | Track | Name | Status | Owner | Branch | Notes |
|---|---|---|---|---|---|---|
| BE 1 | BE | Platform-Admin Identity, Audit Log, and the Read-Only Cross-Tenant API | Not started — **waiting for closure PR #48 to merge** | — | `admin_sprint1_be` (record the moment it is created, after branching from the `origin/main` that contains #48) | `be/task1.md`, work from `D:\Study Material\7AI`. Report: `../report/sprint1/be/task1.md`. Founder actions after merge: set the platform-admin flag with `scripts/set-platform-admin.ts`, compare against the 2026-10-05 SQL results. |
| FE 1 | FE | The Admin Section in the App: Overview, Tenants, Budget View, Usage, Bugs, Audit Log | Not started | — | `admin_sprint1_fe` (record the moment it is created, after BE 1's PR is merged) | `fe/task1.md`, work from `D:\Study Material\7AI-frontend`. Depends on BE 1. Report: `../report/sprint1/fe/task1.md`. JS-only, ships by OTA after merge. |

## Dependencies
- **Closure PR #48 -> BE 1 -> FE 1.** BE 1 imports the week-start helper, `checkBudget`, `MIN_CHANNEL_SHARE_USD` and `computeChannelBudgetCeilings` from `run-pipeline/budget-gate.ts` and changes none of them. If #48 isn't merged when BE 1 is scheduled, the agent stops and tells the founder; it does not copy that code. Decision record: `bugs/Sprint3/closureTask.md` D4.

## Scope boundary
Read-only, except bug triage and the script that grants the platform-admin flag. Writes (budget edit, run
force actions, tenant creation and suspension) are Admin Sprint 2.

## Full detail
Tasks: `be/task1.md`, `fe/task1.md`. Reports (once written): `docs/execution/admin/report/sprint1/be/task1.md`,
`docs/execution/admin/report/sprint1/fe/task1.md`. Design: `docs/execution/admin/ADMIN_MODULE_DESIGN.md`.
Template: `docs/execution/admin/ADMIN_TASK_TEMPLATE.md`. Schema delta: `SCHEMA.md` and `BUSINESS_LOGIC.md` in
this folder are created by BE Task 1 (R0).
