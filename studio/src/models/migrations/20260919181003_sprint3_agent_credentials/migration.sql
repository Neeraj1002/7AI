-- CreateTable
CREATE TABLE "agent_credentials" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "channelId" UUID NOT NULL,
    "platform" VARCHAR(20) NOT NULL,
    "refreshTokenEncrypted" TEXT NOT NULL,
    "encryptionKeyVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_credentials_channelId_key" ON "agent_credentials"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "agent_credentials_channelId_platform_key" ON "agent_credentials"("channelId", "platform");

-- AddForeignKey
ALTER TABLE "agent_credentials" ADD CONSTRAINT "agent_credentials_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CheckConstraint
-- Matches channels_platform_check exactly (foundation_schema migration) —
-- VARCHAR + CHECK, this schema's own convention.
ALTER TABLE "agent_credentials" ADD CONSTRAINT "agent_credentials_platform_check"
  CHECK ("platform" IN ('youtube'));
