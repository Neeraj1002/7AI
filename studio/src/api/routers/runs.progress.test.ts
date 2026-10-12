import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ findPipelineRunById: vi.fn(), findLatestAttempt: vi.fn() }));

vi.mock('../../models/repositories/pipeline-run.repository', () => ({
  findPipelineRunById: mocks.findPipelineRunById,
  updatePipelineRun: vi.fn(),
  listRuns: vi.fn(),
  CANCELLED_BY_USER: 'Cancelled by user',
}));
vi.mock('../../models/repositories/pipeline-stage.repository', () => ({
  listStagesForRun: vi.fn(),
  findLatestAttempt: mocks.findLatestAttempt,
  findLatestCompletedAttempt: vi.fn(),
}));
vi.mock('../../run-pipeline/state-machine', () => ({ createRun: vi.fn() }));
vi.mock('../../run-pipeline/pipeline-runner', () => ({
  startPipelineInBackground: vi.fn(),
  continuePipelineInBackground: vi.fn(),
}));

import { runsRouter } from './runs';

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const caller = () => runsRouter.createCaller({ tenantId: 't1', userId: 'u1', role: 'owner' } as never);
const run = (currentStage: string | null) => ({ id: RUN_ID, tenantId: 't1', currentStage });

beforeEach(() => vi.clearAllMocks());

describe('runs.progress: stills counter (R4)', () => {
  it('while video_generation runs, returns done and total beside stage and attemptNo', async () => {
    mocks.findPipelineRunById.mockResolvedValue(run('video_generation'));
    mocks.findLatestAttempt.mockResolvedValue({ attemptNumber: 2, status: 'running', output: { stillsProgress: { done: 7, total: 24 } } });
    expect(await caller().progress({ runId: RUN_ID })).toEqual({ stage: 'video_generation', attemptNo: 2, done: 7, total: 24 });
  });

  it('before the first count is stored, the fields are absent', async () => {
    mocks.findPipelineRunById.mockResolvedValue(run('video_generation'));
    mocks.findLatestAttempt.mockResolvedValue({ attemptNumber: 1, status: 'running', output: null });
    expect(await caller().progress({ runId: RUN_ID })).toEqual({ stage: 'video_generation', attemptNo: 1 });
  });

  it('a finished attempt, or any other stage, never shows a count', async () => {
    mocks.findPipelineRunById.mockResolvedValue(run('video_generation'));
    mocks.findLatestAttempt.mockResolvedValue({ attemptNumber: 1, status: 'completed', output: { stillsProgress: { done: 5, total: 5 } } });
    expect(await caller().progress({ runId: RUN_ID })).toEqual({ stage: 'video_generation', attemptNo: 1 });

    mocks.findPipelineRunById.mockResolvedValue(run('script_review'));
    mocks.findLatestAttempt.mockResolvedValue({ attemptNumber: 1, status: 'running', output: { stillsProgress: { done: 1, total: 2 } } });
    expect(await caller().progress({ runId: RUN_ID })).toEqual({ stage: 'script_review', attemptNo: 1 });
  });
});
