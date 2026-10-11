-- AlterTable
ALTER TABLE "review_logs" ADD COLUMN     "approvedByUserId" UUID;

-- AddForeignKey
ALTER TABLE "review_logs" ADD CONSTRAINT "review_logs_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
