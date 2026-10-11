import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { appRouter } from '../../router';
import { SANDBOX } from '../../../test-support/sandbox';

describe.skipIf(!SANDBOX)('admin.system.info authorization (sandbox database)', () => {
  it('works for the ops token and is FORBIDDEN for an owner session', async () => {
    const ops = appRouter.createCaller({ tenantId: randomUUID(), userId: null, role: 'owner', identityKind: 'ops-token' });
    const info = await ops.admin.system.info();
    expect(Object.values(info.flags).every((v) => typeof v === 'boolean')).toBe(true);
    const owner = appRouter.createCaller({ tenantId: randomUUID(), userId: randomUUID(), role: 'owner', identityKind: 'session' });
    await expect(owner.admin.system.info()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
