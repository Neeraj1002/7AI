import { describe, it, expect, vi, beforeEach } from 'vitest';

// Sprint 5 Task 8 (R4): a provider limit during Video Review is not a defect in the video. The run waits
// for a Retry, keeps the video and every picture, and uses no regeneration; the Retry reviews the same
// file. Same mock layout as the stock-footage fallback test.
const mocks = vi.hoisted(() => ({
  reviewVideo: vi.fn(), findPipelineRunById: vi.fn(), updatePipelineRun: vi.fn(), findChannelById: vi.fn(),
  findLatestAttempt: vi.fn(), createStageAttempt: vi.fn(), completeStage: vi.fn(), failStage: vi.fn(),
  insertReviewLog: vi.fn(), insertUsageEvent: vi.fn(), checkBudget: vi.fn(),
}));
vi.mock('../agents/video-intelligence', async (orig) => ({ ...(await orig<object>()), reviewVideo: mocks.reviewVideo }));
vi.mock('../models/prisma-client', () => ({ prisma: { $transaction: async (fn: (tx: object) => unknown) => fn({}) } }));
vi.mock('../models/repositories/pipeline-run.repository', async (orig) => ({ ...(await orig<object>()), findPipelineRunById: mocks.findPipelineRunById, updatePipelineRun: mocks.updatePipelineRun }));
vi.mock('../models/repositories/channel.repository', async (orig) => ({ ...(await orig<object>()), findChannelById: mocks.findChannelById }));
vi.mock('../models/repositories/pipeline-stage.repository', async (orig) => ({ ...(await orig<object>()), findLatestAttempt: mocks.findLatestAttempt, createStageAttempt: mocks.createStageAttempt, completeStage: mocks.completeStage, failStage: mocks.failStage }));
vi.mock('../models/repositories/review-log.repository', async (orig) => ({ ...(await orig<object>()), insertReviewLog: mocks.insertReviewLog }));
vi.mock('../models/repositories/usage-event.repository', async (orig) => ({ ...(await orig<object>()), insertUsageEvent: mocks.insertUsageEvent }));
vi.mock('./budget-gate', async (orig) => ({ ...(await orig<object>()), checkBudget: mocks.checkBudget }));

import { runVideoReviewStage } from './state-machine';
import { NonTransientStageError } from './retry-with-backoff';
import { isEligibleRecovery, retryTargetStage } from './manual-retries';

const RUN_ID = 'run-limit';
const LIMIT_MESSAGE = 'You have reached your specified workspace API usage limits. You will regain access on 2026-11-01 at 00:00 UTC.';
const quotaError = () => new NonTransientStageError('LLM provider capacity exhausted', undefined, {
  provider: 'anthropic', model: 'claude-haiku-4-5', recoveryKind: 'provider_capacity', statusCode: 429, providerErrorMessage: LIMIT_MESSAGE,
});
let reviewAttempt = 0;
let videoGenAttempt = 3;

beforeEach(() => {
  vi.clearAllMocks();
  reviewAttempt = 0;
  videoGenAttempt = 3;
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  mocks.findPipelineRunById.mockResolvedValue({ id: RUN_ID, tenantId: 't1', channelId: 'c1', status: 'running', currentStage: 'video_review', intakeParsed: { topic: 'Lego' }, creationOptions: null });
  mocks.findChannelById.mockResolvedValue({ id: 'c1', platform: 'youtube', brandAssets: {}, approvalGateConfig: {}, defaultPrivacyStatus: 'private' });
  mocks.findLatestAttempt.mockImplementation(async (_id: string, name: string) => {
    if (name === 'video_generation') return { id: 'vg', status: 'completed', attemptNumber: videoGenAttempt, output: { videoPath: '/v/3.mp4', plan: { visualSource: 'ai-stills' } } };
    if (name === 'gate1') return { status: 'completed', output: { sanctionedScriptText: 'script' } };
    return reviewAttempt ? { attemptNumber: reviewAttempt, status: 'failed' } : null;
  });
  mocks.createStageAttempt.mockImplementation(async () => ({ id: `vr${++reviewAttempt}` }));
  mocks.updatePipelineRun.mockImplementation(async (_id: string, patch: object) => ({ id: RUN_ID, ...patch }));
  mocks.checkBudget.mockResolvedValue({ ok: true });
});

