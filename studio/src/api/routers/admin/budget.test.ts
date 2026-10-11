import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../../models/prisma-client';
import { appRouter } from '../../router';
import { SANDBOX } from '../../../test-support/sandbox';
import { checkBudget, loadChannelBudgetView } from '../../../run-pipeline/budget-gate';
import { analyzeAllTenantBudgets } from '../../../models/repositories/admin.repository';

// Admin Sprint 1 (R6) - the F9 case (override equal to the pool, a second
// default-share channel at $0), gateSpentUsd agreeing with the gate itself, and
// last week's spend NOT being counted (proves `since` is passed).
describe.skipIf(!SANDBOX)('admin.budget.get (sandbox database)', () => {
  const tenantF9 = randomUUID();
  const tenantNoQuota = randomUUID();
  const chX = randomUUID();
  const chY = randomUUID();
  const chSample = randomUUID();
  const chLone = randomUUID();
  const ownerId = randomUUID();

  const ops = () => appRouter.createCaller({ tenantId: tenantF9, userId: null, role: 'owner', identityKind: 'ops-token' });
  const owner = () => appRouter.createCaller({ tenantId: tenantF9, userId: ownerId, role: 'owner', identityKind: 'session' });

  beforeAll(async () => {
    await prisma.tenant.createMany({
      data: [
        { id: tenantF9, name: 'F9 tenant' },
        { id: tenantNoQuota, name: 'No quota tenant' },
      ],
    });
    await prisma.user.create({ data: { id: ownerId, tenantId: tenantF9, email: `${ownerId}@fixture.test`, role: 'owner' } });
    await prisma.agentQuota.create({ data: { tenantId: tenantF9, platform: 'youtube', budgetCeilingUsd: 2 } });
    await prisma.channel.createMany({
      data: [
        { id: chX, tenantId: tenantF9, name: 'Notebook', nicheDescription: 'x', budgetOverrideUsd: 2 },
        { id: chY, tenantId: tenantF9, name: 'Underdogs', nicheDescription: 'x' },
        { id: chSample, tenantId: tenantF9, name: 'Sample (inactive)', nicheDescription: 'x', isActive: false },
        { id: chLone, tenantId: tenantNoQuota, name: 'Lone', nicheDescription: 'x' },
      ],
    });
    const lastWeek = new Date(Date.now() - 8 * 24 * 3600 * 1000);
    await prisma.usageEvent.createMany({
      data: [
        { tenantId: tenantF9, channelId: chX, agent: 'script-generation', provider: 'anthropic', model: 'm', costUsd: 1.2975 },
        { tenantId: tenantF9, channelId: chX, agent: 'old', provider: 'anthropic', model: 'm', costUsd: 5, createdAt: lastWeek },
      ],
    });
  });

  afterAll(async () => {
    const tenantIds = [tenantF9, tenantNoQuota];
    await prisma.usageEvent.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.channel.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.agentQuota.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  });

  it('reports the F9 case: override reserves the whole pool, the other channel at a $0 share', async () => {
    const b = await ops().admin.budget.get({ tenantId: tenantF9 });
    expect(b.windowKind).toBe('weekly');
    expect(b.poolCeilingUsd).toBe(2);
    expect(b.reservedByOverridesUsd).toBe(2);
    expect(b.remainingPoolUsd).toBe(0);
    const y = b.channels.find((c) => c.channelId === chY)!;
    expect(y.effectiveCeilingUsd).toBe(0);
    expect(y.status).toBe('zero_share');
    expect(b.channels.find((c) => c.channelId === chSample)!.status).toBe('inactive');
    const codes = b.warnings.map((w) => w.code);
    expect(codes).toEqual(expect.arrayContaining(['override_reserves_whole_pool', 'zero_share']));
  });

  it('gateSpentUsd is this week only (last week is not counted) and equals what the gate sees', async () => {
    const b = await ops().admin.budget.get({ tenantId: tenantF9 });
    expect(b.gateSpentUsd).toBeCloseTo(1.2975, 4);
    expect(b.spentThisWeekUsd).toBe(b.gateSpentUsd);
    // The gate: pool not exhausted (1.2975 < 2), X within its $2 ceiling, Y refused for a reserved share.
    expect(await checkBudget(tenantF9, chX, 'youtube')).toEqual({ ok: true });
    const refusalY = await checkBudget(tenantF9, chY, 'youtube');
    expect(refusalY).toMatchObject({ ok: false, scope: 'channel', shareReservedByOverrides: true });
    // ceilings agree with loadChannelBudgetView
    const view = await loadChannelBudgetView(tenantF9, 'youtube');
    for (const c of b.channels.filter((c) => c.isActive)) {
      expect(c.effectiveCeilingUsd).toBe(view.ceilings.get(c.channelId));
    }
  });

  it('no budget row: no_quota, no throw out of the procedure', async () => {
    const b = await ops().admin.budget.get({ tenantId: tenantNoQuota });
    expect(b.poolCeilingUsd).toBeNull();
    expect(b.warnings.map((w) => w.code)).toEqual(['no_quota']);
    expect(b.channels[0].effectiveCeilingUsd).toBeNull();
  });

  it('unknown tenant is NOT_FOUND; an owner session is FORBIDDEN', async () => {
    await expect(ops().admin.budget.get({ tenantId: randomUUID() })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(owner().admin.budget.get({ tenantId: tenantF9 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('the all-tenants bulk analysis matches the single-tenant analysis', async () => {
    const all = await analyzeAllTenantBudgets('youtube');
    const single = await ops().admin.budget.get({ tenantId: tenantF9 });
    const bulk = all.get(tenantF9)!;
    expect(bulk.gateSpentUsd).toBeCloseTo(single.gateSpentUsd, 6);
    expect(bulk.warnings.map((w) => w.code)).toEqual(single.warnings.map((w) => w.code));
    expect(bulk.channels.map((c) => [c.channelId, c.effectiveCeilingUsd, c.status])).toEqual(
      single.channels.map((c) => [c.channelId, c.effectiveCeilingUsd, c.status]),
    );
    expect(all.get(tenantNoQuota)!.warnings.map((w) => w.code)).toEqual(['no_quota']);
  });
});
