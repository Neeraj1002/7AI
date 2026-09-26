-- AlterTable
ALTER TABLE "channels" ADD COLUMN     "defaultPrivacyStatus" VARCHAR(20) NOT NULL DEFAULT 'private',
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CheckConstraint
-- VARCHAR + CHECK, not a native enum — this schema's own convention.
ALTER TABLE "channels" ADD CONSTRAINT "channels_defaultPrivacyStatus_check"
  CHECK ("defaultPrivacyStatus" IN ('private', 'unlisted', 'public'));
