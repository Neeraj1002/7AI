// Admin Sprint 1 (R1) — grants or revokes the platform-wide Admin flag
// (User.isPlatformAdmin). The only way the flag is ever set: never through the
// app. The change and its admin_audit_log row commit in one transaction.
//
// Usage:
//   npx tsx scripts/set-platform-admin.ts <email> [--revoke]
//
// Idempotent: granting an already-flagged user (or revoking an unflagged one)
// prints that and writes no audit row. Same style as scripts/invite-tenant.ts.

import { prisma } from '../src/models/prisma-client';
import { writeAdminAudit } from '../src/models/repositories/admin-audit.repository';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const revoke = args.includes('--revoke');
  const email = args.find((a) => !a.startsWith('--'));
  if (!email) {
    throw new Error('usage: set-platform-admin.ts <email> [--revoke]');
  }

  const outcome = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
    if (!user) {
      throw new Error(`no User with email ${email} - nothing changed`);
    }
    const target = !revoke;
    if (user.isPlatformAdmin === target) {
      return { changed: false as const, user };
    }
    await tx.user.update({ where: { id: user.id }, data: { isPlatformAdmin: target } });
    await writeAdminAudit(tx, {
      actor: { kind: 'script', userId: null },
      action: target ? 'platform_admin.grant' : 'platform_admin.revoke',
      targetType: 'user',
      targetId: user.id,
      tenantId: user.tenantId,
      before: { isPlatformAdmin: user.isPlatformAdmin },
      after: { isPlatformAdmin: target },
    });
    return { changed: true as const, user };
  });

  const state = revoke ? 'revoked' : 'granted';
  console.log(
    outcome.changed
      ? `[set-platform-admin] ${state} for ${outcome.user.email} (user ${outcome.user.id}); one admin_audit_log row written.`
      : `[set-platform-admin] ${outcome.user.email} is already ${revoke ? 'not an Admin' : 'an Admin'} - nothing changed, no audit row written.`,
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
