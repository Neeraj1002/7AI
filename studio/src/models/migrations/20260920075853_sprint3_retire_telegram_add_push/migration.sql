-- AlterTable
ALTER TABLE "users" ADD COLUMN "expoPushToken" VARCHAR(255);

-- DropForeignKey
ALTER TABLE "telegram_link_codes" DROP CONSTRAINT "telegram_link_codes_userId_fkey";

-- DropTable
DROP TABLE "telegram_link_codes";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "telegramChatId";
