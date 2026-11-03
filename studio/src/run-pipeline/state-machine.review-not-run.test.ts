import { describe, it, expect, vi, beforeEach } from 'vitest';

// Sprint 6 Task 1 (PR 2): a review that did not run is never a pass. Same mock layout as the provider-limit test.
const mocks = vi.hoisted(() => ({
  reviewVideo: vi.fn(), findPipelineRunById: vi.fn(), updatePipelineRun: vi.fn(), findChannelById: vi.fn(),
  findLatestAttempt: vi.fn(), createStageAttempt: vi.fn(), completeStage: vi.fn(), failStage: vi.fn(),
  insertReviewLog: vi.fn(), insertUsageEvent: vi.fn(), checkBudget: vi.fn(), sumUsageCostForRun: vi.fn(),
}));
vi.mock('../agents/video-intelligence', async (orig) => ({ ...(await orig<object>()), reviewVideo: mocks.reviewVideo }));
vi.mock('../models/prisma-client', () => ({ prisma: { $transaction: async (fn: (tx: object) => unknown) => fn({}) } }));
vi.mock('../models/repositories/pipeline-run.repository', async (orig) => ({ ...(await orig<object>()), findPipelineRunById: mocks.findPipelineRunById, updatePipelineRun: mocks.updatePipelineRun }));
vi.mock('../models/repositories/channel.repository', async (orig) => ({ ...(await orig<object>()), findChannelById: mocks.findChannelById }));
vi.mock('../models/repositories/pipeline-stage.repository', async (orig) => ({ ...(await orig<object>()), findLatestAttempt: mocks.findLatestAttempt, createStageAttempt: mocks.createStageAttempt, completeStage: mocks.completeStage, failStage: mocks.failStage }));
vi.mock('../models/repositories/review-log.repository', async (orig) => ({ ...(await orig<object>()), insertReviewLog: mocks.insertReviewLog }));
vi.mock('../models/repositories/usage-event.repository', async (orig) => ({ ...(await orig<object>()), insertUsageEvent: mocks.insertUsageEvent, sumUsageCostForRun: mocks.sumUsageCostForRun }));
vi.mock('./budget-gate', async (orig) => ({ ...(await orig<object>()), checkBudget: mocks.checkBudget }));

import { runVideoReviewStage } from './state-machine';
import { describeStageOutcome } from './attempt-outcome';

const RUN_ID = 'run-notrun';
const call = (cost: string) => ({ provider: 'anthropic', model: 'm', usage: { inputTokens: 10, outputTokens: 5 }, costUsd: cost, stopReason: 'stop', text: 'x', maxOutputTokens: 100, priorAttempts: [] });
const notRun = {
  verdict: 'not_run',
  rationale: 'Automated review did not run: bad json',
  multimodalRan: true,
  llmCalls: [call('0.001000'), call('0.002000')],
  llm: call('0.002000'),
  reviewFailures: [
    { attempt: 1, reason: 'a', rawReply: 'oops', rawReplyTruncated: false, stopReason: 'stop' },
    { attempt: 2, reason: 'b', rawReply: 'oops again', rawReplyTruncated: false, stopReason: 'stop' },
  ],
};
let videoGenAttempt = 1;
let gate2Enabled = true;

beforeEach(() => {
  vi.clearAllMocks();
  videoGenAttempt = 1;
  gate2Enabled = true;
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  mocks.findPipelineRunById.mockImplementation(async () => ({ id: RUN_ID, tenantId: 't1', channelId: 'c1', status: 'running', currentStage: 'video_review', intakeParsed: { topic: 'Lego' }, creationOptions: { retryAllowanceUsd: 0.01 } }));
  mocks.findChannelById.mockImplementation(async () => ({ id: 'c1', platform: 'youtube', brandAssets: {}, approvalGateConfig: { gate2Enabled }, defaultPrivacyStatus: 'private' }));
  mocks.findLatestAttempt.mockImplementation(async (_id: string, name: string) => {
    if (name === 'video_generation') return { id: 'vg', status: 'completed', attemptNumber: videoGenAttempt, output: { videoPath: '/v/1.mp4', plan: { visualSource: 'stock-footage' } } };
    if (name === 'gate1') return { status: 'completed', output: { sanctionedScriptText: 'script' } };
    return null;
  });
  mocks.createStageAttempt.mockImplementation(async (arg: { stageName: string }) => ({ id: `s-${arg.stageName}` }));
  mocks.updatePipelineRun.mockImplementation(async (_id: string, patch: object) => ({ id: RUN_ID, ...patch }));
  mocks.checkBudget.mockResolvedValue({ ok: true });
  mocks.sumUsageCostForRun.mockResolvedValue(5);
  mocks.reviewVideo.mockResolvedValue(notRun);
});

describe('Video Review verdict not_run', () => {
  it('opens Gate 2 for a first-build video', async () => {
    const run = await runVideoReviewStage(RUN_ID);
    expect(run).toMatchObject({ status: 'paused_gate2', currentStage: 'gate2' });
  });

  it('never auto-approves, even when Gate 2 is off for the channel (no gate2 row, no auto-approve log)', async () => {
    gate2Enabled = false;
    const run = await runVideoReviewStage(RUN_ID);
    expect(run).toMatchObject({ status: 'paused_gate2' });
    expect(mocks.createStageAttempt.mock.calls.map(([a]) => (a as { stageName: string }).stageName)).toEqual(['video_review']);
    expect(mocks.insertReviewLog.mock.calls.some(([a]) => (a as { verdict: string }).verdict === 'auto-approve')).toBe(false);
  });

  it('is not a rejection: no regeneration at the cap, no retry-allowance pause, no stock fallback', async () => {
    videoGenAttempt = 3;
    const run = await runVideoReviewStage(RUN_ID);
    expect(run).toMatchObject({ status: 'paused_gate2' });
    expect(run.currentStage).not.toBe('video_generation');
    expect(run.lastError).toBeUndefined();
    expect(mocks.updatePipelineRun.mock.calls.every(([, patch]) => !(patch as { creationOptionsMerge?: unknown }).creationOptionsMerge)).toBe(true);
  });

  it('stores the capped raw reply of every failed attempt in the stage output, and logs the verdict as not_run', async () => {
    await runVideoReviewStage(RUN_ID);
    expect(mocks.completeStage.mock.calls[0][1]).toMatchObject({ verdict: 'not_run', reviewFailures: notRun.reviewFailures });
    expect(mocks.insertReviewLog.mock.calls[0][0]).toMatchObject({ verdict: 'not_run' });
  });

  it('books both billed calls', async () => {
    await runVideoReviewStage(RUN_ID);
    expect(mocks.insertUsageEvent.mock.calls.map(([a]) => (a as { costUsd: string }).costUsd)).toEqual(['0.001000', '0.002000']);
  });

  it('the attempt summary says completed with the reason, not failed review', () => {
    const info = describeStageOutcome({ stageName: 'video_review', status: 'completed', output: { verdict: 'not_run', rationale: 'Automated review did not run: x' }, error: null } as never);
    expect(info).toEqual({ outcome: 'completed', reason: 'Automated review did not run: x' });
  });
});
