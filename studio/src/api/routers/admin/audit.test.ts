import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../../models/prisma-client';
import { appRouter } from '../../router';
import { SANDBOX } from '../../../test-support/sandbox';

// Admin Sprint 1 (R1/R2) - an owner session (flagged or not) against admin.*
// procedures, through the real router and the real database.
describe.skipIf(!SANDBOX)('admin.audit.list authorization (sandbox database)', () => {
  const tenantId = randomUUID();
  const ownerId = randomUUID();
  const adminId = randomUUID();
  const goneId = randomUUID();

  const session = (userId: string) =>
    appRouter.createCaller({ tenantId, userId, role: 'owner', identityKind: 'session' });

  it('is FORBIDDEN for an owner, a deleted user, and succeeds for a flagged admin and the ops token', async () => {
    await prisma.tenant.create({ data: { id: tenantId, name: 'Audit auth test tenant' } });
    await prisma.user.createMany({
      data: [
        { id: ownerId, tenantId, email: `${ownerId}@fixture.test`, role: 'owner' },
        { id: adminId, tenantId, email: `${adminId}@fixture.test`, role: 'owner', isPlatformAdmin: true },
      ],
    });
    try {
      await expect(session(ownerId).admin.audit.list({})).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(session(goneId).admin.audit.list({})).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(session(adminId).admin.audit.list({ limit: 1 })).resolves.toHaveProperty('items');
      const ops = appRouter.createCaller({ tenantId, userId: null, role: 'owner', identityKind: 'ops-token' });
      await expect(ops.admin.audit.list({ limit: 1 })).resolves.toHaveProperty('items');

      // revoke between two calls: the very next call is FORBIDDEN
      await prisma.user.update({ where: { id: adminId }, data: { isPlatformAdmin: false } });
      await expect(session(adminId).admin.audit.list({ limit: 1 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    } finally {
      await prisma.user.deleteMany({ where: { tenantId } });
      await prisma.tenant.delete({ where: { id: tenantId } });
    }
  });
});
