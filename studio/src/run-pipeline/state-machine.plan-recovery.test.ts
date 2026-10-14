import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findPipelineRunById: vi.fn(),
  updatePipelineRun: vi.fn(),
  findChannelById: vi.fn(),
  findLatestAttempt: vi.fn(),
  createStageAttempt: vi.fn(),
  completeStage: vi.fn(),
  failStage: vi.fn(),
  insertUsageEvent: vi.fn(),
  checkBudget: vi.fn(),
  patchStageOutput: vi.fn(),
  planLong: vi.fn(),
  generateLong: vi.fn(),
  config: vi.fn(),
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
});
