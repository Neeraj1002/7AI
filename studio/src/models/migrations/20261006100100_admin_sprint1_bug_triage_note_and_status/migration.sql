-- Admin Sprint 1 (R3) - additive and idempotent.

-- Short triage note (replaces the previous note; history lives in admin_audit_log).
ALTER TABLE "bug_reports" ADD COLUMN IF NOT EXISTS "triageNote" VARCHAR(500);

-- The new status value 'awaiting_verification' is 21 characters, one more than the
-- original VARCHAR(20). Widening a varchar is non-destructive and a no-op when
-- the column is already wide.
ALTER TABLE "bug_reports" ALTER COLUMN "status" TYPE VARCHAR(32);

-- bug_reports.status has no CHECK constraint in any migration; this guarded drop only
-- matters on a database where one was added by hand.
ALTER TABLE "bug_reports" DROP CONSTRAINT IF EXISTS "bug_reports_status_check";
