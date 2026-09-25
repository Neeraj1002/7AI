-- AlterTable
ALTER TABLE "channels" ADD COLUMN     "ownerUserId" UUID;

-- CreateIndex
CREATE INDEX "idx_channels_owner" ON "channels"("ownerUserId");

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill
-- Sprint 3 Task 2 (K1) — every existing Channel row gets its tenant's
-- seeded 'owner' user (earliest-created if a tenant somehow has more than
-- one, deterministic via createdAt ASC). No real, currently-working channel
-- is left with a null owner it didn't have to have. A tenant with no
-- 'owner'-role user at all (shouldn't happen — Task 1's own migration seeds
-- one per tenant) leaves that tenant's channels null, correctly degrading
-- to "any owner-role user on the tenant may resolve it" per this task's own
-- fail-closed design, not an error.
UPDATE "channels" c
SET "ownerUserId" = (
  SELECT u.id FROM "users" u
  WHERE u."tenantId" = c."tenantId" AND u.role = 'owner'
  ORDER BY u."createdAt" ASC
  LIMIT 1
)
WHERE c."ownerUserId" IS NULL;
