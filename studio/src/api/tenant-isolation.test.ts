import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../models/prisma-client';
import { appRouter } from './router';
import { SANDBOX } from '../test-support/sandbox';

// Admin Sprint 1 regression guard (success criterion 5): the existing tenant-scoped routers
// still return only the caller's tenant's data, whatever the admin module added around them.
describe.skipIf(!SANDBOX)('existing tenant routers stay tenant-scoped (sandbox database)', () => {
  const t1 = randomUUID();
  const t2 = randomUUID();
  const c1 = randomUUID();
  const c2 = randomUUID();
  const u1 = randomUUID();
  const u2 = randomUUID();
  const r1 = randomUUID();
  const r2 = randomUUID();
  const as = (tenantId: string, userId: string) =>
    appRouter.createCaller({ tenantId, userId, role: 'owner', identityKind: 'session' });

  beforeAll(async () => {
    await prisma.tenant.createMany({ data: [{ id: t1, name: 'Isolation 1' }, { id: t2, name: 'Isolation 2' }] });
    await prisma.user.createMany({
      data: [
        { id: u1, tenantId: t1, email: `${u1}@fixture.test`, role: 'owner' },
        // the second tenant's owner is a platform admin: that must not widen their tenant routers either
        { id: u2, tenantId: t2, email: `${u2}@fixture.test`, role: 'owner', isPlatformAdmin: true },
      ],
    });
    await prisma.channel.createMany({
      data: [
        { id: c1, tenantId: t1, name: 'Iso channel 1', nicheDescription: 'x' },
        { id: c2, tenantId: t2, name: 'Iso channel 2', nicheDescription: 'x' },
      ],
    });
    await prisma.pipelineRun.createMany({
      data: [
        { id: r1, tenantId: t1, channelId: c1, briefText: 'tenant one brief', status: 'needs_attention', lastError: 'e1' },
        { id: r2, tenantId: t2, channelId: c2, briefText: 'tenant two brief', status: 'needs_attention', lastError: 'e2' },
      ],
    });
  });

  afterAll(async () => {
    await prisma.pipelineRun.deleteMany({ where: { tenantId: { in: [t1, t2] } } });
    await prisma.channel.deleteMany({ where: { tenantId: { in: [t1, t2] } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: [t1, t2] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [t1, t2] } } });
  });

  it('runs.list returns only the caller tenant runs, for both a plain owner and a platform admin', async () => {
    const one = await as(t1, u1).runs.list({});
    expect(one.map((r) => r.id)).toEqual([r1]);
    const two = await as(t2, u2).runs.list({});
    expect(two.map((r) => r.id)).toEqual([r2]);
  });

  it('dashboard.operational counts only the caller tenant', async () => {
    const one = await as(t1, u1).dashboard.operational({});
    expect(one.needsAttention.map((r) => r.id)).toEqual([r1]);
    const two = await as(t2, u2).dashboard.operational({});
    expect(two.needsAttention.map((r) => r.id)).toEqual([r2]);
  });

  it('a tenant owner cannot open another tenant run through runs.get', async () => {
    await expect(as(t1, u1).runs.get({ id: r2 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
