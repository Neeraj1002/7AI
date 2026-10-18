import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findPipelineRunById: vi.fn(),
  updatePipelineRun: vi.fn(),
  findChannelById: vi.fn(),
  findLatestAttempt: vi.fn(),
  findLatestCompletedAttempt: vi.fn(),
  createStageAttempt: vi.fn(),
  completeStage: vi.fn(),
  failStage: vi.fn(),
  insertUsageEvent: vi.fn(),
  checkBudget: vi.fn(),
  patchStageOutput: vi.fn(),
  planLong: vi.fn(),
  generateLong: vi.fn(),
  config: vi.fn(),
  prepareRepair: vi.fn(),
  executeRepair: vi.fn(),
}));

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
  findLatestCompletedAttempt: mocks.findLatestCompletedAttempt,
  createStageAttempt: mocks.createStageAttempt,
  completeStage: mocks.completeStage,
  failStage: mocks.failStage,
  patchStageOutput: mocks.patchStageOutput,
}));
vi.mock('../models/repositories/usage-event.repository', async (orig) => ({
  ...(await orig<object>()),
  insertUsageEvent: mocks.insertUsageEvent,
}));
vi.mock('./budget-gate', async (orig) => ({ ...(await orig<object>()), checkBudget: mocks.checkBudget }));
vi.mock('../agents/video-generation/plan-long', async orig => ({ ...(await orig<object>()), planLongVideoProduction: mocks.planLong }));
vi.mock('../agents/video-generation/long-form', () => ({ generateLongVideo: mocks.generateLong }));
vi.mock('./resolved-config', () => ({ loadResolvedConfig: mocks.config }));
vi.mock('./visual-repair', async orig => ({ ...(await orig<object>()), prepareVisualRepair: mocks.prepareRepair }));
vi.mock('./visual-repair-render', () => ({ executeVisualRepair: mocks.executeRepair }));
vi.mock('../models/repositories/review-log.repository', async (orig) => ({ ...(await orig<object>()), listReviewLogsForRun: vi.fn().mockResolvedValue([]) }));


