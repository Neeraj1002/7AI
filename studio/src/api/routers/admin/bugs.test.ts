import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../../models/prisma-client';
import { appRouter } from '../../router';
import { SANDBOX } from '../../../test-support/sandbox';

// Admin Sprint 1 (R3) - against the sandbox database through the real router.
describe.skipIf(!SANDBOX)('bug triage access, audit, note and run link (sandbox database)', () => {
  const tenantId = randomUUID();
  const channelId = randomUUID();
  const ownerId = randomUUID();
  const runId = randomUUID();
  const reportWithRun = randomUUID();
  const reportPlain = randomUUID();

  const owner = () => appRouter.createCaller({ tenantId, userId: ownerId, role: 'owner', identityKind: 'session' });
  const ops = () => appRouter.createCaller({ tenantId, userId: null, role: 'owner', identityKind: 'ops-token' });

  beforeAll(async () => {
    await prisma.tenant.create({ data: { id: tenantId, name: 'Bug test tenant' } });
    await prisma.user.create({ data: { id: ownerId, tenantId, email: `${ownerId}@fixture.test`, role: 'owner' } });
    await prisma.channel.create({ data: { id: channelId, tenantId, name: 'Bug test channel', nicheDescription: 'x' } });
    await prisma.pipelineRun.create({ data: { id: runId, tenantId, channelId, briefText: 'fixture brief', status: 'failed' } });
    await prisma.bugReport.createMany({
      data: [
        { id: reportWithRun, description: 'with run', screenContext: `/run/${runId}?x=1`, priority: 'blocker' },
        { id: reportPlain, description: 'plain', screenContext: '/channels' },
      ],
    });
  });

  afterAll(async () => {
    await prisma.adminAuditLog.deleteMany({ where: { targetId: { in: [reportWithRun, reportPlain] } } });
    await prisma.bugReport.deleteMany({ where: { id: { in: [reportWithRun, reportPlain] } } });
    await prisma.pipelineRun.delete({ where: { id: runId } });
    await prisma.channel.delete({ where: { id: channelId } });
    await prisma.user.delete({ where: { id: ownerId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
  });

  it('a tenant owner session is FORBIDDEN on bugs.list, bugs.updateTriage, admin.bugs.*', async () => {
    await expect(owner().bugs.list({})).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(owner().bugs.updateTriage({ id: reportPlain, area: 'BE' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(owner().admin.bugs.list({})).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(owner().admin.bugs.options()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(owner().admin.bugs.updateTriage({ id: reportPlain, area: 'BE' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('the ops token still lists everything through both routers', async () => {
    const legacy = await ops().bugs.list({});
    expect(legacy.map((r) => r.id)).toEqual(expect.arrayContaining([reportWithRun, reportPlain]));
    const admin = await ops().admin.bugs.list({});
    expect(admin.map((r) => r.id)).toEqual(expect.arrayContaining([reportWithRun, reportPlain]));
  });

  it('options include the new status and enums come from the repository constants', async () => {
    const o = await ops().admin.bugs.options();
    expect(o.statuses).toContain('awaiting_verification');
    expect(o.areas).toEqual(['BE', 'FE', 'APP']);
  });

  it('links a report to its run with one summary lookup; a plain report has none', async () => {
    const list = await ops().admin.bugs.list({});
    const linked = list.find((r) => r.id === reportWithRun)!;
    expect(linked.runId).toBe(runId);
    expect(linked.run).toEqual({ id: runId, status: 'failed', tenantId, tenantName: 'Bug test tenant' });
    const plain = list.find((r) => r.id === reportPlain)!;
    expect(plain.runId).toBeNull();
    expect(plain.run).toBeNull();
  });

  it('triage writes exactly one audit row whose before/after match; awaiting_verification + note persist', async () => {
    const res = await ops().admin.bugs.updateTriage({ id: reportPlain, status: 'awaiting_verification', area: 'BE', note: '  PR 123 merged  ' });
    expect(res.status).toBe('awaiting_verification');
    expect(res.triageNote).toBe('PR 123 merged');

    const rows = await prisma.adminAuditLog.findMany({ where: { targetId: reportPlain } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorKind: 'ops-token',
      action: 'bug.triage',
      targetType: 'bug_report',
      before: { status: 'open', area: null, priority: null, note: null },
      after: { status: 'awaiting_verification', area: 'BE', priority: null, note: 'PR 123 merged' },
    });

    const viaAdmin = (await ops().admin.bugs.list({ status: 'awaiting_verification' })).find((r) => r.id === reportPlain);
    expect(viaAdmin?.triageNote).toBe('PR 123 merged');
    const viaLegacy = (await ops().bugs.list({ status: 'awaiting_verification' })).find((r) => r.id === reportPlain);
    expect(viaLegacy?.triageNote).toBe('PR 123 merged');
  });

  it('an empty note clears it, and the legacy bugs.updateTriage accepts note and the new status (audited)', async () => {
    await ops().bugs.updateTriage({ id: reportPlain, note: '' });
    const after = (await ops().admin.bugs.list({})).find((r) => r.id === reportPlain);
    expect(after?.triageNote).toBeNull();
    await ops().bugs.updateTriage({ id: reportPlain, status: 'fixed', note: 'verified' });
    const rows = await prisma.adminAuditLog.count({ where: { targetId: reportPlain } });
    expect(rows).toBe(3);
  });

  it('rejects a 501-character note and writes nothing', async () => {
    const before = await prisma.adminAuditLog.count({ where: { targetId: reportPlain } });
    await expect(ops().admin.bugs.updateTriage({ id: reportPlain, note: 'x'.repeat(501) })).rejects.toThrow();
    await expect(ops().bugs.updateTriage({ id: reportPlain, note: 'x'.repeat(501) })).rejects.toThrow();
    expect(await prisma.adminAuditLog.count({ where: { targetId: reportPlain } })).toBe(before);
    expect((await ops().admin.bugs.updateTriage({ id: reportPlain, note: 'x'.repeat(500) })).triageNote).toHaveLength(500);
  });

  it('an unknown id is NOT_FOUND and writes no audit row (nothing committed)', async () => {
    const unknown = randomUUID();
    await expect(ops().admin.bugs.updateTriage({ id: unknown, area: 'FE' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await prisma.adminAuditLog.count({ where: { targetId: unknown } })).toBe(0);
  });
});
