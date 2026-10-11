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
});
