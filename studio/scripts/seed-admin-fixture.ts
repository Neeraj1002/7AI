// Admin Sprint 1 (R8) - seeds the admin fixture into a SANDBOX database only (the rows themselves
// are defined in src/test-support/admin-fixture.ts). Reproduces the tricky cases found on preview on
// 2026-10-05: an override equal to the pool (F9), a pool already spent, $0 cost rows, an old YouTube
// credential, stale gates, an untriaged bug backlog and a run with three attempts. Every value is an
// obvious fake; no real token or credential appears anywhere.
//
// Usage (DATABASE_URL must name a database ending _sandbox or _test):
//   npx tsx scripts/seed-admin-fixture.ts
//
// Re-running is a CLEAN RE-SEED: every fixture row (found by its fixed ids) is deleted and recreated,
// so the database ends up identical either way. Rows that are not part of the fixture are left alone.
//
// It prints one session token per fixture user (signed with JWT_SECRET) for curl testing.

import { prisma } from '../src/models/prisma-client';
import { signSessionToken } from '../src/auth/jwt';
import { databaseName, isSandboxDatabase } from '../src/test-support/sandbox';
import { IDS, seedAdminFixture } from '../src/test-support/admin-fixture';

async function main(): Promise<void> {
  if (!isSandboxDatabase()) {
    throw new Error(
      `Refusing to seed: DATABASE_URL names database "${databaseName() || '(none)'}", which does not end in _sandbox or _test. ` +
        'This fixture only ever runs against a sandbox database (never sevenai_dev or sevenai_preview).',
    );
  }
  await seedAdminFixture();

  const users = [
    { label: 'FOUNDER (Admin + owner of tenant A)', id: IDS.founder, tenantId: IDS.tenantA },
    { label: 'OWNER_B (plain owner, tenant B)', id: IDS.ownerB, tenantId: IDS.tenantB },
    { label: 'OWNER_C (plain owner, tenant C)', id: IDS.ownerC, tenantId: IDS.tenantC },
  ];
  console.log(`[seed-admin-fixture] seeded database "${databaseName()}" (clean re-seed of the fixture rows).`);
  console.log('[seed-admin-fixture] tenants: A', IDS.tenantA, ' B', IDS.tenantB, ' C', IDS.tenantC);
  console.log('[seed-admin-fixture] multi-attempt run:', IDS.runMulti);
  for (const u of users) {
    console.log(`${u.label}: ${signSessionToken({ userId: u.id, tenantId: u.tenantId, role: 'owner' })}`);
  }
  console.log('[seed-admin-fixture] ops token: use API_AUTH_TOKEN from your sandbox env (not printed).');
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
