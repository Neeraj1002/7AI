# SUPERSEDED (2026-10-11): the backend half is already in the codebase

> `bug_reports` has `reportType`, `priority`, `area` and `triageNote` (`schema.prisma`), and `bugs.updateTriage` exists (closure part 2 / Admin Sprint 1). Nothing is built under this task. The tester-facing type and priority chips (R2) are **deferred to Sprint 4**. Pending: the founder's `\d bug_reports` output on the VPS to confirm the live columns. See `Sprint3/reports/task12.md` (R9).

# Bugs Task 7: Bug-Report Triage Fields (Type, Priority, Area) + a Real List/Update Endpoint

**Read `docs/execution/bugs/HOTFIXER_AGENT_PROTOCOL.md` before starting.** This task needs a schema
migration — founder decision already made (see below), treat as approved to build.

**Note on branch name**: this task's real branch is `BUGS_LOG_2`, not `BUGS_TASK7` (accidentally taken by
Bugs Task 8's ad-hoc pipeline-bug-fix pass) or `BUGS_TASK7_TRIAGE` (superseded placeholder) — chosen
deliberately outside the `BUGS_TASK<N>` numbering so it can't collide with a future task number again.

**Why this exists**: `bug_reports` has no way to say whether a report is a bug or feedback, no priority,
no BE/FE/APP classification — and, more urgently, there is no way to even list submitted reports through
the app or API. `listBugReports()` already exists but was never wired to a route. That's the real,
live-blocking gap R1 closes; R2/R3's triage fields are layered on top.

**Update from Bugs Tasks 8/9**: `updateBugReportStatus(id, status)` is already called directly by
hot-fixer sessions to mark reports `fixed` — `updateBugReportTriage` extends it, doesn't replace it.
Postgres UUID columns don't support prefix matching (`LIKE 'abc%'` doesn't work against a `uuid` column,
confirmed the hard way in Task 9) — R1's list endpoint filters by `idPrefix` in JS after a full fetch,
not a DB-side prefix query.

## Founder decision (already made)
Three fields, deliberately minimal:
- `reportType`: `'bug' | 'feedback'`, tester-supplied, required.
- `priority`: `'blocker' | 'annoying' | 'minor'`, tester-supplied, required only when `reportType = 'bug'`.
- `area`: `'BE' | 'FE' | 'APP' | null`, never tester-facing — set later via the triage-update endpoint.

Explicitly decided against: tester-facing severity beyond the 3 chips, free-text tagging, a `taskRef`
field, any admin screen (frontend, out of scope — the list endpoint is enough for a fixer session or a
future screen to build on).

## R1 (Role: `BE`) — Wire up a real list + triage-update endpoint
`listBugReports(status?)` and `updateBugReportStatus(id, status)` already exist. Add a `bugsRouter`
(tRPC — not a third REST route under `/bugs`, since `api/server.ts`'s auth hook exempts the entire
`/bugs*` prefix from auth so a tester who can't sign in can still submit a report; a REST list route
there would inherit that exemption and leak every report). `list` and `updateTriage` are gated on
`ctx.role === 'owner'`, which already covers both a real owner-role session and the `API_AUTH_TOKEN` ops
fallback (it resolves to role `'owner'`). `updateBugReportTriage(id, { status?, area?, priority? })`
extends, not replaces, `updateBugReportStatus`. `list` also accepts `idPrefix`, filtered in JS.
No new UI — the endpoint is the deliverable.

**Verify**: a real authenticated call returns actual rows; unauthenticated/wrong-role calls are rejected;
a triage-update call changes fields, confirmed by re-listing.

## R2 (Role: `BE`) — Schema: add `reportType` and `priority`
Migration adds `reportType VARCHAR(20) NOT NULL DEFAULT 'bug'` and `priority VARCHAR(20)` (nullable) —
additive only. `insertBugReport` validates both server-side. `bug-report-page.ts` gets a fast pre-step
(two tap targets, then priority chips for a bug) ahead of the existing, otherwise-unchanged
textarea/submit flow — the context box, error handling, and the `openAuthSessionAsync` redirect
(Bugs Task 3/R2, Task 4/R1) stay exactly as they are.

**Verify**: submit one real report of each `reportType`; confirm both rows via R1's list endpoint with
the correct fields set; confirm the existing context box and auto-close still work unchanged.

## R3 (Role: `BE`) — Schema: add `area`
Same migration as R2. `area VARCHAR(20)`, nullable, no default. Set only via R1's triage-update endpoint,
never at submission — no FE change, by design.

**Verify**: a fresh submission has `area: null`; a triage-update call sets it and it's visible on the
next list call.

## Schema Impact
Additive only — `reportType` (`NOT NULL DEFAULT 'bug'`, safe on existing rows), `priority` and `area`
(both nullable). No backfill script, no change to the existing no-auth submission path.

## Testing
`npm run build && npm run lint && npm run typecheck`, plus each R-item's own real-submission/real-list
verification — no automated test suite exists for this project's DB-backed flows yet (see
`KNOWN_ISSUES_AND_BLOCKERS.md` §3), so this follows the same live-verification convention as every other
task here.

## Links & References
- `docs/execution/bugs/HOTFIXER_AGENT_PROTOCOL.md`, `docs/execution/templates/TASK_TEMPLATE.md`
- `docs/execution/bugs/tasks/task3.md` — R2, the original submission flow this extends
- `docs/execution/bugs/tasks/task4.md` — R1, the fallback route this must not regress
- `docs/execution/bugs/STATUS.md`
