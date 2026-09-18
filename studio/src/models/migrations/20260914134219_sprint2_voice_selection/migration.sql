-- AlterTable
ALTER TABLE "channels" ADD COLUMN     "defaultVoice" VARCHAR(50);

-- AlterTable
ALTER TABLE "pipeline_runs" ADD COLUMN     "creationOptions" JSONB;
