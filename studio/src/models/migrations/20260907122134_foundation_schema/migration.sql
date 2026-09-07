-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channels" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "platform" VARCHAR(20) NOT NULL DEFAULT 'youtube',
    "name" VARCHAR(255) NOT NULL,
    "externalChannelId" VARCHAR(255),
    "nicheDescription" TEXT NOT NULL,
    "styleGuide" TEXT,
    "brandAssets" JSONB NOT NULL DEFAULT '{}',
    "postingCadence" VARCHAR(255),
    "approvalGateConfig" JSONB NOT NULL DEFAULT '{"gate1Enabled": true, "gate2Enabled": true}',
    "priorsScope" VARCHAR(20) NOT NULL DEFAULT 'isolated',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "channelId" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "currentStage" VARCHAR(50),
    "briefText" TEXT NOT NULL,
    "intakeParsed" JSONB,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pipeline_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_stages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pipelineRunId" UUID NOT NULL,
    "stageName" VARCHAR(50) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "input" JSONB,
    "output" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "channelId" UUID NOT NULL,
    "pipelineRunId" UUID NOT NULL,
    "stageId" UUID,
    "agent" VARCHAR(100) NOT NULL,
    "verdict" VARCHAR(50) NOT NULL,
    "rationale" TEXT NOT NULL,
    "editedOutput" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_channels_tenant" ON "channels"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "idx_channels_external" ON "channels"("platform", "externalChannelId");

-- CreateIndex
CREATE INDEX "idx_runs_tenant_channel" ON "pipeline_runs"("tenantId", "channelId");

-- CreateIndex
CREATE INDEX "idx_runs_status" ON "pipeline_runs"("status");

-- CreateIndex
CREATE INDEX "idx_stages_run" ON "pipeline_stages"("pipelineRunId");

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_stages_pipelineRunId_stageName_attemptNumber_key" ON "pipeline_stages"("pipelineRunId", "stageName", "attemptNumber");

-- CreateIndex
CREATE INDEX "idx_reviewlog_run" ON "review_logs"("pipelineRunId");

-- CreateIndex
CREATE INDEX "idx_reviewlog_channel_time" ON "review_logs"("channelId", "timestamp");

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_pipelineRunId_fkey" FOREIGN KEY ("pipelineRunId") REFERENCES "pipeline_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_logs" ADD CONSTRAINT "review_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_logs" ADD CONSTRAINT "review_logs_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_logs" ADD CONSTRAINT "review_logs_pipelineRunId_fkey" FOREIGN KEY ("pipelineRunId") REFERENCES "pipeline_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_logs" ADD CONSTRAINT "review_logs_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "pipeline_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CheckConstraints
-- Enum-like fields use VARCHAR + CHECK, not native Postgres ENUM — see SCHEMA.md
-- "Enum Strategy" section. TypeScript's const arrays in src/types/*.ts are the
-- single source of truth; this list must be kept in sync by hand.
ALTER TABLE "channels" ADD CONSTRAINT "channels_platform_check"
  CHECK ("platform" IN ('youtube'));

ALTER TABLE "channels" ADD CONSTRAINT "channels_priorsScope_check"
  CHECK ("priorsScope" IN ('isolated', 'shared'));

ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_status_check"
  CHECK ("status" IN ('pending', 'running', 'paused_gate1', 'paused_gate2', 'completed', 'failed', 'needs_attention'));

ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_stageName_check"
  CHECK ("stageName" IN ('intake', 'script_generation', 'script_review', 'gate1',
                          'video_generation', 'video_review', 'gate2', 'publishing', 'analytics'));

ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_status_check"
  CHECK ("status" IN ('pending', 'running', 'completed', 'failed', 'skipped'));

-- SeedData
-- Single MVP tenant row (Task 3 requirement). ON CONFLICT makes this migration
-- safe to re-run against a DB that already has it.
INSERT INTO "tenants" ("id", "name")
VALUES ('00000000-0000-0000-0000-000000000001', 'Neeraj — 7AI')
ON CONFLICT ("id") DO NOTHING;
