import { describe, it, expect, vi, beforeEach } from 'vitest';

// Bugs Task 12 (R1) - one AI-stills attempt after the stock-footage regeneration cap. The reviewer is
// mocked to reject; everything else around runVideoReviewStage is a repository mock.
const mocks = vi.hoisted(() => ({
  reviewVideo: vi.fn(),
  findPipelineRunById: vi.fn(),
  updatePipelineRun: vi.fn(),
  findChannelById: vi.fn(),
  findLatestAttempt: vi.fn(),
  createStageAttempt: vi.fn(),
  completeStage: vi.fn(),
  insertReviewLog: vi.fn(),
  insertUsageEvent: vi.fn(),
  checkBudget: vi.fn(),
}));

vi.mock('../agents/video-intelligence', async (orig) => ({ ...(await orig<object>()), reviewVideo: mocks.reviewVideo }));
vi.mock('../models/prisma-client', () => ({
  prisma: { $transaction: async (fn: (tx: object) => unknown) => fn({}) },
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
  createStageAttempt: mocks.createStageAttempt,
  completeStage: mocks.completeStage,
}));
vi.mock('../models/repositories/review-log.repository', async (orig) => ({
  ...(await orig<object>()),
  insertReviewLog: mocks.insertReviewLog,
}));
vi.mock('../models/repositories/usage-event.repository', async (orig) => ({
  ...(await orig<object>()),
  insertUsageEvent: mocks.insertUsageEvent,
}));
vi.mock('./budget-gate', async (orig) => ({ ...(await orig<object>()), checkBudget: mocks.checkBudget }));

import { runVideoReviewStage } from './state-machine';

const RUN_ID = 'run-fallback';
const baseRun = (creationOptions: object | null = null) => ({
  id: RUN_ID, tenantId: 't1', channelId: 'c1', status: 'running', currentStage: 'video_generation',
  intakeParsed: { topic: 'Lego' }, creationOptions,
});

function stages(opts: { visualSource: 'stock-footage' | 'ai-stills'; attempt: number }) {
  mocks.findLatestAttempt.mockImplementation(async (_id: string, name: string) => {
    if (name === 'video_generation')
      return { id: 'vg', status: 'completed', attemptNumber: opts.attempt, output: { videoPath: '/v.mp4', plan: { visualSource: opts.visualSource } } };
    if (name === 'gate1') return { status: 'completed', output: { sanctionedScriptText: 'script' } };
    return null;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findChannelById.mockResolvedValue({ id: 'c1', platform: 'youtube', brandAssets: {}, approvalGateConfig: {}, defaultPrivacyStatus: 'private' });
  mocks.createStageAttempt.mockResolvedValue({ id: 'vr' });
  mocks.updatePipelineRun.mockImplementation(async (_id: string, patch: object) => ({ id: RUN_ID, ...patch }));
  mocks.checkBudget.mockResolvedValue({ ok: true });
  mocks.reviewVideo.mockResolvedValue({ verdict: 'fail', rationale: 'generic analytics footage', multimodalRan: false });
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

const lastPatch = () => mocks.updatePipelineRun.mock.calls.at(-1)![1];

describe('runVideoReviewStage stock-footage fallback', () => {
  it('at the cap a stock run gets exactly one ai-stills attempt, marked, with a visible log row', async () => {
    mocks.findPipelineRunById.mockResolvedValue(baseRun());
    stages({ visualSource: 'stock-footage', attempt: 3 });
    await runVideoReviewStage(RUN_ID);
    expect(lastPatch()).toEqual({
      status: 'running',
      currentStage: 'video_generation',
      creationOptionsMerge: { visualSource: 'ai-stills', videoFallbackUsed: true },
    });
    expect(mocks.insertReviewLog).toHaveBeenCalledWith(
      expect.objectContaining({ agent: 'system', rationale: 'Switched to AI stills after stock footage failed review' }),
      expect.anything(),
    );
  });

  it('does not fall back below the cap (normal regeneration)', async () => {
    mocks.findPipelineRunById.mockResolvedValue(baseRun());
    stages({ visualSource: 'stock-footage', attempt: 2 });
    await runVideoReviewStage(RUN_ID);
    expect(lastPatch()).toEqual({ status: 'running', currentStage: 'video_generation' });
  });

  it('a second rejection after the fallback parks at needs_attention (marker set, no third attempt)', async () => {
    mocks.findPipelineRunById.mockResolvedValue(baseRun({ visualSource: 'ai-stills', videoFallbackUsed: true }));
    stages({ visualSource: 'ai-stills', attempt: 4 });
    await runVideoReviewStage(RUN_ID);
    expect(lastPatch()).toMatchObject({ status: 'needs_attention' });
    expect(lastPatch().creationOptionsMerge).toBeUndefined();
  });

  it('a restart/retry after the fallback cannot trigger a second one even on a stock plan', async () => {
    mocks.findPipelineRunById.mockResolvedValue(baseRun({ videoFallbackUsed: true }));
    stages({ visualSource: 'stock-footage', attempt: 5 });
    await runVideoReviewStage(RUN_ID);
    expect(lastPatch()).toMatchObject({ status: 'needs_attention' });
  });

  it('a run that was already ai-stills never falls back', async () => {
    mocks.findPipelineRunById.mockResolvedValue(baseRun());
    stages({ visualSource: 'ai-stills', attempt: 3 });
    await runVideoReviewStage(RUN_ID);
    expect(lastPatch()).toMatchObject({ status: 'needs_attention' });
  });

  it('a budget refusal parks as today and does not consume the fallback', async () => {
    mocks.findPipelineRunById.mockResolvedValue(baseRun());
    mocks.checkBudget.mockResolvedValue({ ok: false });
    stages({ visualSource: 'stock-footage', attempt: 3 });
    await runVideoReviewStage(RUN_ID);
    expect(lastPatch()).toMatchObject({ status: 'needs_attention' });
    expect(lastPatch().creationOptionsMerge).toBeUndefined();
  });
});

import { deriveContainsSyntheticMedia } from './state-machine';

describe('upload disclosure after the fallback', () => {
  it('the fallback attempt (ai-stills plan) uploads with containsSyntheticMedia true', () => {
    expect(deriveContainsSyntheticMedia({ plan: { visualSource: 'ai-stills' } })).toBe(true);
    expect(deriveContainsSyntheticMedia({ plan: { visualSource: 'stock-footage' } })).toBe(false);
    expect(deriveContainsSyntheticMedia({})).toBe(false);
  });
});
