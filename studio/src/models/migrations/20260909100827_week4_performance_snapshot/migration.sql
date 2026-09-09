-- CreateTable
CREATE TABLE "performance_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "channelId" UUID NOT NULL,
    "pipelineRunId" UUID NOT NULL,
    "youtubeVideoId" VARCHAR(255) NOT NULL,
    "views" BIGINT NOT NULL DEFAULT 0,
    "likes" BIGINT NOT NULL DEFAULT 0,
    "comments" BIGINT NOT NULL DEFAULT 0,
    "watchTimeMinutes" DECIMAL(10,2),
    "retentionPct" DECIMAL(5,2),
    "snapshotAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performance_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_snapshots_video_time" ON "performance_snapshots"("youtubeVideoId", "snapshotAt");

-- CreateIndex
CREATE INDEX "idx_snapshots_run" ON "performance_snapshots"("pipelineRunId");

-- AddForeignKey
ALTER TABLE "performance_snapshots" ADD CONSTRAINT "performance_snapshots_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_snapshots" ADD CONSTRAINT "performance_snapshots_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_snapshots" ADD CONSTRAINT "performance_snapshots_pipelineRunId_fkey" FOREIGN KEY ("pipelineRunId") REFERENCES "pipeline_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
