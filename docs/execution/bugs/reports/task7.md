# Bugs Task 7: Bug-Report Triage Fields (Type, Priority, Area) + a Real List/Update Endpoint

**Date**: 2026-09-28
**Status**: Complete. All three items live-verified end to end against a real, isolated sandbox database
and a real server process (never the shared dev DB).
**Files Created**: `studio/src/api/routers/bugs.ts`, one migration, `tasks/task7.md`, this report.
**Files Modified**: `studio/src/models/schema.prisma`, `studio/src/models/repositories/bug-report.repository.ts`,
`studio/src/api/server.ts`, `studio/src/api/router.ts`, `studio/src/api/bug-report-page.ts`
**Tests**: `npm run build`/`lint`/`typecheck` pass; `npm test` — 108/108 passing. Full real end-to-end
verification below (real HTTP requests against a real running server, real Postgres rows).

## List endpoint: tRPC, not REST — and why

The task doc left this as my call. I read `api/server.ts` in full first and found a real reason to prefer
tRPC: the `onRequest` auth hook exempts **the entire `/bugs*` prefix** from auth, deliberately, so a
tester who can't sign in can still submit a report. A new REST route at, say, `GET /bugs/list` would have
inherited that same exemption and leaked every report to anyone — the opposite of what R1 asks for. tRPC
lives under `/trpc`, entirely outside that exemption, and reuses the same `createContext`/session/ops-token
auth every other founder-only surface (`channels.ts`, `runs.ts`, `dashboard.ts`) already goes through.
`bugsRouter.list`/`updateTriage` are both gated on `ctx.role === 'owner'` — one check, since the
`API_AUTH_TOKEN` ops fallback already resolves to role `'owner'` in `createContext` (confirmed by direct
read before assuming).

## Real end-to-end verification (isolated sandbox DB + a real server process)

Booted an actual `tsx src/index.ts` server on a throwaway port against `sevenai_bugs_log2_sandbox`
(created, migrated, and dropped this session), with test-only local credentials (never real secrets — no
need to reuse them for a purely local sandbox test). Real `curl` requests, not mocks:

```
POST /bugs {reportType: bug, priority: blocker}        -> {"ok":true}
POST /bugs {reportType: feedback}                       -> {"ok":true}
POST /bugs {reportType: bug, no priority}                -> 400 "priority is required when reportType is \"bug\""
POST /trpc/bugs.list  (no Authorization header)          -> 401 unauthorized
POST /trpc/bugs.list  (garbage bearer token)              -> 401 unauthorized
POST /trpc/bugs.list  (real signed JWT, role='approver')  -> 403 FORBIDDEN "Only an owner-role session (or the ops token) can view/triage bug reports"
POST /trpc/bugs.list  (real API_AUTH_TOKEN, role='owner') -> 200, both real rows, correct reportType/priority/area
POST /trpc/bugs.updateTriage {status: fixed, area: FE}   -> {"updated":true}
  re-list                                                 -> same row now shows status:"fixed", area:"FE"
POST /trpc/bugs.list {idPrefix: "97b3"}                  -> only the one matching row
```

**One real response shape**, exactly as returned (superjson envelope, real ids):
```json
{"result":{"data":{"json":[
  {"id":"2def78ff-b263-4869-8885-e41c8cc1d9a0","description":"Would love a dark mode","status":"open","reportType":"feedback","priority":null,"area":null,"runId":null,"screenContext":null,"userAgent":"curl/8.18.0","createdAt":"2026-09-27T19:03:39.515Z"},
  {"id":"97b39d3b-59ab-4ee2-ba52-226320ca7318","description":"Gate 1 approve button froze for 10s","status":"fixed","reportType":"bug","priority":"blocker","area":"FE","runId":null,"screenContext":"/run/test","userAgent":"curl/8.18.0","createdAt":"2026-09-27T19:03:39.383Z"}
], "meta": {"values":{"0.createdAt":["Date"],"1.createdAt":["Date"]},"v":1}}}}
```

The `role='approver'` FORBIDDEN test used a real `signSessionToken` call against a real seeded user in
the sandbox DB, not a hand-crafted token — the role gate is exercised end to end, not just "the code looks
right."

## R2/R3 — what actually landed, and the schema deviation from the doc's literal item split

The migration adds all three columns (`reportType`, `priority`, `area`) in one file, exactly as R3's own
"same migration as R2" instruction allows. To keep the three commits (R1/R2/R3) each meaningful rather than
one giant diff, the split is: **R2's commit** carries the migration + `reportType`/`priority` exposure
(repository, `POST /bugs` validation, the submission-page pre-step); **R3's commit** exposes `area`
through the domain layer only (no further schema change, since the column already exists from R2's
migration) — matching the task doc's own framing that R3 has no schema work of its own beyond what R2's
migration already includes.

`bug-report-page.ts`'s existing context box, error handling, and the `sevenai://bugs-submitted` redirect
(Bugs Task 3/R2, Task 4/R1) are unchanged — confirmed by diff review, not just intent: the new pre-step
only toggles two `hidden`-class divs before the existing form/submit code path, which I did not touch.

## Schema Impact
One migration, additive only: `reportType VARCHAR(20) NOT NULL DEFAULT 'bug'`, `priority VARCHAR(20)`
(nullable), `area VARCHAR(20)` (nullable). No backfill needed — every pre-existing row is accurately
`reportType: 'bug'` with no priority. **Not yet applied to the shared dev DB** — standard "founder deploys
before merge" step, same as every schema-touching task before this one.

## Deviations from Spec
- List/update implemented as tRPC, not REST — see "why" above; the task doc left this open.
- Commit boundaries for R2/R3 split by domain-layer exposure, not literally "who owns the migration file,"
  since the file itself is genuinely one shared artifact per the task's own instruction.

## Sign-Off
- R1: confirmed live, including both an unauthorized and a wrong-role rejection with a real session token.
- R2: confirmed live — both report types submit correctly, validation rejects an incomplete bug report.
- R3: confirmed live — `area` starts `null`, triage-update sets it, visible on re-list.
- Ready for Integration: yes. Founder still needs to deploy the migration to the shared dev DB.

## Links & References
- `docs/execution/bugs/tasks/task7.md`, `docs/execution/bugs/STATUS.md`
- `docs/execution/bugs/tasks/task3.md` R2, `docs/execution/bugs/tasks/task4.md` R1 — the flows this doesn't regress
