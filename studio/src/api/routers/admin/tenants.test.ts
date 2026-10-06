import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../../models/prisma-client';
import { appRouter } from '../../router';
import { SANDBOX } from '../../../test-support/sandbox';
import { findForbiddenKeys, findForbiddenValues } from '../../../test-support/walk-keys';

const FORBIDDEN_KEYS = ['refreshTokenEncrypted', 'briefText', 'intakeParsed', 'expoPushToken', 'telegramChatId', 'input', 'output'];
const SECRET_VALUES = ['fixture-not-a-token', 'SECRET BRIEF TEXT', 'ExponentPushToken[fixture]', 'chat-12345'];

describe.skipIf(!SANDBOX)('admin.tenants.* (sandbox database)', () => {
  const tenantId = randomUUID();
  const emptyTenantId = randomUUID();
  const ownerId = randomUUID();
  const chA = randomUUID();
  const chB = randomUUID();
  const runId = randomUUID();
  const ops = () => appRouter.createCaller({ tenantId, userId: null, role: 'owner', identityKind: 'ops-token' });
  const owner = () => appRouter.createCaller({ tenantId, userId: ownerId, role: 'owner', identityKind: 'session' });

  beforeAll(async () => {
    await prisma.tenant.createMany({
      data: [
        { id: tenantId, name: 'Tenants test A' },
        { id: emptyTenantId, name: 'Tenants test empty' },
      ],
    });
    await prisma.user.create({
      data: {
        id: ownerId,
        tenantId,
        email: `${ownerId}@fixture.test`,
        role: 'owner',
        expoPushToken: 'ExponentPushToken[fixture]',
        telegramChatId: 'chat-12345',
      },
    });
    await prisma.agentQuota.create({ data: { tenantId, platform: 'youtube', budgetCeilingUsd: 20 } });
    await prisma.channel.createMany({
      data: [
        { id: chA, tenantId, name: 'A', nicheDescription: 'x', ownerUserId: ownerId },
        { id: chB, tenantId, name: 'B', nicheDescription: 'x', isActive: false },
      ],
    });
    await prisma.agentCredential.create({
      data: { channelId: chA, platform: 'youtube', refreshTokenEncrypted: 'fixture-not-a-token', updatedAt: new Date(Date.now() - 8 * 86_400_000) },
    });
    await prisma.pipelineRun.create({
      data: {
        id: runId,
        tenantId,
        channelId: chA,
        briefText: 'SECRET BRIEF TEXT',
        intakeParsed: { topic: 'SECRET BRIEF TEXT' },
        status: 'failed',
        lastError: 'e'.repeat(800),
      },
    });
    await prisma.pipelineStage.create({
      data: { pipelineRunId: runId, stageName: 'intake', status: 'completed', input: { b: 'SECRET BRIEF TEXT' }, output: { b: 'SECRET BRIEF TEXT' } },
    });
    await prisma.usageEvent.create({ data: { tenantId, channelId: chA, pipelineRunId: runId, agent: 'x', provider: 'anthropic', model: 'm', costUsd: 0.5 } });
  });

  afterAll(async () => {
    await prisma.usageEvent.deleteMany({ where: { tenantId } });
    await prisma.pipelineStage.deleteMany({ where: { pipelineRunId: runId } });
    await prisma.pipelineRun.deleteMany({ where: { tenantId } });
    await prisma.agentCredential.deleteMany({ where: { channelId: chA } });
    await prisma.channel.deleteMany({ where: { tenantId } });
    await prisma.agentQuota.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, emptyTenantId] } } });
  });

  it('lists tenants with owners, counts, spend and the pool, sorted by weekly spend', async () => {
    const list = await ops().admin.tenants.list();
    const a = list.find((t) => t.id === tenantId)!;
    expect(a).toMatchObject({
      name: 'Tenants test A',
      ownerEmails: [`${ownerId}@fixture.test`],
      userCount: 1,
      activeChannelCount: 1,
      runsThisWeek: 1,
      spendThisWeekUsd: 0.5,
      spendAllTimeUsd: 0.5,
      poolCeilingUsd: 20,
    });
    expect(a.lastRunAt).not.toBeNull();
    const empty = list.find((t) => t.id === emptyTenantId)!;
    expect(empty).toMatchObject({ userCount: 0, activeChannelCount: 0, poolCeilingUsd: null, lastRunAt: null, ownerEmails: [] });
    for (let i = 1; i < list.length; i++) expect(list[i - 1].spendThisWeekUsd).toBeGreaterThanOrEqual(list[i].spendThisWeekUsd);
    expect(findForbiddenKeys(list, FORBIDDEN_KEYS)).toEqual([]);
    expect(findForbiddenValues(list, SECRET_VALUES)).toEqual([]);
  });

  it('get returns structure only: no secret keys, no tenant content, truncated errors, credential age', async () => {
    const t = await ops().admin.tenants.get({ tenantId });
    expect(findForbiddenKeys(t, FORBIDDEN_KEYS)).toEqual([]);
    expect(findForbiddenValues(t, SECRET_VALUES)).toEqual([]);
    expect(t.users[0]).toMatchObject({ email: `${ownerId}@fixture.test`, role: 'owner', isPlatformAdmin: false });
    const a = t.channels.find((c) => c.id === chA)!;
    expect(a).toMatchObject({ hasYoutubeCredential: true, credentialAgeDays: 8, spentAllTimeUsd: 0.5, runsByStatus: { failed: 1 } });
    expect(t.channels.find((c) => c.id === chB)).toMatchObject({ hasYoutubeCredential: false, credentialAgeDays: null, isActive: false });
    expect(t.recentRuns).toHaveLength(1);
    expect(t.recentRuns[0].costUsd).toBe(0.5);
    expect(t.recentRuns[0].lastError!.length).toBeLessThanOrEqual(503);
  });

  it('a tenant with no channels or quota returns empty arrays, not an error', async () => {
    const t = await ops().admin.tenants.get({ tenantId: emptyTenantId });
    expect(t.channels).toEqual([]);
    expect(t.recentRuns).toEqual([]);
    expect(t.users).toEqual([]);
  });

  it('unknown tenant is NOT_FOUND; an owner session is FORBIDDEN', async () => {
    await expect(ops().admin.tenants.get({ tenantId: randomUUID() })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(owner().admin.tenants.list()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(owner().admin.tenants.get({ tenantId })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
