import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findPipelineRunById: vi.fn(),
  updatePipelineRun: vi.fn(),
  findChannelById: vi.fn(),
  findLatestAttempt: vi.fn(),
}));

vi.mock('../models/repositories/pipeline-run.repository', async (orig) => ({
  ...(await orig<object>()),
  findPipelineRunById: mocks.findPipelineRunById,
  updatePipelineRun: mocks.updatePipelineRun,
}));
vi.mock('../models/repositories/channel.repository', async (orig) => ({
  ...(await orig<object>()),
  findChannelById: mocks.findChannelById,
}));
vi.mock('../models/repositories/pipeline-stage.repository', async (orig) => ({
  ...(await orig<object>()),
  findLatestAttempt: mocks.findLatestAttempt,
}));

import { runPublishingStage } from './state-machine';
import { requestCancellation, clearCancellation } from './cancellation-registry';

// Bugs Task 10 (R1, step 6) — a cancelled run must never reach the upload.
// The guard returns before the first stage-row read (findLatestAttempt) or
// write (updatePipelineRun), which is exactly what these assert.
const RUN_ID = 'run-publish-guard';
const run = (status: string) => ({ id: RUN_ID, channelId: 'c1', status, currentStage: 'publishing' });

beforeEach(() => {
  vi.clearAllMocks();
  clearCancellation(RUN_ID);
  mocks.findChannelById.mockResolvedValue({ id: 'c1', isActive: true });
});

describe('runPublishingStage cancel guard', () => {
  it('refuses a run that is already failed (cancelled)', async () => {
    mocks.findPipelineRunById.mockResolvedValue(run('failed'));
    const out = await runPublishingStage(RUN_ID);
    expect(out.status).toBe('failed');
    expect(mocks.findLatestAttempt).not.toHaveBeenCalled();
    expect(mocks.updatePipelineRun).not.toHaveBeenCalled();
  });

  it('refuses a running run with a cancel request recorded', async () => {
    mocks.findPipelineRunById.mockResolvedValue(run('running'));
    requestCancellation(RUN_ID);
    await runPublishingStage(RUN_ID);
    expect(mocks.findLatestAttempt).not.toHaveBeenCalled();
    expect(mocks.updatePipelineRun).not.toHaveBeenCalled();
  });

  it('refuses an old Gate 2 approval for a newly repaired video before upload work', async () => {
    mocks.findPipelineRunById.mockResolvedValue(run('running'));
    mocks.findLatestAttempt.mockImplementation(async (_id, stage) => {
      if (stage === 'gate2') return { status: 'completed', input: { videoPath: 'old.mp4' },
        output: { outcome: 'approve', privacyStatus: 'private' } };
      if (stage === 'video_generation') return { status: 'completed', output: {
        videoPath: 'repaired.mp4', visualRepairReceipt: { status: 'rendered' }, plan: { visualSource: 'ai-stills' } } };
      if (stage === 'video_review') return { status: 'completed', input: { videoPath: 'repaired.mp4' }, output: { verdict: 'pass' } };
      return null;
    });
    await expect(runPublishingStage(RUN_ID)).rejects.toThrow(/matching fresh review and Gate 2 approval/);
    expect(mocks.updatePipelineRun).not.toHaveBeenCalled();
  });
});
