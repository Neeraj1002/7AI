-- AlterTable
ALTER TABLE "usage_events" ADD COLUMN     "audioDurationSeconds" DECIMAL(10,2),
ADD COLUMN     "characterCount" INTEGER,
ADD COLUMN     "metadata" JSONB,
ALTER COLUMN "inputTokens" DROP NOT NULL,
ALTER COLUMN "outputTokens" DROP NOT NULL;
