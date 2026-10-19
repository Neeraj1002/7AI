import { describe, it, expect, vi, beforeEach } from 'vitest';

// Sprint 5 Task 8 (R13): a Retry of a run stopped at intake must run intake again and carry on.
const mocks = vi.hoisted(() => ({
  runIntakeStage: vi.fn(),
  runScriptGenerationStage: vi.fn(),
  findChannelById: vi.fn(),
  findPipelineRunById: vi.fn(),
  updatePipelineRun: vi.fn(),
}));

vi.mock('./state-machine', () => ({
  runIntakeStage: mocks.runIntakeStage,
  runScriptGenerationStage: mocks.runScriptGenerationStage,
  runScriptReviewStage: vi.fn(),
  runGate1Stage: vi.fn(),
  runVideoGenerationStage: vi.fn(),
  runVideoReviewStage: vi.fn(),
  runGate2Stage: vi.fn(),
  runPublishingStage: vi.fn(),
  runAnalyticsStage: vi.fn(),
}));
vi.mock('../models/repositories/channel.repository', () => ({ findChannelById: mocks.findChannelById }));
vi.mock('../models/repositories/pipeline-run.repository', () => ({
  findPipelineRunById: mocks.findPipelineRunById,
  updatePipelineRun: mocks.updatePipelineRun,
  CANCELLED_BY_USER: 'Cancelled by user',
}));

import { runPipelineFromCurrentStage } from './pipeline-runner';

const run = (over: Record<string, unknown>) => ({ id: 'run-1', channelId: 'ch-1', status: 'running', currentStage: 'intake', ...over });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findChannelById.mockResolvedValue({ id: 'ch-1', isActive: true });
});

describe('driving a run that is at intake', () => {
  it('runs intake, then continues with the next stage the intake advanced to', async () => {
    mocks.findPipelineRunById.mockResolvedValue(run({}));
    mocks.runIntakeStage.mockResolvedValue(run({ currentStage: 'script_generation' }));
    mocks.runScriptGenerationStage.mockResolvedValue(run({ status: 'needs_attention', currentStage: 'script_generation' }));
    await runPipelineFromCurrentStage('run-1');
    expect(mocks.runIntakeStage).toHaveBeenCalledTimes(1);
    expect(mocks.runScriptGenerationStage).toHaveBeenCalledTimes(1);
  });

  it('stops where it is when intake stops the run again (a blocked preflight)', async () => {
    mocks.findPipelineRunById.mockResolvedValue(run({}));
    mocks.runIntakeStage.mockResolvedValue(run({ status: 'needs_attention' }));
    const out = await runPipelineFromCurrentStage('run-1');
    expect(out.status).toBe('needs_attention');
    expect(mocks.runScriptGenerationStage).not.toHaveBeenCalled();
  });
});
