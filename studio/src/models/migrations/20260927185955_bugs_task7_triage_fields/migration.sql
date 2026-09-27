-- AlterTable
ALTER TABLE "bug_reports" ADD COLUMN     "area" VARCHAR(20),
ADD COLUMN     "priority" VARCHAR(20),
ADD COLUMN     "reportType" VARCHAR(20) NOT NULL DEFAULT 'bug';
