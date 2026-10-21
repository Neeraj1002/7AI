import { describe, it, expect, vi, beforeEach } from 'vitest';

// Bugs Task 11 (R3) — the usage of a structured-output call must still reach
// the usage_events insert. Everything from generateScript down to the AI SDK is
// real here; only the SDK's generateText and the repositories are mocked.
const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  streamText: vi.fn(),
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

vi.mock('ai', async (orig) => ({ ...(await orig<object>()), generateText: mocks.generateText, streamText: mocks.streamText }));
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
    briefText: 'Stored founder brief',
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
      model: 'claude-sonnet-5-5',
      inputTokens: 1500,
      outputTokens: 321,
    });
    expect(Number(event.costUsd)).toBeGreaterThan(0);
    expect(mocks.completeStage).toHaveBeenCalled();
  });

  const cutOffCall = (outputTokens: number) =>
    new NoObjectGeneratedError({
      message: 'No object generated',
      text: '{"scriptText":"cut off',
      response: { id: 'r', timestamp: new Date(), modelId: 'm' },
      usage: { inputTokens: 1500, outputTokens } as never,
      finishReason: 'length',
    });
  // The retry at a larger limit streams.
  const streamed = (text: string, outputTokens: number, finishReason: string) => ({
    text: Promise.resolve(text),
    usage: Promise.resolve({ inputTokens: 1500, outputTokens }),
    finishReason: Promise.resolve(finishReason),
  });

  it('a reply cut off, then complete on the automatic retry, books both calls and completes the stage', async () => {
    mocks.generateText.mockRejectedValueOnce(cutOffCall(16000));
    mocks.streamText.mockReturnValueOnce(streamed('{"scriptText":"Hello there.","captions":"c","hashtags":["a"]}', 700, 'stop'));
    await runScriptGenerationStage(RUN_ID);
    expect(mocks.generateText.mock.calls[0][0]).toMatchObject({ maxOutputTokens: 16000, providerOptions: { anthropic: { thinking: { type: 'disabled' } } } });
    expect(mocks.streamText.mock.calls[0][0]).toMatchObject({ maxOutputTokens: 32000, providerOptions: { anthropic: { thinking: { type: 'disabled' } } } });
    expect(mocks.insertUsageEvent.mock.calls.map((c) => c[0].outputTokens)).toEqual([16000, 700]);
    expect(mocks.completeStage).toHaveBeenCalled();
    expect(mocks.failStage).not.toHaveBeenCalled();
  });

  it('a reply cut off twice books both calls and fails with the honest cut-off message', async () => {
    mocks.generateText.mockRejectedValueOnce(cutOffCall(16000));
    mocks.streamText.mockReturnValueOnce(streamed('{"scriptText":"cut off', 32000, 'length'));
    await runScriptGenerationStage(RUN_ID);
    expect(mocks.insertUsageEvent).toHaveBeenCalledTimes(2);
    expect(mocks.insertUsageEvent.mock.calls.map((c) => c[0].outputTokens)).toEqual([16000, 32000]);
    expect(mocks.insertUsageEvent.mock.calls[0][0]).toMatchObject({ provider: 'anthropic', model: 'claude-sonnet-5-5', inputTokens: 1500 });
    expect(Number(mocks.insertUsageEvent.mock.calls[0][0].costUsd)).toBeGreaterThan(0);
    const message = mocks.failStage.mock.calls[0][1] as string;
    expect(message).toContain('cut off even after one automatic retry');
    expect(message).not.toContain('shorten the brief');
    expect(mocks.failStage.mock.calls[0][3]).toMatchObject({ rawReply: '{"scriptText":"cut off', stopReason: 'length' });
  });
});
