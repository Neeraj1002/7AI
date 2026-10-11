import { describe, it, expect, vi, beforeEach } from 'vitest';

// Bugs Task 11 (R3) — the usage of a structured-output call must still reach
// the usage_events insert. Everything from generateScript down to the AI SDK is
// real here; only the SDK's generateText and the repositories are mocked.
const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  findPipelineRunById: vi.fn(),
  updatePipelineRun: vi.fn(),
  findChannelById: vi.fn(),
  findLatestAttempt: vi.fn(),
  createStageAttempt: vi.fn(),
  completeStage: vi.fn(),
  failStage: vi.fn(),
  insertUsageEvent: vi.fn(),
  checkBudget: vi.fn(),
}));

vi.mock('ai', async (orig) => ({ ...(await orig<object>()), generateText: mocks.generateText }));
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
}));
vi.mock('../models/repositories/usage-event.repository', async (orig) => ({
  ...(await orig<object>()),
  insertUsageEvent: mocks.insertUsageEvent,
}));
vi.mock('./budget-gate', async (orig) => ({ ...(await orig<object>()), checkBudget: mocks.checkBudget }));

import { NoObjectGeneratedError } from 'ai';
import { runScriptGenerationStage } from './state-machine';

const RUN_ID = 'run-structured';
const GOOD = '{"scriptText":"He said \\"no\\" to salt.","captions":"c","hashtags":["a"]}';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mocks.findPipelineRunById.mockResolvedValue({
    id: RUN_ID,
    tenantId: 't1',
    channelId: 'c1',
    status: 'running',
    intakeParsed: { topic: 'topic', constraints: [] },
    creationOptions: null,
  });
  mocks.findChannelById.mockResolvedValue({ id: 'c1', platform: 'youtube', styleGuide: null, isActive: true });
  mocks.findLatestAttempt.mockResolvedValue(null);
  mocks.createStageAttempt.mockResolvedValue({ id: 'stage-1' });
  mocks.checkBudget.mockResolvedValue({ ok: true });
  mocks.updatePipelineRun.mockResolvedValue({ id: RUN_ID });
  mocks.insertUsageEvent.mockResolvedValue({});
});

describe('structured-output usage reaches usage_events', () => {
  it('a successful structured call books its real tokens, cost, provider and model', async () => {
    mocks.generateText.mockResolvedValue({ text: GOOD, finishReason: 'stop', usage: { inputTokens: 1500, outputTokens: 321 } });
    await runScriptGenerationStage(RUN_ID);
    expect(mocks.generateText.mock.calls[0][0]).toHaveProperty('output');
    expect(mocks.insertUsageEvent).toHaveBeenCalledTimes(1);
    const event = mocks.insertUsageEvent.mock.calls[0][0];
    expect(event).toMatchObject({
      agent: 'script-generation',
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      inputTokens: 1500,
      outputTokens: 321,
    });
    expect(Number(event.costUsd)).toBeGreaterThan(0);
    expect(mocks.completeStage).toHaveBeenCalled();
  });

  it('a structured call the SDK could not build into the object (cut off) still books its real usage and fails with the cut-off message', async () => {
    mocks.generateText.mockRejectedValue(
      new NoObjectGeneratedError({
        message: 'No object generated',
        text: '{"scriptText":"cut off',
        response: { id: 'r', timestamp: new Date(), modelId: 'm' },
        usage: { inputTokens: 1500, outputTokens: 4096 } as never,
        finishReason: 'length',
      }),
    );
    await runScriptGenerationStage(RUN_ID);
    expect(mocks.insertUsageEvent).toHaveBeenCalledTimes(1);
    expect(mocks.insertUsageEvent.mock.calls[0][0]).toMatchObject({ provider: 'anthropic', model: 'claude-sonnet-5', inputTokens: 1500, outputTokens: 4096 });
    expect(Number(mocks.insertUsageEvent.mock.calls[0][0].costUsd)).toBeGreaterThan(0);
    expect(mocks.failStage.mock.calls[0][1]).toContain('cut off at the output cap');
    expect(mocks.failStage.mock.calls[0][3]).toMatchObject({ rawReply: '{"scriptText":"cut off', stopReason: 'length' });
  });
});
