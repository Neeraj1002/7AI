import { describe, it, expect, vi, beforeEach } from 'vitest';

// Sprint 6 Task 3 (Part C): runs.learningRecord reads the stored record back, scoped to the caller's tenant.
const mocks = vi.hoisted(() => ({ listStagesForRun: vi.fn(), findPipelineRunById: vi.fn() }));
vi.mock('../../models/repositories/pipeline-run.repository', () => ({
  findPipelineRunById: mocks.findPipelineRunById, updatePipelineRun: vi.fn(), claimPlannerContractRecovery: vi.fn(), listRuns: vi.fn(), CANCELLED_BY_USER: 'Cancelled by user',
}));
vi.mock('../../run-pipeline/pipeline-runner', () => ({ startPipelineInBackground: vi.fn(), continuePipelineInBackground: vi.fn() }));
vi.mock('../../models/repositories/pipeline-stage.repository', async (orig) => ({ ...(await orig<object>()), listStagesForRun: mocks.listStagesForRun }));

import { runsRouter } from './runs';

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const owner = { tenantId: 't1', userId: 'u1', role: 'owner' } as never;
const stranger = { tenantId: 't2', userId: 'u9', role: 'owner' } as never;
const stage = (stageName: string, output: unknown, attemptNumber = 1) => ({ stageName, status: 'completed', attemptNumber, output });

beforeEach(() => {
  mocks.findPipelineRunById.mockResolvedValue({ id: RUN_ID, tenantId: 't1', channelId: 'c1', creationOptions: null });
  mocks.listStagesForRun.mockResolvedValue([]);
});

describe('runs.learningRecord', () => {
  it('an old run reads as untagged, not off', async () => {
    mocks.listStagesForRun.mockResolvedValue([stage('intake', { topic: 'x' })]);
    const rec = await runsRouter.createCaller(owner).learningRecord({ runId: RUN_ID });
    expect(rec).toMatchObject({ runId: RUN_ID, tenantId: 't1', tags: null, partA: null, scriptCheck: null });
  });
  it('reads the tags from the latest completed intake attempt', async () => {
    const tags = (storyTests: 'on' | 'off') => ({ version: 1, storyTests, stockFootageFix: null, build: 'abc' });
    mocks.listStagesForRun.mockResolvedValue([stage('intake', { pipelineTags: tags('on') }, 1), stage('intake', { pipelineTags: tags('off') }, 2)]);
    expect((await runsRouter.createCaller(owner).learningRecord({ runId: RUN_ID })).tags?.storyTests).toBe('off');
  });
  it('refuses another tenant and an unknown run', async () => {
    await expect(runsRouter.createCaller(stranger).learningRecord({ runId: RUN_ID })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    mocks.findPipelineRunById.mockResolvedValue(null);
    await expect(runsRouter.createCaller(owner).learningRecord({ runId: RUN_ID })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
