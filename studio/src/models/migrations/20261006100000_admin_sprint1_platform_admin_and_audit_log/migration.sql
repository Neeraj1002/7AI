-- Admin Sprint 1 (R1) — additive and idempotent.

-- The platform-wide Admin flag; every existing user becomes a non-admin.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false;

-- Audit log: no foreign keys on purpose (a row must survive deletion of its target).
CREATE TABLE IF NOT EXISTS "admin_audit_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actorKind" VARCHAR(20) NOT NULL,
    "actorUserId" UUID,
    "action" VARCHAR(100) NOT NULL,
    "targetType" VARCHAR(50) NOT NULL,
    "targetId" VARCHAR(100),
    "tenantId" UUID,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_audit_log_actor_kind_check') THEN
    ALTER TABLE "admin_audit_log"
      ADD CONSTRAINT "admin_audit_log_actor_kind_check"
      CHECK ("actorKind" IN ('session', 'ops-token', 'script'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_admin_audit_created" ON "admin_audit_log"("createdAt");
CREATE INDEX IF NOT EXISTS "idx_admin_audit_tenant_created" ON "admin_audit_log"("tenantId", "createdAt");
