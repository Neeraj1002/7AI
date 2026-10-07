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
  generateScript: vi.fn(),
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
}));
vi.mock('../models/repositories/usage-event.repository', async (orig) => ({
  ...(await orig<object>()),
  insertUsageEvent: mocks.insertUsageEvent,
}));
vi.mock('./budget-gate', async (orig) => ({ ...(await orig<object>()), checkBudget: mocks.checkBudget }));
vi.mock('../agents/script-generation', async (orig) => ({ ...(await orig<object>()), generateScript: mocks.generateScript }));

import { runScriptGenerationStage } from './state-machine';
import { NonTransientStageError } from './retry-with-backoff';
import { llmUsageContext } from './stage-failure';

const RUN_ID = 'run-1';
const llm = (overrides: Record<string, unknown> = {}) => ({
  text: '{"scriptText":"x","captions":"c","hashtags":[]}',
  usage: { inputTokens: 1200, outputTokens: 300 },
  stopReason: 'stop',
  costUsd: '0.008100',
  provider: 'anthropic' as const,
  model: 'claude-sonnet-5',
  ...overrides,
});
const OUTPUT = { scriptText: 'x', captions: 'c', hashtags: [] as string[] };

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

describe('runScriptGenerationStage failure path (Bugs Task 11)', () => {
  it('R2: books the real call (tokens, cost, provider, model) when the reply was unusable', async () => {
    const failed = llm({ text: 'bad reply', stopReason: 'length' });
    mocks.generateScript.mockRejectedValue(
      new NonTransientStageError('Script Generation did not return valid JSON: x', undefined, {
        ...llmUsageContext(failed),
        replyLength: failed.text.length,
        parseError: 'Expected , at position 20',
        rawReply: failed.text,
      }),
    );
    await runScriptGenerationStage(RUN_ID);
    expect(mocks.insertUsageEvent).toHaveBeenCalledTimes(1);
    expect(mocks.insertUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'script-generation',
        provider: 'anthropic',
        model: 'claude-sonnet-5',
        inputTokens: 1200,
        outputTokens: 300,
        costUsd: '0.008100',
      }),
    );
  });

  it('R1: the failed stage row keeps the raw reply and diagnostics', async () => {
    const failed = llm({ text: 'not json at all', stopReason: 'length' });
    mocks.generateScript.mockRejectedValue(
      new NonTransientStageError('Script Generation did not return valid JSON: x', undefined, {
        ...llmUsageContext(failed),
        replyLength: 15,
        parseError: 'Unexpected token',
        rawReply: failed.text,
      }),
    );
    await runScriptGenerationStage(RUN_ID);
    expect(mocks.failStage).toHaveBeenCalledWith(
      'stage-1',
      expect.stringContaining('did not return valid JSON'),
      expect.anything(),
      expect.objectContaining({ rawReply: 'not json at all', stopReason: 'length', replyLength: 15 }),
    );
    expect(mocks.updatePipelineRun).toHaveBeenCalledWith(
      RUN_ID,
      expect.objectContaining({ status: 'needs_attention' }),
      expect.anything(),
    );
  });

  it('a non-LLM failure still records unknown/0/$0 and no stage output', async () => {
    mocks.generateScript.mockRejectedValue(new Error('disk on fire'));
    await runScriptGenerationStage(RUN_ID);
    expect(mocks.insertUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'unknown', model: 'unknown', inputTokens: 0, outputTokens: 0, costUsd: '0.000000' }),
    );
    expect(mocks.failStage.mock.calls[0][3]).toBeUndefined();
  });

  it('success still books the call and completes the stage', async () => {
    mocks.generateScript.mockResolvedValue({ output: OUTPUT, llm: llm() });
    await runScriptGenerationStage(RUN_ID);
    expect(mocks.insertUsageEvent).toHaveBeenCalledWith(expect.objectContaining({ costUsd: '0.008100', inputTokens: 1200 }));
    expect(mocks.completeStage).toHaveBeenCalled();
  });
});
