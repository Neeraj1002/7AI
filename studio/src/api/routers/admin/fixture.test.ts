import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '../../../models/prisma-client';
import { appRouter } from '../../router';
import { SANDBOX } from '../../../test-support/sandbox';
import { IDS, seedAdminFixture } from '../../../test-support/admin-fixture';
import { findForbiddenKeys, findForbiddenValues } from '../../../test-support/walk-keys';

// Admin Sprint 1 (R8) - the whole admin API against the seeded fixture: the tricky preview cases
// come out right, the Admin gate holds for every procedure, and no admin response (other than the
// audited admin.runs.content) carries a secret or tenant content.
describe.skipIf(!SANDBOX)('admin API against the seeded fixture (sandbox database)', () => {
  const ops = () => appRouter.createCaller({ tenantId: IDS.tenantA, userId: null, role: 'owner', identityKind: 'ops-token' });
  const founder = () => appRouter.createCaller({ tenantId: IDS.tenantA, userId: IDS.founder, role: 'owner', identityKind: 'session' });
  const ownerB = () => appRouter.createCaller({ tenantId: IDS.tenantB, userId: IDS.ownerB, role: 'owner', identityKind: 'session' });

  beforeAll(async () => {
    await seedAdminFixture();
  });

  it('whoami: true for the flagged founder and the ops token, false for a plain owner', async () => {
    expect(await founder().admin.whoami()).toEqual({ platformAdmin: true, userId: IDS.founder });
    expect(await ops().admin.whoami()).toEqual({ platformAdmin: true, userId: null });
    expect(await ownerB().admin.whoami()).toEqual({ platformAdmin: false, userId: IDS.ownerB });
  });

  it('every admin procedure except whoami is FORBIDDEN for a plain owner session', async () => {
    const o = ownerB();
    const attempts: Promise<unknown>[] = [
      o.admin.overview(),
      o.admin.tenants.list(),
      o.admin.tenants.get({ tenantId: IDS.tenantA }),
      o.admin.budget.get({ tenantId: IDS.tenantA }),
      o.admin.usage.byWeek({}),
      o.admin.usage.byAgent({}),
      o.admin.usage.byRun({}),
      o.admin.usage.gaps({}),
      o.admin.bugs.list({}),
      o.admin.bugs.options(),
      o.admin.bugs.updateTriage({ id: IDS.chX, area: 'BE' }),
      o.admin.audit.list({}),
      o.admin.runs.get({ runId: IDS.runMulti }),
      o.admin.runs.content({ runId: IDS.runMulti, kind: 'brief' }),
      o.admin.system.info(),
      o.bugs.list({}),
      o.bugs.updateTriage({ id: IDS.chX, area: 'BE' }),
    ];
    for (const a of attempts) await expect(a).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('the decision queue contains exactly the planted problems and nothing for the healthy tenant', async () => {
    const o = await founder().admin.overview();
    const mine = o.decisionQueue.filter((i) => i.tenantId !== null && [IDS.tenantA, IDS.tenantB, IDS.tenantC].includes(i.tenantId));
    expect(mine.map((i) => [i.kind, i.tenantId]).sort()).toEqual(
      [
        ['budget_pool_exhausted', IDS.tenantC],
        ['budget_zero_share', IDS.tenantA],
        ['gate_pending_stale', IDS.tenantA],
        ['run_needs_attention_stale', IDS.tenantA],
        ['youtube_connection_old', IDS.tenantA],
      ].sort(),
    );
    expect(mine.find((i) => i.kind === 'budget_zero_share')?.channelId).toBe(IDS.chY);
    expect(mine.find((i) => i.kind === 'run_needs_attention_stale')?.runId).toBe(IDS.runNeedsAttention);
    expect(mine.find((i) => i.kind === 'gate_pending_stale')?.runId).toBe(IDS.runGate2);
    expect(o.decisionQueue.some((i) => i.tenantId === IDS.tenantB)).toBe(false);
    expect(o.decisionQueue.map((i) => i.kind)).toEqual(expect.arrayContaining(['bug_untriaged', 'cost_gap']));
  });

  it('F9: admin.budget.get shows the override reserving the whole pool and Underdogs at a $0 share', async () => {
    const b = await founder().admin.budget.get({ tenantId: IDS.tenantA });
    expect(b.poolCeilingUsd).toBe(2);
    expect(b.channels.find((c) => c.channelId === IDS.chY)).toMatchObject({ effectiveCeilingUsd: 0, status: 'zero_share' });
    expect(b.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(['override_reserves_whole_pool', 'zero_share']));
    // last week's $5 row is not counted: 0.4 + 0.8975 this week
    expect(b.gateSpentUsd).toBeCloseTo(1.2975, 4);
    const c = await founder().admin.budget.get({ tenantId: IDS.tenantC });
    expect(c.warnings.map((w) => w.code)).toContain('pool_exhausted');
  });

  it('tenants list: three fixture tenants with the right owners, counts and spend', async () => {
    const list = await ops().admin.tenants.list();
    const byId = new Map(list.map((t) => [t.id, t]));
    expect(byId.get(IDS.tenantA)).toMatchObject({ ownerEmails: ['founder@fixture.test'], userCount: 1, activeChannelCount: 2, poolCeilingUsd: 2 });
    expect(byId.get(IDS.tenantB)).toMatchObject({ ownerEmails: ['owner-b@fixture.test'], activeChannelCount: 1, poolCeilingUsd: 20, warningCount: 0 });
    expect(byId.get(IDS.tenantC)).toMatchObject({ ownerEmails: ['owner-c@fixture.test'], spendThisWeekUsd: 2.5 });
    expect(byId.get(IDS.tenantA)!.spendThisWeekUsd).toBeCloseTo(1.2975, 4);
    expect(byId.get(IDS.tenantA)!.spendAllTimeUsd).toBeCloseTo(6.2975, 4);
  });

  it('bugs: 4 untriaged, the awaiting_verification one carries its note, and one links to the multi-attempt run', async () => {
    const all = (await ops().admin.bugs.list({})).filter((b) => b.id.startsWith('f0000001-'));
    expect(all).toHaveLength(8);
    expect(all.filter((b) => b.area === null)).toHaveLength(4);
    const awaiting = all.find((b) => b.status === 'awaiting_verification')!;
    expect(awaiting.triageNote).toContain('PR 99');
    const linked = all.find((b) => b.runId === IDS.runMulti)!;
    expect(linked.run).toMatchObject({ id: IDS.runMulti, status: 'paused_gate2', tenantId: IDS.tenantA });
    const shortPrefix = all.find((b) => b.screenContext === '/run/3f2b8c1e')!;
    expect(shortPrefix.runId).toBeNull();
  });

  it('usage gaps finds the planted $0 groups', async () => {
    const gaps = await ops().admin.usage.gaps({ sinceDays: 30 });
    expect(gaps.map((g) => `${g.provider}/${g.model}`)).toEqual(expect.arrayContaining(['openai/gpt-image-1.5', 'unknown/unknown']));
    expect(gaps.find((g) => g.model === 'gpt-image-1.5')?.metadataKeys).toEqual(['promptCount', 'stillCount']);
  });

  it('no secret or tenant content appears in any admin response except the audited content call', async () => {
    const o = ops();
    const responses = [
      await o.admin.overview(),
      await o.admin.tenants.list(),
      await o.admin.tenants.get({ tenantId: IDS.tenantA }),
      await o.admin.tenants.get({ tenantId: IDS.tenantB }),
      await o.admin.budget.get({ tenantId: IDS.tenantA }),
      await o.admin.usage.byWeek({}),
      await o.admin.usage.byAgent({}),
      await o.admin.usage.byRun({}),
      await o.admin.usage.gaps({}),
      await o.admin.bugs.options(),
      await o.admin.audit.list({}),
      await o.admin.runs.get({ runId: IDS.runMulti }),
      await o.admin.runs.get({ runId: IDS.runOld }),
      await o.admin.system.info(),
    ];
    const forbiddenKeys = ['refreshTokenEncrypted', 'briefText', 'intakeParsed', 'expoPushToken', 'telegramChatId', 'input', 'output', 'rationale'];
    const forbiddenValues = ['fixture-not-a-token', 'Fixture brief for', 'Fixture script text', 'fixture plan', 'Fixture rationale'];
    for (const r of responses) {
      expect(findForbiddenKeys(r, forbiddenKeys)).toEqual([]);
      expect(findForbiddenValues(r, forbiddenValues)).toEqual([]);
    }
  });

  it('the multi-attempt run shows its skipped attempt and quality metrics, and the $0 rows', async () => {
    const r = await ops().admin.runs.get({ runId: IDS.runMulti });
    expect(r.bundle.attempts).toEqual([1, 3]);
    expect(r.stages.find((s) => s.stageName === 'video_generation' && s.attemptNumber === 2)?.reason).toContain('Account spend limit');
    expect(r.stages.find((s) => s.stageName === 'video_review')?.qualityMetrics).toMatchObject({ integratedLufs: -14.1, hasAudio: true });
    // gpt-image-1.5 and the free pexels row belong to this run (the unknown/unknown row has no run)
    expect(r.totals.zeroCostEvents).toBe(2);
    const old = await ops().admin.runs.get({ runId: IDS.runOld });
    expect(old.stages).toEqual([]);
    expect(old.totals.events).toBe(0);
  });

  it('seeding twice leaves the same rows (clean re-seed)', async () => {
    const count = () => prisma.pipelineRun.count({ where: { tenantId: { in: [IDS.tenantA, IDS.tenantB, IDS.tenantC] } } });
    const before = await count();
    await seedAdminFixture();
    expect(await count()).toBe(before);
    expect(before).toBe(9);
  });
});
