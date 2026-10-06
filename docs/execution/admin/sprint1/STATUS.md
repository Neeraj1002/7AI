# Admin Sprint 1 Status: The "See" Release (platform-admin identity, audit log, read-only cross-tenant views)

**Sprint status**: BE Task 1 and FE Task 1 are both built; PRs #50 (merged) and #51 (ready for review). FE Task 1 needs the founder's merge, the OTA and the phone checks.
**Last updated**: 2026-10-06 (after FE Task 1)

**Branches: `admin_sprint1_be` (BE Task 1) and `admin_sprint1_fe` (FE Task 1)**, each cut from a fresh
`origin/main` by its own task, one draft PR each, marked ready by that task. The FE branch is cut **after the BE
PR is merged** (see `ADMIN_TASK_TEMPLATE.md` section 2). Do not merge; never push to `main`.

| Task | Track | Name | Status | Owner | Branch | Notes |
|---|---|---|---|---|---|---|
| BE 1 | BE | Platform-Admin Identity, Audit Log, and the Read-Only Cross-Tenant API (incl. run inspector, system info, bug `awaiting_verification` + note; ~24h) | Done — action needed | **Founder** | `admin_sprint1_be` (cut from `origin/main` at efb7feb, which contains #48; PR #50, ready for review) | Report: `../report/sprint1/be/task1.md` (R0-R10 done, 276 tests passing). Founder: review and merge PR #50, then run the Founder Actions in the report (set the platform-admin flag with `scripts/set-platform-admin.ts`, compare against the 2026-10-05 SQL results). FE must call `admin.runs.content` as a mutation. |
| FE 1 | FE | The Admin Section in the App: Overview (with System card), Tenants, Budget View, Usage, Bugs, Run Inspector, Audit Log (~17.5h) | Done — action needed | **Founder** | `admin_sprint1_fe` (cut from `origin/main` at 14e9f36, which contains BE PR #50; PR #51, ready for review) | Report: `../report/sprint1/fe/task1.md` (R1-R8 done; tsc and lint clean; verified against the sandbox fixture, no screenshots possible, so descriptions). Founder: review and merge PR #51, confirm the BE founder steps, `eas update --branch preview`, then the phone checks in the report. |

## Dependencies
- **Closure PR #48 -> BE 1 -> FE 1.** BE 1 imports the week-start helper, `checkBudget`, `MIN_CHANNEL_SHARE_USD` and `computeChannelBudgetCeilings` from `run-pipeline/budget-gate.ts` and changes none of them. If #48 isn't merged when BE 1 is scheduled, the agent stops and tells the founder; it does not copy that code. Decision record: `bugs/Sprint3/closureTask.md` D4.

## Scope boundary
Read-only, except bug triage (status, area, priority, note) and the script that grants the platform-admin flag.
Tenant content is shown only through an explicit, logged "Show content" action (design decision DA-6). Writes (budget edit, run
force actions, tenant creation and suspension) are Admin Sprint 2.

## Full detail
Tasks: `be/task1.md`, `fe/task1.md`. Reports (once written): `docs/execution/admin/report/sprint1/be/task1.md`,
`docs/execution/admin/report/sprint1/fe/task1.md`. Design: `docs/execution/admin/ADMIN_MODULE_DESIGN.md`.
Template: `docs/execution/admin/ADMIN_TASK_TEMPLATE.md`. Schema delta: `SCHEMA.md` and `BUSINESS_LOGIC.md` in
this folder are created by BE Task 1 (R0).
