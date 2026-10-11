-- AlterTable
ALTER TABLE "channels" ADD COLUMN     "activeProfileVersionId" UUID;

-- AlterTable
ALTER TABLE "pipeline_runs" ADD COLUMN     "profileVersionId" UUID;

-- CreateTable
CREATE TABLE "channel_profile_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "channelId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_profile_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_channel_profile_versions_channel" ON "channel_profile_versions"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "channel_profile_versions_channelId_version_key" ON "channel_profile_versions"("channelId", "version");

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_activeProfileVersionId_fkey" FOREIGN KEY ("activeProfileVersionId") REFERENCES "channel_profile_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_profileVersionId_fkey" FOREIGN KEY ("profileVersionId") REFERENCES "channel_profile_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_profile_versions" ADD CONSTRAINT "channel_profile_versions_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_profile_versions" ADD CONSTRAINT "channel_profile_versions_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
