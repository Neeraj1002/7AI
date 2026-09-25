-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "channelId" UUID,
    "userId" UUID NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "message" TEXT NOT NULL,
    "threadKey" VARCHAR(255),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_link_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(20) NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_link_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_notifications_user_time" ON "notifications"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "idx_notifications_thread" ON "notifications"("threadKey");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_link_codes_code_key" ON "telegram_link_codes"("code");

-- CreateIndex
CREATE INDEX "idx_telegram_link_codes_user" ON "telegram_link_codes"("userId");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_link_codes" ADD CONSTRAINT "telegram_link_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CheckConstraint
-- VARCHAR + CHECK, not a native enum — this schema's own convention.
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_kind_check"
  CHECK ("kind" IN ('notify', 'approval_request'));

-- DataMigration
-- Sprint 3 Task 3 (K2) — the one real regression risk this task carries:
-- the founder's own seeded User row gets its real, already-working
-- Telegram chat id carried over directly, so their existing flow doesn't
-- silently lose Telegram delivery the moment this task's dual-channel
-- routing goes live. Sourced from this environment's real
-- TELEGRAM_FOUNDER_CHAT_ID at migration-authoring time (not templated —
-- see sprint3/reports/task3.md for why a literal value here is correct,
-- not a shortcut).
UPDATE "users" SET "telegramChatId" = '8641987627'
WHERE "id" = '00000000-0000-0000-0000-0000000000f1' AND "telegramChatId" IS NULL;
