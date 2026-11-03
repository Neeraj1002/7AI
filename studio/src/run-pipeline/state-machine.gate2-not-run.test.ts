import { describe, it, expect, vi, beforeEach } from 'vitest';

// Sprint 6 Task 1 (PR 2): Gate 2 opens when the automated review did not run, for a first-build and a repaired
// video, and "Run review again" sends the run back to Video Review.
const mocks = vi.hoisted(() => ({
  requestGate2Decision: vi.fn(), findPipelineRunById: vi.fn(), updatePipelineRun: vi.fn(), findChannelById: vi.fn(),
  findLatestAttempt: vi.fn(), createStageAttempt: vi.fn(), completeStage: vi.fn(), insertReviewLog: vi.fn(),
}));
vi.mock('../agents/gate2', async (orig) => ({ ...(await orig<object>()), requestGate2Decision: mocks.requestGate2Decision }));
vi.mock('./packaging-stage', async (orig) => ({ ...(await orig<object>()), ensurePackagingForGate2: vi.fn(async () => null), packagingFieldOf: vi.fn(async () => ({})) }));
vi.mock('./resolved-config', () => ({ loadResolvedConfig: vi.fn(async () => ({ videoKind: 'short' })) }));
vi.mock('../models/prisma-client', () => ({ prisma: { $transaction: async (fn: (tx: object) => unknown) => fn({}) } }));
vi.mock('../models/repositories/pipeline-run.repository', async (orig) => ({ ...(await orig<object>()), findPipelineRunById: mocks.findPipelineRunById, updatePipelineRun: mocks.updatePipelineRun }));
vi.mock('../models/repositories/channel.repository', async (orig) => ({ ...(await orig<object>()), findChannelById: mocks.findChannelById }));
vi.mock('../models/repositories/pipeline-stage.repository', async (orig) => ({ ...(await orig<object>()), findLatestAttempt: mocks.findLatestAttempt, createStageAttempt: mocks.createStageAttempt, completeStage: mocks.completeStage }));
vi.mock('../models/repositories/review-log.repository', async (orig) => ({ ...(await orig<object>()), insertReviewLog: mocks.insertReviewLog }));

import { runGate2Stage } from './state-machine';

const RUN_ID = 'run-g2';
let repaired = false;
let review: { verdict: string; videoPath: string } = { verdict: 'not_run', videoPath: '/v/1.mp4' };

beforeEach(() => {
  vi.clearAllMocks();
  repaired = false;
  review = { verdict: 'not_run', videoPath: '/v/1.mp4' };
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  mocks.findPipelineRunById.mockImplementation(async () => ({ id: RUN_ID, tenantId: 't1', channelId: 'c1', status: 'paused_gate2', currentStage: 'gate2', creationOptions: null }));
  mocks.findChannelById.mockResolvedValue({ id: 'c1', name: 'Ch', tenantId: 't1', platform: 'youtube', defaultPrivacyStatus: 'private' });
  mocks.findLatestAttempt.mockImplementation(async (_id: string, name: string) => {
    if (name === 'video_generation') return { id: 'vg', status: 'completed', attemptNumber: 1, output: { videoPath: '/v/1.mp4', ...(repaired && { visualRepairReceipt: { any: 'receipt' } }) } };
    if (name === 'video_review') return { id: 'vr', status: 'completed', attemptNumber: 1, input: { videoPath: review.videoPath }, output: { verdict: review.verdict, rationale: 'Automated review did not run: x' } };
    if (name === 'gate1') return null;
    return null;
  });
  mocks.createStageAttempt.mockResolvedValue({ id: 'g2', attemptNumber: 1, status: 'running' });
  mocks.updatePipelineRun.mockImplementation(async (_id: string, patch: object) => ({ id: RUN_ID, ...patch }));
  mocks.requestGate2Decision.mockResolvedValue({ type: 'approve', privacyStatus: 'private', approvedByUserId: 'u1' });
});

describe('Gate 2 on a review that did not run', () => {
  it('opens for a first-build video and passes not_run through, not repaired', async () => {
    await runGate2Stage(RUN_ID);
    expect(mocks.requestGate2Decision).toHaveBeenCalledWith(expect.objectContaining({ verdict: 'not_run', repaired: false }));
  });

  it('opens for a repaired video and tells Gate 2 it was repaired (the banner says the repair is not verified)', async () => {
    repaired = true;
    await runGate2Stage(RUN_ID);
    expect(mocks.requestGate2Decision).toHaveBeenCalledWith(expect.objectContaining({ verdict: 'not_run', repaired: true }));
  });

  it('still refuses a repaired video whose review failed, or reviewed another file', async () => {
    repaired = true;
    review = { verdict: 'fail', videoPath: '/v/1.mp4' };
    await expect(runGate2Stage(RUN_ID)).rejects.toThrow(/Repaired video/);
    review = { verdict: 'not_run', videoPath: '/v/other.mp4' };
    await expect(runGate2Stage(RUN_ID)).rejects.toThrow(/Repaired video/);
    expect(mocks.requestGate2Decision).not.toHaveBeenCalled();
  });

  it('"Run review again" sends the run back to Video Review and records it', async () => {
    mocks.requestGate2Decision.mockResolvedValue({ type: 'rereview', approvedByUserId: 'u1' });
    const run = await runGate2Stage(RUN_ID);
    expect(run).toMatchObject({ status: 'running', currentStage: 'video_review' });
    expect(mocks.completeStage.mock.calls[0][1]).toMatchObject({ outcome: 'rereview' });
    expect(mocks.insertReviewLog.mock.calls[0][0]).toMatchObject({ agent: 'human', verdict: 'rereview' });
  });
});
