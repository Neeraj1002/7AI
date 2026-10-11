import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  runScriptGenerationStage: vi.fn(),
  findChannelById: vi.fn(),
  findPipelineRunById: vi.fn(),
  updatePipelineRun: vi.fn(),
}));

vi.mock('./state-machine', () => ({
  runIntakeStage: vi.fn(),
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
import { isActivelyDriven, requestCancellation, isCancellationRequested } from './cancellation-registry';

const RUN_ID = 'run-1';
const baseRun = { id: RUN_ID, channelId: 'ch-1', status: 'running', currentStage: 'script_generation' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findPipelineRunById.mockResolvedValue(baseRun);
  mocks.findChannelById.mockResolvedValue({ id: 'ch-1', isActive: true });
});

describe('driveFromCurrentStage driven-run tracking and cancel', () => {
  it('marks the run as driven while a stage runs and unmarks it afterwards', async () => {
    let drivenDuringStage = false;
    mocks.runScriptGenerationStage.mockImplementation(async () => {
      drivenDuringStage = isActivelyDriven(RUN_ID, new Date());
      return { ...baseRun, status: 'needs_attention' };
    });
    await runPipelineFromCurrentStage(RUN_ID);
    expect(drivenDuringStage).toBe(true);
    expect(isActivelyDriven(RUN_ID, new Date())).toBe(false);
  });

  it('unmarks the run even when a stage throws (no ghost entry)', async () => {
    mocks.runScriptGenerationStage.mockRejectedValue(new Error('boom'));
    await expect(runPipelineFromCurrentStage(RUN_ID)).rejects.toThrow('boom');
    expect(isActivelyDriven(RUN_ID, new Date())).toBe(false);
  });

  it('a driven run with a cancel request ends as "Cancelled by user" before running the next stage', async () => {
    requestCancellation(RUN_ID);
    mocks.updatePipelineRun.mockResolvedValue({ ...baseRun, status: 'failed', lastError: 'Cancelled by user' });
    const result = await runPipelineFromCurrentStage(RUN_ID);
    expect(mocks.runScriptGenerationStage).not.toHaveBeenCalled();
    expect(mocks.updatePipelineRun).toHaveBeenCalledWith(RUN_ID, { status: 'failed', lastError: 'Cancelled by user' });
    expect(result.status).toBe('failed');
    expect(isCancellationRequested(RUN_ID)).toBe(false);
  });
});
