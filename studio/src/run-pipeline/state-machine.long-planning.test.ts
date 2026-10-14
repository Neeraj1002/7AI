import { describe, it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({
  callLLM: vi.fn(), findPipelineRunById: vi.fn(), updatePipelineRun: vi.fn(),
  findChannelById: vi.fn(), findLatestAttempt: vi.fn(), createStageAttempt: vi.fn(),
  completeStage: vi.fn(), failStage: vi.fn(), patchStageOutput: vi.fn(), insertUsageEvent: vi.fn(),
  checkBudget: vi.fn(), loadResolvedConfig: vi.fn(), generateLongVideo: vi.fn(),
}));
vi.mock('../llm', async orig => ({ ...(await orig<object>()), callLLM: mocks.callLLM }));
vi.mock('../models/prisma-client', () => ({ prisma: { $transaction: async (fn: (tx: object) => unknown) => fn({}) } }));
vi.mock('../models/repositories/pipeline-run.repository', async orig => ({ ...(await orig<object>()), findPipelineRunById: mocks.findPipelineRunById, updatePipelineRun: mocks.updatePipelineRun }));
vi.mock('../models/repositories/channel.repository', async orig => ({ ...(await orig<object>()), findChannelById: mocks.findChannelById }));
vi.mock('../models/repositories/pipeline-stage.repository', async orig => ({ ...(await orig<object>()), findLatestAttempt: mocks.findLatestAttempt, createStageAttempt: mocks.createStageAttempt, completeStage: mocks.completeStage, failStage: mocks.failStage, patchStageOutput: mocks.patchStageOutput }));
vi.mock('../models/repositories/review-log.repository', async orig => ({ ...(await orig<object>()), listReviewLogsForRun: async () => [] }));
vi.mock('../models/repositories/usage-event.repository', async orig => ({ ...(await orig<object>()), insertUsageEvent: mocks.insertUsageEvent }));
vi.mock('./budget-gate', async orig => ({ ...(await orig<object>()), checkBudget: mocks.checkBudget }));
vi.mock('./resolved-config', () => ({ loadResolvedConfig: mocks.loadResolvedConfig }));
vi.mock('../agents/video-generation/long-form', () => ({ generateLongVideo: mocks.generateLongVideo }));
import { runVideoGenerationStage } from './state-machine';
import { NonTransientStageError } from './retry-with-backoff';
import type { LongPlanningCheckpoint } from '../agents/video-generation/plan-long';
const chapters = [{ title: 'Commute', text: Array.from({ length: 240 }, (_, i) => `word${i}`).join(' ') }];
let previous: { attemptNumber: number; status: string; output: Record<string, unknown> } | null;
let output: Record<string, unknown>;
function goodReply(req: { messages: { content: string }[] }) {
  const slots: {id:string;anchor:string}[] = JSON.parse(req.messages[0].content.match(/Required scene slots: (\[[^\n]*\])/)![1]);
  return { text: JSON.stringify({ scenes: Object.fromEntries(slots.map(slot => [slot.id, { prompt: `Camera tracks ${slot.anchor}` }])), audioLayer: 'calm' }), stopReason: 'stop', usage: { inputTokens: 500, outputTokens: 400 }, costUsd: '0.001', provider: 'anthropic', model: 'claude-sonnet-5' };
}
beforeEach(() => {
  vi.clearAllMocks();
  previous = null; output = {};
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mocks.findPipelineRunById.mockResolvedValue({ id: 'run', tenantId: 't', channelId: 'c', intakeParsed: { topic: 'Commute' }, creationOptions: null });
  mocks.findChannelById.mockResolvedValue({ id: 'c', platform: 'youtube', brandAssets: {} });
  mocks.findLatestAttempt.mockImplementation(async (_run, name) => name === 'gate1' ? { status: 'completed', output: { sanctionedScriptText: chapters[0].text, chapters } } : previous);
  mocks.createStageAttempt.mockResolvedValue({ id: 'stage' });
  mocks.updatePipelineRun.mockImplementation(async (_id, patch) => ({ id: 'run', ...patch }));
  mocks.checkBudget.mockResolvedValue({ ok: true });
  mocks.loadResolvedConfig.mockResolvedValue({ videoKind: 'long', targetSeconds: 120, audioDefaultVoice: 'alloy', audioDefaultMoodTag: 'none' });
  mocks.patchStageOutput.mockImplementation(async (_id, patch) => { output = { ...output, ...patch }; });
  mocks.failStage.mockImplementation(async (_id, _error, _tx, diagnostics) => { if (diagnostics) output = diagnostics; });
  mocks.generateLongVideo.mockRejectedValue(new NonTransientStageError('mock render stop'));
  mocks.callLLM.mockReset().mockImplementation(goodReply);
});
describe('long planning stage checkpoints', () => {
  it('persists completed batches through malformed reply failure and resumes only missing work', async () => {
    mocks.callLLM.mockImplementationOnce(goodReply).mockImplementation(() => ({ text: '{bad', stopReason: 'stop', usage: {inputTokens:500,outputTokens:400}, costUsd:'0.001',provider:'anthropic',model:'claude-sonnet-5' }));
    await runVideoGenerationStage('run');
    expect(mocks.callLLM).toHaveBeenCalledTimes(9);
    expect(mocks.patchStageOutput).toHaveBeenCalledTimes(1);
    expect(output).toMatchObject({ rawReply: '{bad', longPlanningCheckpoint: { scenes: expect.any(Object) } });
    const saved = output.longPlanningCheckpoint as LongPlanningCheckpoint;
    expect(Object.keys(saved.scenes)).toHaveLength(12);
    previous = { attemptNumber: 1, status: 'failed', output };
    mocks.callLLM.mockClear().mockImplementation(goodReply);
    await runVideoGenerationStage('run');
    expect(mocks.callLLM).toHaveBeenCalledTimes(1);
    expect(mocks.callLLM.mock.calls[0][0].messages[0].content).toContain('Chapter scene range: 13-24');
    expect(mocks.generateLongVideo.mock.calls[0][0].plan.longScenes).toHaveLength(24);
    expect(mocks.generateLongVideo.mock.calls[0][0].plan.longScenes[0]).toMatchObject(saved.scenes['0:0']);
    expect(output).toHaveProperty('longPlanningCheckpoint');
  });
});

it('records the checkpoint in the stage INSERT before a restart can hide its predecessor',async()=>{
  mocks.callLLM.mockImplementationOnce(goodReply).mockImplementation(()=>({text:'{bad',stopReason:'stop',usage:{inputTokens:1,outputTokens:1},costUsd:'0',provider:'anthropic',model:'claude-sonnet-5'}));
  await runVideoGenerationStage('run');
  previous={attemptNumber:1,status:'failed',output};
  mocks.createStageAttempt.mockClear();mocks.callLLM.mockReset().mockImplementation(goodReply);
  await runVideoGenerationStage('run');
  const initial=mocks.createStageAttempt.mock.calls[0][0].output.longPlanningCheckpoint;
  expect(Object.keys(initial.scenes)).toHaveLength(12);
  expect(initial.contractVersion).toBe(3);
  expect(mocks.callLLM).toHaveBeenCalledTimes(1);
});
