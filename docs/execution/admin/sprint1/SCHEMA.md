# Admin Sprint 1 — Schema Delta

Incremental: only what Admin Sprint 1 changes against the running system. Authoritative for BE Task 1
(`be/task1.md`). Conventions kept: VARCHAR + CHECK instead of native enums, `gen_random_uuid()` ids, camelCase
quoted columns, additive and idempotent migrations.

## Tables Modified

### `users`
| Column | Type | Notes |
|---|---|---|
| `isPlatformAdmin` | `BOOLEAN NOT NULL DEFAULT false` | The **Admin** level. Set only by `scripts/set-platform-admin.ts`. Read from the database on every admin call, never copied into the session token. `users.role` is untouched. |

No backfill: every existing user becomes a non-admin.

### `bug_reports`
| Column | Type | Notes |
|---|---|---|
| `triageNote` | `VARCHAR(500) NULL` | Short note set through triage. Replaces the previous note; history lives in `admin_audit_log`. |

New status value `awaiting_verification` ("fixed in code, not yet verified on the deployed build").
`bug_reports.status` has **no CHECK constraint** (verified in the migrations: it is constrained only by the
TypeScript `BUG_REPORT_STATUSES` constant), so the value itself is a constant change. **The column was
`VARCHAR(20)` and `awaiting_verification` is 21 characters, so the migration widens it to `VARCHAR(32)`**
(non-destructive, a no-op when already wide; the task doc did not anticipate this). The migration also contains a
guarded `DROP CONSTRAINT IF EXISTS bug_reports_status_check`, which matters only on a database where someone added
one by hand.

## Tables Created

### `admin_audit_log`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK, default `gen_random_uuid()` | |
| `actorKind` | `varchar(20) NOT NULL` | CHECK in (`session`, `ops-token`, `script`) |
| `actorUserId` | `uuid NULL` | null for the ops token and scripts |
| `action` | `varchar(100) NOT NULL` | e.g. `bug.triage`, `platform_admin.grant`, `run.content_view` |
| `targetType` | `varchar(50) NOT NULL` | e.g. `bug_report`, `user`, `run` |
| `targetId` | `varchar(100) NULL` | |
| `tenantId` | `uuid NULL` | |
| `before` / `after` | `jsonb NULL` | pass through `redact()` before being stored |
| `reason` | `text NULL` | |
| `createdAt` | `timestamptz NOT NULL DEFAULT now()` | |

Indexes: `(createdAt)`, `(tenantId, createdAt)`. **No foreign keys** (an audit row must survive deletion of the
thing it describes).

## Migrations
1. `admin_sprint1_platform_admin_and_audit_log` (R1)
2. `admin_sprint1_bug_triage_note_and_status` (R3)

Both: `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS` / guarded constraint changes; apply cleanly to a
fresh database and are a no-op on one that already has them.
