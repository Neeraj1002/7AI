import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../../models/prisma-client';
import { appRouter } from '../../router';
import { SANDBOX } from '../../../test-support/sandbox';
import { findForbiddenValues } from '../../../test-support/walk-keys';
import { currentBudgetWindowStart } from '../../../run-pipeline/budget-gate';

describe.skipIf(!SANDBOX)('admin.usage.* (sandbox database)', () => {
  const tenantId = randomUUID();
  const channelId = randomUUID();
  const runId = randomUUID();
  const marker = randomUUID().slice(0, 8);
  const ops = () => appRouter.createCaller({ tenantId, userId: null, role: 'owner', identityKind: 'ops-token' });
  const owner = () => appRouter.createCaller({ tenantId, userId: randomUUID(), role: 'owner', identityKind: 'session' });

  beforeAll(async () => {
    await prisma.tenant.create({ data: { id: tenantId, name: 'Usage test' } });
    await prisma.channel.create({ data: { id: channelId, tenantId, name: 'Usage channel', nicheDescription: 'x' } });
    await prisma.pipelineRun.create({ data: { id: runId, tenantId, channelId, briefText: 'x', status: 'completed' } });
    const thisWeek = currentBudgetWindowStart();
    const at = (daysAfterWeekStart: number) => new Date(thisWeek.getTime() + daysAfterWeekStart * 86_400_000 + 3_600_000);
    const lastWeek = (d: number) => new Date(thisWeek.getTime() - 7 * 86_400_000 + d * 86_400_000 + 3_600_000);
    const base = { tenantId, channelId };
    await prisma.usageEvent.createMany({
      data: [
        { ...base, pipelineRunId: runId, agent: `script-${marker}`, provider: 'anthropic', model: 'm1', costUsd: 0.25, createdAt: lastWeek(1) },
        { ...base, pipelineRunId: runId, agent: `script-${marker}`, provider: 'anthropic', model: 'm1', costUsd: 0.75, createdAt: lastWeek(2) },
        { ...base, pipelineRunId: runId, agent: `video-${marker}`, provider: 'openai', model: 'tts-1', costUsd: 1.5, createdAt: new Date(Math.min(Date.now(), at(0).getTime())) },
        { ...base, pipelineRunId: runId, agent: `img-${marker}`, provider: 'openai', model: 'gpt-image-1.5', costUsd: 0, metadata: { stillCount: 3, apiKeyHint: 'SECRET_VALUE_ONE' }, createdAt: lastWeek(3) },
        { ...base, agent: `unk-${marker}`, provider: 'unknown', model: 'unknown', costUsd: 0, metadata: { note: 'SECRET_VALUE_TWO' } },
      ],
    });
  });

  afterAll(async () => {
    await prisma.usageEvent.deleteMany({ where: { tenantId } });
    await prisma.pipelineRun.deleteMany({ where: { tenantId } });
    await prisma.channel.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
  });

  it('byAgent totals equal byWeek totals over the same window (weeks without events included as zeros)', async () => {
    const weeks = await ops().admin.usage.byWeek({ weeks: 4, tenantId });
    expect(weeks).toHaveLength(4);
    const agents = await ops().admin.usage.byAgent({ sinceDays: 60, tenantId });
    const weekTotal = weeks.reduce((s, w) => s + w.costUsd, 0);
    const agentTotal = agents.reduce((s, a) => s + a.costUsd, 0);
    expect(weekTotal).toBeCloseTo(2.5, 6);
    expect(agentTotal).toBeCloseTo(weekTotal, 6);
    expect(weeks.reduce((s, w) => s + w.events, 0)).toBe(agents.reduce((s, a) => s + a.calls, 0));
    expect(weeks.filter((w) => w.events === 0).length).toBeGreaterThanOrEqual(1);
    // oldest first, Monday 00:00 UTC
    for (let i = 1; i < weeks.length; i++) expect(weeks[i].weekStartUtc > weeks[i - 1].weekStartUtc).toBe(true);
    expect(weeks.every((w) => new Date(w.weekStartUtc).getUTCDay() === 1)).toBe(true);
    // sorted by cost descending
    for (let i = 1; i < agents.length; i++) expect(agents[i - 1].costUsd).toBeGreaterThanOrEqual(agents[i].costUsd);
  });

  it('byRun returns the run with its channel name, status, events and cost', async () => {
    const runs = await ops().admin.usage.byRun({ tenantId });
    expect(runs).toEqual([
      { pipelineRunId: runId, tenantId, channelName: 'Usage channel', status: 'completed', events: 4, costUsd: 2.5 },
    ]);
  });

  it('gaps finds the planted $0 groups with metadata key names and no values', async () => {
    const gaps = await ops().admin.usage.gaps({ sinceDays: 30 });
    const mine = gaps.filter((g) => g.agent.endsWith(marker));
    expect(mine.map((g) => [g.provider, g.model]).sort()).toEqual([
      ['openai', 'gpt-image-1.5'],
      ['unknown', 'unknown'],
    ]);
    expect(mine.find((g) => g.model === 'gpt-image-1.5')).toMatchObject({ events: 1, metadataKeys: ['apiKeyHint', 'stillCount'] });
    expect(findForbiddenValues(gaps, ['SECRET_VALUE_ONE', 'SECRET_VALUE_TWO'])).toEqual([]);
    expect(findForbiddenValues(await ops().admin.usage.byAgent({ tenantId }), ['SECRET_VALUE_ONE', 'SECRET_VALUE_TWO'])).toEqual([]);
  });

  it('an owner session is FORBIDDEN on every usage procedure', async () => {
    await expect(owner().admin.usage.byWeek({})).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(owner().admin.usage.byAgent({})).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(owner().admin.usage.byRun({})).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(owner().admin.usage.gaps({})).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
