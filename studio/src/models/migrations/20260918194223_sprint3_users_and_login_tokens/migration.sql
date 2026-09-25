-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255),
    "role" VARCHAR(20) NOT NULL DEFAULT 'owner',
    "telegramChatId" VARCHAR(50),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "jti" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_users_tenant" ON "users"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "login_tokens_jti_key" ON "login_tokens"("jti");

-- CreateIndex
CREATE INDEX "idx_login_tokens_user" ON "login_tokens"("userId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_tokens" ADD CONSTRAINT "login_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CheckConstraint
-- VARCHAR + CHECK, not a native enum — this schema's own convention (see
-- schema.prisma's header comment), same pattern pipeline_runs.status,
-- pipeline_stages.status, and channels.priorsScope already use.
ALTER TABLE "users" ADD CONSTRAINT "users_role_check"
  CHECK ("role" IN ('owner', 'approver'));

-- SeedData
-- Sprint 3 Task 1 (J1) — the founder's own seeded User row, tied to the
-- existing MVP_TENANT_ID tenant, role 'owner'. Without this, Task 2 (J2,
-- login) has no one to log in as, and every existing dry-run/dashboard flow
-- silently loses its implicit "owner." Seeded email: neeraj100296@gmail.com
-- (the founder's real email — this task's own instruction: "state the
-- seeded email plainly in the report," same discipline Week 2 Task 4 used
-- for budgetCeilingUsd). ON CONFLICT makes this migration safe to re-run
-- against a DB that already has it.
INSERT INTO "users" ("id", "tenantId", "email", "name", "role")
VALUES ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-000000000001', 'neeraj100296@gmail.com', 'Neeraj', 'owner')
ON CONFLICT ("email") DO NOTHING;