describe('provider limit during Video Review (R4)', () => {
  it('parks the run for Retry with the provider message, uses no regeneration and touches no video or picture', async () => {
    mocks.reviewVideo.mockRejectedValue(quotaError());
    const run = await runVideoReviewStage(RUN_ID);
    expect(run).toMatchObject({ status: 'needs_attention' });
    expect(run.lastError).toContain('capacity exhausted');
    // the failed stage keeps a recovery record carrying the provider's own message and date
    const diagnostics = mocks.failStage.mock.calls[0][3];
    expect(diagnostics.recovery).toMatchObject({ kind: 'provider_capacity', provider: 'anthropic', statusCode: 429 });
    expect(diagnostics.recovery.providerErrorMessage).toContain('2026-11-01');
    expect(isEligibleRecovery({ status: 'failed', output: diagnostics })).toBe(true);
    // not a defect: no review verdict, no log row, no step back to video generation
    expect(mocks.insertReviewLog).not.toHaveBeenCalled();
    expect(mocks.completeStage).not.toHaveBeenCalled();
    expect(mocks.updatePipelineRun.mock.calls.every(([, patch]) => (patch as { currentStage?: string }).currentStage !== 'video_generation')).toBe(true);
    expect(mocks.createStageAttempt.mock.calls.every(([arg]) => (arg as { stageName: string }).stageName === 'video_review')).toBe(true);
  });

  it('books the failed call as a failed row, not as a call that cost nothing', async () => {
    mocks.reviewVideo.mockRejectedValue(quotaError());
    await runVideoReviewStage(RUN_ID);
    expect(mocks.insertUsageEvent).toHaveBeenCalledTimes(1);
    expect(mocks.insertUsageEvent.mock.calls[0][0]).toMatchObject({
      agent: 'video-intelligence-own-draft', provider: 'anthropic', costUsd: '0.000000',
      metadata: { callFailed: true, failureKind: 'provider_capacity' },
    });
  });

  it('Retry restarts the review of the same video file', async () => {
    mocks.reviewVideo.mockRejectedValueOnce(quotaError()).mockResolvedValueOnce({ verdict: 'pass', rationale: 'ok', multimodalRan: false });
    const first = await runVideoReviewStage(RUN_ID);
    expect(retryTargetStage({ currentStage: 'video_review', lastError: first.lastError ?? null })).toBe('video_review');
    await runVideoReviewStage(RUN_ID);
    expect(mocks.reviewVideo).toHaveBeenCalledTimes(2);
    expect(mocks.reviewVideo.mock.calls.map(([arg]) => (arg as { videoPath: string }).videoPath)).toEqual(['/v/3.mp4', '/v/3.mp4']);
    expect(mocks.createStageAttempt.mock.calls.map(([arg]) => (arg as { attemptNumber: number }).attemptNumber)).toEqual([1, 2]);
    expect(mocks.updatePipelineRun.mock.calls.at(-1)![1]).toMatchObject({ status: 'paused_gate2' });
  });

  it('a rejected key parks the run the same way', async () => {
    mocks.reviewVideo.mockRejectedValue(new NonTransientStageError('bad key', undefined, { provider: 'anthropic', model: 'm', recoveryKind: 'provider_auth' }));
    await runVideoReviewStage(RUN_ID);
    expect(mocks.failStage.mock.calls[0][3].recovery.kind).toBe('provider_auth');
  });

  it('a real quality failure still goes back for a regeneration, with its reason code stored', async () => {
    videoGenAttempt = 1;
    mocks.reviewVideo.mockResolvedValue({ verdict: 'fail', rationale: 'Longest AI still shot is 8.3s (pacing limit: 7.5s)', reasonCode: 'shot_length', multimodalRan: false });
    const run = await runVideoReviewStage(RUN_ID);
    expect(run).toMatchObject({ status: 'running', currentStage: 'video_generation' });
    expect(mocks.completeStage.mock.calls[0][1]).toMatchObject({ verdict: 'fail', reasonCode: 'shot_length' });
  });
});
