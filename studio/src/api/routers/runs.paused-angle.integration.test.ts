import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

// Sprint 6 Task 3 (Part A), database-backed: the choice, the pause, the cancel and the restart at `paused_angle`.
// Runs only against a sandbox database (name ending _sandbox or _test), like the other integration tests.

const mocks = vi.hoisted(() => ({
  started: [] as string[],
  parsed: { topic: 'a plain topic', constraints: ['calm'] },
  angleStep: null as unknown,
  notified: [] as string[],
}));

vi.mock('../../run-pipeline/pipeline-runner', async (orig) => ({
  ...(await orig<object>()),
  continuePipelineInBackground: (id: string) => void mocks.started.push(id),
  startPipelineInBackground: vi.fn(),
}));
vi.mock('../../run-pipeline/parse-brief', () => ({
  parseBrief: async () => ({ output: mocks.parsed, llm: null }),
  stubParseBrief: async () => ({ output: mocks.parsed, llm: null }),
}));
vi.mock('../../run-pipeline/preflight-gate', () => ({ preflightGate: async () => null }));
vi.mock('../../run-pipeline/story-tests-stage', async (orig) => ({
  ...(await orig<object>()),
  runAngleStepForRun: async () => mocks.angleStep,
  notifyAngleWaiting: async (run: { id: string }) => void mocks.notified.push(run.id),
}));

import { prisma } from '../../models/prisma-client';
import { SANDBOX } from '../../test-support/sandbox';
import { runsRouter } from './runs';
import { runIntakeStage } from '../../run-pipeline/state-machine';
import { runPipelineFromCurrentStage } from '../../run-pipeline/pipeline-runner';
import { listRunsByStatus } from '../../models/repositories/pipeline-run.repository';
import { findLatestCompletedAttempt } from '../../models/repositories/pipeline-stage.repository';
import { readStoredStoryTests } from '../../story-tests/view';
import type { StoredStoryTests } from '../../story-tests/schemas';

function waitingRecord(): StoredStoryTests {
  const angles = ['a1', 'a2', 'a3', 'a4'].map((id) => ({ id, title: `Title ${id}`, promise: `Promise ${id}`, figureFlag: null }));
  return {
    version: 1,
    angleStep: { status: 'waiting', notRunReason: null, angles, readerRuns: [], mark: 'no_clear_winner', readerTopId: null, chosenId: null, choseReaderPick: null, chosenAt: null },
    calls: [],
    costUsd: 0,
    tags: { storyTests: 'on', partA: 'used' },
  } as unknown as StoredStoryTests;
}

