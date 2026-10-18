import { describe, it, expect, vi, beforeEach } from 'vitest';

// Sprint 5 Task 8 (R3): a shot-length failure from Video Review is repaired from the plan that made the
// video. No planner call, so no new picture prompts, so every picture comes from the run's cache.
const mocks = vi.hoisted(() => ({
  callLLM: vi.fn(), findPipelineRunById: vi.fn(), updatePipelineRun: vi.fn(),
  findChannelById: vi.fn(), findLatestAttempt: vi.fn(), findLatestCompletedAttempt: vi.fn(), createStageAttempt: vi.fn(),
  completeStage: vi.fn(), failStage: vi.fn(), patchStageOutput: vi.fn(), insertUsageEvent: vi.fn(),
  checkBudget: vi.fn(), loadResolvedConfig: vi.fn(), generateLongVideo: vi.fn(),
}));
vi.mock('../llm', async orig => ({ ...(await orig<object>()), callLLM: mocks.callLLM }));
vi.mock('../models/prisma-client', () => ({ prisma: { $transaction: async (fn: (tx: object) => unknown) => fn({}) } }));
vi.mock('../models/repositories/pipeline-run.repository', async orig => ({ ...(await orig<object>()), findPipelineRunById: mocks.findPipelineRunById, updatePipelineRun: mocks.updatePipelineRun }));
vi.mock('../models/repositories/channel.repository', async orig => ({ ...(await orig<object>()), findChannelById: mocks.findChannelById }));
vi.mock('../models/repositories/pipeline-stage.repository', async orig => ({ ...(await orig<object>()), findLatestAttempt: mocks.findLatestAttempt, findLatestCompletedAttempt: mocks.findLatestCompletedAttempt, createStageAttempt: mocks.createStageAttempt, completeStage: mocks.completeStage, failStage: mocks.failStage, patchStageOutput: mocks.patchStageOutput }));
vi.mock('../models/repositories/review-log.repository', async orig => ({ ...(await orig<object>()), listReviewLogsForRun: async () => [] }));
vi.mock('../models/repositories/usage-event.repository', async orig => ({ ...(await orig<object>()), insertUsageEvent: mocks.insertUsageEvent }));
vi.mock('./budget-gate', async orig => ({ ...(await orig<object>()), checkBudget: mocks.checkBudget }));
vi.mock('./resolved-config', () => ({ loadResolvedConfig: mocks.loadResolvedConfig }));
vi.mock('../agents/video-generation/long-form', () => ({ generateLongVideo: mocks.generateLongVideo }));
import { runVideoGenerationStage } from './state-machine';
import { NonTransientStageError } from './retry-with-backoff';

const chapters = [{ title: 'Commute', text: Array.from({ length: 240 }, (_, i) => `word${i}`).join(' ') }];
const keptPlan = {
  visualSource: 'ai-stills', stockFootageQuery: 'x', captionStyle: 'phrase-grouped', audioLayer: 'calm', pacingNotes: 'p', rationale: 'r',
  stillScenePrompts: ['kept prompt'], longScenes: [{ chapterIndex: 0, words: 'word0', prompt: 'kept prompt' }],
};
const baseline = { attemptNumber: 1, status: 'completed', output: { videoPath: '/v/1.mp4', plan: keptPlan } };
let review: Record<string, unknown> | null;

function setup(reviewOutput: Record<string, unknown> | null, reviewVideoPath = '/v/1.mp4') {
  review = reviewOutput && { attemptNumber: 1, status: 'completed', output: reviewOutput, input: { videoPath: reviewVideoPath } };
  mocks.findLatestAttempt.mockImplementation(async (_run, name) => {
    if (name === 'gate1') return { status: 'completed', output: { sanctionedScriptText: chapters[0].text, chapters } };
    if (name === 'video_review') return review;
    return baseline;
  });
  mocks.findLatestCompletedAttempt.mockResolvedValue(baseline);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mocks.findPipelineRunById.mockResolvedValue({ id: 'run', tenantId: 't', channelId: 'c', intakeParsed: { topic: 'Lego' }, creationOptions: null });
  mocks.findChannelById.mockResolvedValue({ id: 'c', platform: 'youtube', brandAssets: {} });
  mocks.createStageAttempt.mockResolvedValue({ id: 'stage' });
  mocks.updatePipelineRun.mockImplementation(async (_id, patch) => ({ id: 'run', ...patch }));
  mocks.checkBudget.mockResolvedValue({ ok: true });
  mocks.loadResolvedConfig.mockResolvedValue({ videoKind: 'long', targetSeconds: 120, visualSecondsPerStill: 5, audioDefaultVoice: 'coral', audioDefaultMoodTag: 'none' });
  mocks.generateLongVideo.mockRejectedValue(new NonTransientStageError('mock render stop'));
  mocks.callLLM.mockReset();
});

describe('timing repair after a shot-length review failure', () => {
  it('reuses the plan: no planner call, the same plan is rendered, with the shot limit passed down', async () => {
    setup({ verdict: 'fail', reasonCode: 'shot_length', rationale: 'Longest AI still shot is 8.3s (pacing limit: 7.5s)' });
    await runVideoGenerationStage('run');
    expect(mocks.callLLM).not.toHaveBeenCalled();
    const call = mocks.generateLongVideo.mock.calls[0][0];
    expect(call.plan).toBe(keptPlan);
    expect(call.maxShotSeconds).toBe(7.5);
    expect(mocks.createStageAttempt.mock.calls[0][0].input.timingRepair).toEqual({ baselineAttempt: 1, reasonCode: 'shot_length' });
  });

  it('a content or quality failure still plans again', async () => {
    setup({ verdict: 'fail', rationale: 'frames look unrelated to the topic' });
    mocks.callLLM.mockResolvedValue({ text: '{bad', stopReason: 'stop', usage: { inputTokens: 1, outputTokens: 1 }, costUsd: '0', provider: 'anthropic', model: 'claude-sonnet-5-5' });
    await runVideoGenerationStage('run');
    expect(mocks.callLLM).toHaveBeenCalled();
    expect(mocks.createStageAttempt.mock.calls[0][0].input.timingRepair).toBeUndefined();
  });

  it('does not reuse a plan when the failed review was of a different video', async () => {
    setup({ verdict: 'fail', reasonCode: 'shot_length', rationale: 'x' }, '/v/other.mp4');
    mocks.callLLM.mockResolvedValue({ text: '{bad', stopReason: 'stop', usage: { inputTokens: 1, outputTokens: 1 }, costUsd: '0', provider: 'anthropic', model: 'claude-sonnet-5-5' });
    await runVideoGenerationStage('run');
    expect(mocks.callLLM).toHaveBeenCalled();
  });

  it('a duration failure is not a timing repair (re-timing cannot lengthen the narration)', async () => {
    setup({ verdict: 'fail', reasonCode: 'duration', rationale: 'Duration 90.0s is under the 96s minimum' });
    mocks.callLLM.mockResolvedValue({ text: '{bad', stopReason: 'stop', usage: { inputTokens: 1, outputTokens: 1 }, costUsd: '0', provider: 'anthropic', model: 'claude-sonnet-5-5' });
    await runVideoGenerationStage('run');
    expect(mocks.callLLM).toHaveBeenCalled();
  });
});
