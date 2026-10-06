# Admin Sprint 1 — Business Logic Delta

Authorization and audit rules only. No pipeline state changes.

## Rules
1. **Who is an Admin.** A call is admin-authorized iff the caller is the ops token, **or** a session whose user
   row currently has `isPlatformAdmin = true` (fresh `findUserById` read on every call). A session whose user row
   no longer exists is not an Admin. The refusal is always `FORBIDDEN` / `Admin only`, never saying why.
2. **Two roles only.** Admin and Account owner (`owner`). `approver` is dormant: not created, checked or exposed.
3. **Tenant is always explicit** on admin calls; admin procedures never read `ctx.tenantId`.
4. **Audit.** Every write made through an admin procedure or admin script writes an `admin_audit_log` row in the
   **same transaction** as the change. If the audit write fails the change fails. An audit row exists iff the
   change committed. `before`/`after` pass through `redact()` (drops keys matching
   `/token|secret|password|authorization|key/i`).
5. **DA-6: structure by default, content only on an explicit audited call.** (`admin.runs.content` is a tRPC
   **mutation**, not a query: it has a side effect, and a client-cached query could leave a view unaudited or audit it
   twice. Clients must call it with `mutationOptions`.) Admin responses carry ids,
   statuses, stages, truncated errors, timestamps, costs and key **names**. Tenant content (brief, stage output,
   plan, transcript, bundle file) comes only from `admin.runs.content`, which writes its `run.content_view`
   audit row **first** and returns nothing if that write fails. Text responses are capped at 200 KB.
6. **Read-only.** The only admin writes in this sprint are bug triage (`status`, `area`, `priority`, `note`) and
   the platform-admin script.
7. **Bug triage access.** `bugs.list` / `bugs.updateTriage` (existing) now require Admin (ops token unchanged);
   a tenant owner session is `FORBIDDEN`. The unauthenticated tester-form routes are untouched.
8. **Bug triage is audited on both routes.** `admin.bugs.updateTriage` and the legacy `bugs.updateTriage`
   (hot-fixer, ops token) share one repository function that writes the change and its `bug.triage` audit row in
   one transaction. An unknown bug id is `NOT_FOUND` and writes nothing.
9. **Budget warnings.** `override_reserves_whole_pool` fires when overrides EQUAL the pool (the case the gate's own
   exceeds-pool warning never covered, matching `computeChannelBudgetCeilings`' `onPoolFullyReserved`);
   overrides ABOVE the pool give `override_exceeds_pool` instead. `override_starves_others` fires only for a
   positive but sub-minimum share (a $0 share is already `zero_share`). `below_guide` is informational and its
   wording is `budgetDilutionWarning(view)`'s.
10. **Budget view (read-only).** Spend figures come from the same functions the gate calls, always with
   `since: currentBudgetWindowStart()`; effective ceilings come from `computeChannelBudgetCeilings` via
   `loadChannelBudgetView`. Nothing is re-derived.

## Preconditions
The two migrations are applied; the founder's user exists (they log in by magic link).

## Postconditions
After a flag grant/revoke the next admin call reflects it immediately.

## Failure modes
- Unknown tenant/user/run/bug id: `NOT_FOUND`, no audit row.
- Failed transaction: the change and its audit row roll back together.
- Missing data (no quota, no channels, no runs): empty arrays / `null` fields plus warnings, never a 500.