describe.skipIf(!SANDBOX)('paused_angle against the sandbox database', () => {
  const tenantId = randomUUID(), otherTenantId = randomUUID(), channelId = randomUUID(), ownerId = randomUUID();
  const otherOwnerId = randomUUID(), otherChannelId = randomUUID();
  const owner = () => runsRouter.createCaller({ tenantId, userId: ownerId, role: 'owner', identityKind: 'session' } as never);
  const stranger = () => runsRouter.createCaller({ tenantId: otherTenantId, userId: otherOwnerId, role: 'owner', identityKind: 'session' } as never);

  async function seedWaitingRun(): Promise<string> {
    const id = randomUUID();
    await prisma.pipelineRun.create({ data: { id, tenantId, channelId, briefText: 'Topic: a plain topic', status: 'paused_angle', currentStage: 'intake' } });
    await prisma.pipelineStage.create({
      data: { pipelineRunId: id, stageName: 'intake', attemptNumber: 1, status: 'completed', input: {}, output: { ...mocks.parsed, storyTests: waitingRecord() } as never, completedAt: new Date() },
    });
    return id;
  }

  beforeAll(async () => {
    await prisma.tenant.createMany({ data: [{ id: tenantId, name: 'Angle fixture' }, { id: otherTenantId, name: 'Angle fixture other' }] });
    await prisma.user.createMany({ data: [
      { id: ownerId, tenantId, email: `${ownerId}@fixture.test`, role: 'owner' },
      { id: otherOwnerId, tenantId: otherTenantId, email: `${otherOwnerId}@fixture.test`, role: 'owner' },
    ] });
    await prisma.channel.createMany({ data: [
      { id: channelId, tenantId, name: 'Angle fixture channel', nicheDescription: 'Synthetic only', ownerUserId: ownerId },
      { id: otherChannelId, tenantId: otherTenantId, name: 'Other', nicheDescription: 'Synthetic only', ownerUserId: otherOwnerId },
    ] });
  });
  beforeEach(() => {
    mocks.started.length = 0;
    mocks.notified.length = 0;
    mocks.angleStep = null;
  });
  afterAll(async () => {
    for (const t of [tenantId, otherTenantId]) {
      await prisma.usageEvent.deleteMany({ where: { tenantId: t } });
      await prisma.pipelineStage.deleteMany({ where: { pipelineRun: { tenantId: t } } });
      await prisma.pipelineRun.deleteMany({ where: { tenantId: t } });
      await prisma.channel.deleteMany({ where: { tenantId: t } });
      await prisma.user.deleteMany({ where: { tenantId: t } });
      await prisma.tenant.delete({ where: { id: t } });
    }
  });

  describe('runs.chooseAngle', () => {
    it('stores the choice, moves the run to the script step and starts the driver', async () => {
      const id = await seedWaitingRun();
      await expect(owner().chooseAngle({ runId: id, angleId: 'a2' })).resolves.toEqual({ resolved: true });
      const run = await prisma.pipelineRun.findUniqueOrThrow({ where: { id } });
      expect(run.status).toBe('running');
      expect(run.currentStage).toBe('script_generation');
      const stored = readStoredStoryTests((await findLatestCompletedAttempt(id, 'intake'))?.output);
      expect(stored?.angleStep).toMatchObject({ status: 'chosen', chosenId: 'a2' });
      expect(mocks.started).toEqual([id]);
    });

    it('skip (null) writes the brief as is', async () => {
      const id = await seedWaitingRun();
      await owner().chooseAngle({ runId: id, angleId: null });
      const stored = readStoredStoryTests((await findLatestCompletedAttempt(id, 'intake'))?.output);
      expect(stored?.angleStep).toMatchObject({ status: 'skipped', chosenId: null });
      expect((await prisma.pipelineRun.findUniqueOrThrow({ where: { id } })).currentStage).toBe('script_generation');
    });

    it('refuses an owner of another tenant and leaves the run waiting', async () => {
      const id = await seedWaitingRun();
      await expect(stranger().chooseAngle({ runId: id, angleId: 'a1' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect((await prisma.pipelineRun.findUniqueOrThrow({ where: { id } })).status).toBe('paused_angle');
      expect(mocks.started).toEqual([]);
    });

    it('refuses an angle that is not one of the run angles', async () => {
      const id = await seedWaitingRun();
      await expect(owner().chooseAngle({ runId: id, angleId: 'zz' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      expect((await prisma.pipelineRun.findUniqueOrThrow({ where: { id } })).status).toBe('paused_angle');
    });

    it('is a CONFLICT when the run is not at paused_angle', async () => {
      const id = await seedWaitingRun();
      await prisma.pipelineRun.update({ where: { id }, data: { status: 'paused_gate1', currentStage: 'script_review' } });
      await expect(owner().chooseAngle({ runId: id, angleId: 'a1' })).rejects.toMatchObject({ code: 'CONFLICT' });
      expect(mocks.started).toEqual([]);
    });

    it('a second answer is a CONFLICT and starts no second driver', async () => {
      const id = await seedWaitingRun();
      await owner().chooseAngle({ runId: id, angleId: 'a1' });
      await expect(owner().chooseAngle({ runId: id, angleId: 'a3' })).rejects.toMatchObject({ code: 'CONFLICT' });
      const stored = readStoredStoryTests((await findLatestCompletedAttempt(id, 'intake'))?.output);
      expect(stored?.angleStep.chosenId).toBe('a1');
      expect(mocks.started).toEqual([id]);
    });

    it('two answers at the same moment: exactly one wins', async () => {
      const id = await seedWaitingRun();
      const results = await Promise.allSettled([owner().chooseAngle({ runId: id, angleId: 'a1' }), owner().chooseAngle({ runId: id, angleId: 'a2' })]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(mocks.started).toEqual([id]);
    });
  });

  describe('the pause', () => {
    async function freshRun(): Promise<string> {
      const id = randomUUID();
      await prisma.pipelineRun.create({ data: { id, tenantId, channelId, briefText: 'Topic: a plain topic' } });
      return id;
    }

    it('a waiting angle step pauses the run at intake and sends the notice once', async () => {
      const id = await freshRun();
      mocks.angleStep = waitingRecord();
      const run = await runIntakeStage(id);
      expect(run.status).toBe('paused_angle');
      expect(run.currentStage).toBe('intake');
      expect(mocks.notified).toEqual([id]);
      const stored = readStoredStoryTests((await findLatestCompletedAttempt(id, 'intake'))?.output);
      expect(stored?.angleStep.status).toBe('waiting');
    });

    it('the driver stops at paused_angle and does not start the script step', async () => {
      const id = await seedWaitingRun();
      const run = await runPipelineFromCurrentStage(id);
      expect(run.status).toBe('paused_angle');
      expect(await prisma.pipelineStage.count({ where: { pipelineRunId: id, stageName: 'script_generation' } })).toBe(0);
    });

    it('a not-run angle step does not pause: the run moves on to the script step', async () => {
      const id = await freshRun();
      const base = waitingRecord();
      mocks.angleStep = { ...base, angleStep: { ...base.angleStep, status: 'not_run', notRunReason: 'Gate 1 is off for this channel', angles: [] } };
      const run = await runIntakeStage(id);
      expect(run.status).toBe('running');
      expect(run.currentStage).toBe('script_generation');
      expect(mocks.notified).toEqual([]);
    });

    it('the feature off leaves intake exactly as before', async () => {
      const id = await freshRun();
      const run = await runIntakeStage(id);
      expect(run.currentStage).toBe('script_generation');
      expect(readStoredStoryTests((await findLatestCompletedAttempt(id, 'intake'))?.output)).toBeNull();
    });
  });

  describe('cancel', () => {
    it('ends a run waiting for an angle, immediately', async () => {
      const id = await seedWaitingRun();
      await expect(owner().cancel({ runId: id })).resolves.toMatchObject({ cancelled: true, alreadyEnded: false });
      const run = await prisma.pipelineRun.findUniqueOrThrow({ where: { id } });
      expect(run.status).toBe('failed');
      await expect(owner().chooseAngle({ runId: id, angleId: 'a1' })).rejects.toMatchObject({ code: 'CONFLICT' });
    });
  });

  describe('restart while waiting', () => {
    it('resume-on-startup leaves a paused_angle run alone, and the choice still works afterwards', async () => {
      const id = await seedWaitingRun();
      const { resumeOnStartup } = await import('../../run-pipeline/resume-on-startup');
      await resumeOnStartup();
      const after = await prisma.pipelineRun.findUniqueOrThrow({ where: { id } });
      expect(after.status).toBe('paused_angle');
      expect(after.currentStage).toBe('intake');
      expect(mocks.started).not.toContain(id);
      expect((await listRunsByStatus('paused_angle')).some((r) => r.id === id)).toBe(true);
      await owner().chooseAngle({ runId: id, angleId: 'a4' });
      expect((await prisma.pipelineRun.findUniqueOrThrow({ where: { id } })).status).toBe('running');
    });
  });
});
