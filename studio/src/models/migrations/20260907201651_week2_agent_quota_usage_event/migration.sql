-- CreateTable
CREATE TABLE "agent_quotas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "platform" VARCHAR(20) NOT NULL DEFAULT 'youtube',
    "budgetCeilingUsd" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_quotas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "channelId" UUID NOT NULL,
    "pipelineRunId" UUID,
    "stageId" UUID,
    "agent" VARCHAR(100) NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "model" VARCHAR(100) NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "costUsd" DECIMAL(10,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_quotas_tenantId_platform_key" ON "agent_quotas"("tenantId", "platform");

-- CreateIndex
CREATE INDEX "idx_usage_tenant_platform_time" ON "usage_events"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "idx_usage_run" ON "usage_events"("pipelineRunId");

-- AddForeignKey
ALTER TABLE "agent_quotas" ADD CONSTRAINT "agent_quotas_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_pipelineRunId_fkey" FOREIGN KEY ("pipelineRunId") REFERENCES "pipeline_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "pipeline_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CheckConstraints
-- VARCHAR + CHECK, not native Postgres ENUM — matches channels.platform's
-- convention, see docs/execution/week1/SCHEMA.md's "Enum Strategy" section.
ALTER TABLE "agent_quotas" ADD CONSTRAINT "agent_quotas_platform_check"
  CHECK ("platform" IN ('youtube'));

-- SeedData
-- Founder-confirmed starting budget ceiling for Script Generation's cost gate
-- (Week 2 Task 4) — $2.00, a conservative backstop for early testing, easy to
-- raise later since it's a plain config row. ON CONFLICT makes this migration
-- safe to re-run.
INSERT INTO "agent_quotas" ("tenantId", "platform", "budgetCeilingUsd")
VALUES ('00000000-0000-0000-0000-000000000001', 'youtube', 2.00)
ON CONFLICT ("tenantId", "platform") DO NOTHING;