import { runVideoGenerationStage } from './state-machine';
import { NonTransientStageError } from './retry-with-backoff';
const plan = { visualSource: 'ai-stills', stockFootageQuery: 'history', stillScenePrompts: ['scene'], longScenes: [{ chapterIndex: 0, words: 'the script', prompt: 'scene' }], captionStyle: 'sentence-grouped', audioLayer: 'none', pacingNotes: 'steady', rationale: 'test' };
const chapters = [{ title: 'Chapter', text: 'the script' }];
let previous: Record<string, unknown> | null;
beforeEach(() => {
  vi.clearAllMocks(); previous = null;
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mocks.findPipelineRunById.mockResolvedValue({ id: 'r', tenantId: 't', channelId: 'c', intakeParsed: { topic: 'history' }, creationOptions: { videoKind: 'long' } });
  mocks.findChannelById.mockResolvedValue({ id: 'c', platform: 'youtube', brandAssets: {} });
  mocks.config.mockResolvedValue({ videoKind: 'long', audioDefaultVoice: 'v', targetSeconds: 600 });
  mocks.findLatestAttempt.mockImplementation(async (_id, stage) => stage === 'gate1' ? { status: 'completed', output: { sanctionedScriptText: 'the script', chapters } } : previous);
  mocks.createStageAttempt.mockResolvedValue({ id: 'new', attemptNumber: 1 });
  mocks.checkBudget.mockResolvedValue({ ok: true });
  mocks.planLong.mockResolvedValue({ plan });
  mocks.generateLong.mockRejectedValue(new NonTransientStageError('capacity', undefined, { recoveryKind: 'provider_capacity' }));
  mocks.updatePipelineRun.mockResolvedValue({ id: 'r' });
});
describe('persisted plan recovery in video generation', () => {
  it('reuses the complete plan across repeated eligible failures', async () => {
    await runVideoGenerationStage('r');
    const checkpoint = mocks.patchStageOutput.mock.calls.find((call) => call[1].recoveryPlan)?.[1];
    expect(checkpoint?.recoveryPlan.plan).toEqual(plan);
    previous = { status: 'failed', attemptNumber: 1, output: { ...checkpoint, recovery: { kind: 'provider_capacity' } } };
    mocks.planLong.mockClear(); mocks.patchStageOutput.mockClear();
    await runVideoGenerationStage('r');
    expect(mocks.planLong).not.toHaveBeenCalled();
    expect(mocks.generateLong).toHaveBeenLastCalledWith(expect.objectContaining({ plan, chapters }));
    expect(mocks.patchStageOutput).toHaveBeenCalledWith('new', checkpoint);
    mocks.config.mockResolvedValue({ videoKind: 'long', audioDefaultVoice: 'different', targetSeconds: 600 });
    await runVideoGenerationStage('r');
    expect(mocks.planLong).toHaveBeenCalledTimes(1);
  });

  it('routes a located eligible review defect through the bounded repair intent without replanning', async () => {
    const baseline = { status: 'completed', attemptNumber: 1,
      input: { resolvedVoice: 'v' }, output: { ...plan, plan, videoKind: 'long', videoPath: 'baseline.mp4' } };
    mocks.findLatestAttempt.mockImplementation(async (_id, stage) => {
      if (stage === 'gate1') return { status: 'completed', output: { sanctionedScriptText: 'the script', chapters } };
      if (stage === 'video_generation') return baseline;
      if (stage === 'video_review') return { status: 'completed', input: { videoPath: 'baseline.mp4' }, output: { verdict: 'fail',
        visualDefects: [{ sceneId: '0:0', timestampSeconds: 1, kind: 'continuity',
          reason: 'wrong color', requiredVisualConstraints: ['same color'] }] } };
      return null;
    });
    mocks.prepareRepair.mockResolvedValue({ receipt: { sceneId: '0:0' }, receiptPath: 'receipt.json' });
    mocks.executeRepair.mockRejectedValue(new NonTransientStageError('mock render stopped'));

    await runVideoGenerationStage('r');

    expect(mocks.prepareRepair).toHaveBeenCalledWith(expect.objectContaining({ baselineAttempt: 1, repairAttempt: 2 }));
    expect(mocks.createStageAttempt).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.objectContaining({ visualRepairIntent: { sceneId: '0:0' } }),
    }));
    expect(mocks.executeRepair).toHaveBeenCalledTimes(1);
    expect(mocks.planLong).not.toHaveBeenCalled();
    expect(mocks.generateLong).not.toHaveBeenCalled();
  });

  it('carries a checkpointed replacement across a failed repair attempt without another provider plan', async () => {
    const defect = { sceneId: '0:0', timestampSeconds: 1, kind: 'continuity' as const,
      reason: 'wrong color', requiredVisualConstraints: ['same color'] };
    const baselineFields = { factualFingerprint: 'a'.repeat(64), planSha256: 'b'.repeat(64),
      mappingSha256: 'c'.repeat(64), voice: 'v', renderSha256: 'd'.repeat(64), videoSha256: '2'.repeat(64),
      timingSha256: 'e'.repeat(64), audioSha256: 'f'.repeat(64), subtitlesSha256: '0'.repeat(64),
      transcriptSha256: '3'.repeat(64), chapterSegmentsSha256: '4'.repeat(64) };
    const oldReceipt = { version: 1, runId: 'r', baselineAttempt: 1, repairAttempt: 2,
      sceneId: '0:0', chapterIndex: 0, defect, baseline: baselineFields,
      status: 'replacement-ready', replacement: { path: 'cached.png', sha256: '1'.repeat(64),
        provider: 'mock', costUsd: 0 } };
    const completed = { status: 'completed', attemptNumber: 1,
      input: { resolvedVoice: 'v' }, output: { plan, videoKind: 'long', videoPath: 'baseline.mp4' } };
    mocks.findLatestCompletedAttempt.mockImplementation(async (_id, stage) => stage === 'video_generation' ? completed : null);
    mocks.findLatestAttempt.mockImplementation(async (_id, stage) => {
      if (stage === 'gate1') return { status: 'completed', output: { sanctionedScriptText: 'the script', chapters } };
      if (stage === 'video_generation') return { status: 'failed', attemptNumber: 2,
        input: { visualRepairIntent: { ...oldReceipt, status: 'intent' } }, output: { visualRepairReceipt: oldReceipt } };
      if (stage === 'video_review') return { status: 'completed', input: { videoPath: 'baseline.mp4' },
        output: { verdict: 'fail', visualDefects: [defect] } };
      return null;
    });
    mocks.prepareRepair.mockResolvedValue({ receipt: { ...oldReceipt, repairAttempt: 3, status: 'intent', replacement: undefined }, receiptPath: 'new.json' });
    mocks.executeRepair.mockRejectedValue(new NonTransientStageError('mock render stopped'));

    await runVideoGenerationStage('r');

    expect(mocks.createStageAttempt.mock.calls[0][0].input.visualRepairIntent).toMatchObject({
      repairAttempt: 3, status: 'replacement-ready', replacement: oldReceipt.replacement,
    });
    expect(mocks.planLong).not.toHaveBeenCalled();
    expect(mocks.generateLong).not.toHaveBeenCalled();
  });
});
