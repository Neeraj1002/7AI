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
  generateScript: vi.fn(),
  listReviewLogsForRun: vi.fn(),
  insertReviewLog: vi.fn(),
  reviewScript: vi.fn(),
  runScriptCheckForRun: vi.fn(),
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
}));
vi.mock('../models/repositories/usage-event.repository', async (orig) => ({
  ...(await orig<object>()),
  insertUsageEvent: mocks.insertUsageEvent,
}));
vi.mock('./story-tests-stage', async (orig) => ({ ...(await orig<object>()), runScriptCheckForRun: mocks.runScriptCheckForRun }));
vi.mock('./budget-gate', async (orig) => ({ ...(await orig<object>()), checkBudget: mocks.checkBudget }));
vi.mock('../agents/script-generation', async (orig) => ({ ...(await orig<object>()), generateScript: mocks.generateScript }));
vi.mock('../agents/script-review', async orig => ({ ...await orig<object>(), reviewScript: mocks.reviewScript }));
vi.mock('../models/repositories/review-log.repository', async (orig) => ({
  ...(await orig<object>()),
  listReviewLogsForRun: mocks.listReviewLogsForRun,
  insertReviewLog: mocks.insertReviewLog,
}));

import { runScriptGenerationStage, runScriptReviewStage } from './state-machine';
import { NonTransientStageError } from './retry-with-backoff';
import { llmCallsContext, llmUsageContext } from './stage-failure';
import { buildEvidencePacket, evidenceRef } from '../content-evidence/packet';

const RUN_ID = 'run-1';
const llm = (overrides: Record<string, unknown> = {}) => ({
  text: '{"scriptText":"x","captions":"c","hashtags":[]}',
  usage: { inputTokens: 1200, outputTokens: 300 },
  stopReason: 'stop',
  costUsd: '0.008100',
  provider: 'anthropic' as const,
  model: 'claude-sonnet-5',
  maxOutputTokens: 16000,
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
    briefText: 'Stored founder brief',
    status: 'running',
    intakeParsed: { topic: 'topic', constraints: [] },
    creationOptions: null,
  });
  mocks.findChannelById.mockResolvedValue({ id: 'c1', platform: 'youtube', styleGuide: null, isActive: true });
  mocks.findLatestAttempt.mockResolvedValue(null);
  mocks.findLatestCompletedAttempt.mockResolvedValue(null);
  mocks.runScriptCheckForRun.mockResolvedValue(null);
  mocks.createStageAttempt.mockResolvedValue({ id: 'stage-1' });
  mocks.checkBudget.mockResolvedValue({ ok: true });
  mocks.updatePipelineRun.mockResolvedValue({ id: RUN_ID });
  mocks.insertUsageEvent.mockResolvedValue({});
  mocks.listReviewLogsForRun.mockResolvedValue([]);
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
    const call = llm();
    mocks.generateScript.mockResolvedValue({ output: OUTPUT, llm: call, calls: [call] });
    await runScriptGenerationStage(RUN_ID);
    expect(mocks.insertUsageEvent).toHaveBeenCalledTimes(1);
    expect(mocks.insertUsageEvent).toHaveBeenCalledWith(expect.objectContaining({ costUsd: '0.008100', inputTokens: 1200 }));
    expect(mocks.completeStage).toHaveBeenCalled();
  });

  it('reuses the stored evidence snapshot when current run defaults have changed', async () => {
    const packet = buildEvidencePacket({ briefText: 'Original brief', factPolicy: 'brief-only' });
    mocks.findLatestAttempt.mockResolvedValue({
      attemptNumber: 1,
      input: { evidence: packet, briefText: 'Original brief', factPolicy: 'brief-only', sources: [] },
      output: { evidenceRef: evidenceRef(packet) },
    });
    const call = llm();
    mocks.generateScript.mockResolvedValue({ output: OUTPUT, llm: call, calls: [call] });

    await runScriptGenerationStage(RUN_ID);

    expect(mocks.createStageAttempt.mock.calls[0][0].input.evidence).toEqual(packet);
    expect(mocks.generateScript.mock.calls[0][0].evidence).toEqual(packet);
    expect(mocks.completeStage.mock.calls[0][1].evidenceRef).toEqual(evidenceRef(packet));
  });

  it('R3: a generation that retried books both calls, so the retry counts against the budget', async () => {
    const first = llm({ costUsd: '0.008100' });
    const second = llm({ costUsd: '0.009900', usage: { inputTokens: 2000, outputTokens: 400 } });
    mocks.generateScript.mockResolvedValue({ output: OUTPUT, llm: second, calls: [first, second] });
    await runScriptGenerationStage(RUN_ID);
    expect(mocks.insertUsageEvent).toHaveBeenCalledTimes(2);
    expect(mocks.insertUsageEvent.mock.calls.map((c) => c[0].costUsd)).toEqual(['0.008100', '0.009900']);
    expect(mocks.insertUsageEvent.mock.calls[1][0]).toMatchObject({ inputTokens: 2000, outputTokens: 400 });
  });

  it('R3: when both calls fail, both are booked and the run goes to needs_attention', async () => {
    const first = llm({ text: 'bad one' });
    const second = llm({ text: 'bad two', costUsd: '0.009900' });
    mocks.generateScript.mockRejectedValue(
      new NonTransientStageError('Script Generation did not return valid JSON: x', undefined, {
        ...llmUsageContext(second),
        ...llmCallsContext([first, second]),
        rawReply: second.text,
        replyLength: 7,
        attempts: 2,
        firstRawReply: first.text,
      }),
    );
    await runScriptGenerationStage(RUN_ID);
    expect(mocks.insertUsageEvent).toHaveBeenCalledTimes(2);
    expect(mocks.insertUsageEvent.mock.calls.map((c) => c[0].costUsd)).toEqual(['0.008100', '0.009900']);
    expect(mocks.failStage.mock.calls[0][3]).toMatchObject({ rawReply: 'bad two', firstRawReply: 'bad one', attempts: 2 });
  });
});

// R4 exercises the real stage transition and next writer call, with only I/O mocked.
describe('SR retry concern handoff and existing Gate 1 transitions', () => {
  const concerns = ['SR-9: "copper nails torn loose" not in brief. Remove it.', 'SR-8: restore the estimate.'];
  const violations = ['SR-2: restore "full day" exactly.'];
  const reviewOutput = (score: number) => ({ score, notes: 'Review notes.', hookScore: 8, hookNotes: 'Hook.', videoGenFit: { fitsLengthLimit: true, pacingRealistic: true, visualsProducible: true, flags: [] }, factualConcerns: concerns, styleGuideViolations: violations });
  function setup(attempt: number, score: number, gate1Enabled = true) {
    mocks.findChannelById.mockResolvedValue({ id: 'c1', platform: 'youtube', styleGuide: null, isActive: true, approvalGateConfig: { gate1Enabled } });
    mocks.findLatestAttempt.mockImplementation(async (_id, name) => name === 'script_generation'
      ? { status: 'completed', attemptNumber: attempt, input: { briefText: 'Stored founder brief' }, output: OUTPUT }
      : attempt > 1 ? { attemptNumber: attempt - 1 } : null);
    mocks.reviewScript.mockResolvedValue({ output: reviewOutput(score), llm: llm() });
  }
  it('logs SR lists verbatim on auto-reject and forwards them to the next writer', async () => {
    setup(1, 6);
    await runScriptReviewStage(RUN_ID);
    const retry = mocks.insertReviewLog.mock.calls.find(c => c[0].verdict === 'auto-reject')?.[0];
    expect(retry).toBeDefined();
    for (const text of [...concerns, ...violations]) expect(retry.rationale).toContain(text);
    mocks.listReviewLogsForRun.mockResolvedValue([retry]);
    mocks.generateScript.mockResolvedValue({ output: OUTPUT, llm: llm() });
    await runScriptGenerationStage(RUN_ID);
    expect(mocks.generateScript.mock.calls[0][0].fixNotes).toBe(retry.rationale);
    expect(mocks.updatePipelineRun).toHaveBeenCalledWith(RUN_ID, { status: 'running', currentStage: 'script_generation' }, expect.anything());
  });
  it('still retries the third low review, including when Gate 1 is disabled', async () => {
    setup(3, 6, false); await runScriptReviewStage(RUN_ID);
    expect(mocks.insertReviewLog.mock.calls.some(c => c[0].verdict === 'auto-reject')).toBe(true);
  });
  it('after three retries goes to Gate 1 with concern arrays intact even with Gate 1 disabled', async () => {
    setup(4, 6, false); await runScriptReviewStage(RUN_ID);
    expect(mocks.insertReviewLog.mock.calls.some(c => c[0].verdict === 'auto-reject')).toBe(false);
    expect(mocks.completeStage).toHaveBeenCalledWith('stage-1', expect.objectContaining({ factualConcerns: concerns, styleGuideViolations: violations }), expect.anything());
    expect(mocks.updatePipelineRun).toHaveBeenCalledWith(RUN_ID, { status: 'paused_gate1', currentStage: 'gate1' }, expect.anything());
  });
  it('a passing score of 7 with Gate 1 off retains automatic approval', async () => {
    setup(1, 7, false); await runScriptReviewStage(RUN_ID);
    expect(mocks.insertReviewLog.mock.calls.some(c => c[0].verdict === 'auto-reject')).toBe(false);
    expect(mocks.updatePipelineRun).toHaveBeenCalledWith(RUN_ID, { status: 'running', currentStage: 'video_generation' }, expect.anything());
  });
  describe('Part B: the cold reader on the script that goes to Gate 1 (Sprint 6 Task 3)', () => {
    const stored = { version: 1, status: 'ran', verdict: 'fail' };
    it('stores the check on the review output and still sends the run to Gate 1, even on a FAIL', async () => {
      setup(1, 8); mocks.runScriptCheckForRun.mockResolvedValue(stored);
      await runScriptReviewStage(RUN_ID);
      expect(mocks.runScriptCheckForRun).toHaveBeenCalledTimes(1);
      expect(mocks.completeStage).toHaveBeenCalledWith('stage-1', expect.objectContaining({ score: 8, storyTest: stored }), expect.anything());
      expect(mocks.updatePipelineRun).toHaveBeenCalledWith(RUN_ID, { status: 'paused_gate1', currentStage: 'gate1' }, expect.anything());
    });
    it('does not run on a script that is about to be rewritten (auto-reject and retry)', async () => {
      setup(1, 5); mocks.runScriptCheckForRun.mockResolvedValue(stored);
      await runScriptReviewStage(RUN_ID);
      expect(mocks.runScriptCheckForRun).not.toHaveBeenCalled();
      expect(mocks.completeStage.mock.calls[0][1]).not.toHaveProperty('storyTest');
      expect(mocks.updatePipelineRun).toHaveBeenCalledWith(RUN_ID, { status: 'running', currentStage: 'script_generation' }, expect.anything());
    });
    it('with Gate 1 off, a passing script is still auto-approved and the result is stored', async () => {
      setup(1, 7, false); mocks.runScriptCheckForRun.mockResolvedValue(stored);
      await runScriptReviewStage(RUN_ID);
      expect(mocks.completeStage).toHaveBeenCalledWith('stage-1', expect.objectContaining({ storyTest: stored }), expect.anything());
      expect(mocks.updatePipelineRun).toHaveBeenCalledWith(RUN_ID, { status: 'running', currentStage: 'video_generation' }, expect.anything());
    });
    it('with the feature off the stage output is exactly the review output', async () => {
      setup(1, 8);
      await runScriptReviewStage(RUN_ID);
      expect(mocks.completeStage.mock.calls[0][1]).not.toHaveProperty('storyTest');
    });
    it('the score, the review log and the retry cap do not depend on the check', async () => {
      setup(1, 8); mocks.runScriptCheckForRun.mockResolvedValue(stored);
      await runScriptReviewStage(RUN_ID);
      expect(mocks.insertReviewLog.mock.calls.map((c) => c[0].verdict)).toEqual(['8']);
    });
  });
  it('meters both format calls on a successful review and on a failed parse retry', async()=>{
    setup(1,7);const first=llm({text:'invalid',costUsd:'0.001000'}),second=llm({costUsd:'0.002000'});
    mocks.reviewScript.mockResolvedValue({output:reviewOutput(7),llm:second,calls:[first,second]});
    await runScriptReviewStage(RUN_ID);expect(mocks.insertUsageEvent.mock.calls.map(c=>c[0].costUsd)).toEqual(['0.001000','0.002000']);
    mocks.insertUsageEvent.mockClear();mocks.completeStage.mockClear();mocks.insertReviewLog.mockClear();
    mocks.reviewScript.mockRejectedValue(new NonTransientStageError('invalid review after retry',undefined,{...llmCallsContext([first,second]),rawReply:'invalid',stopReason:'length'}));
    await runScriptReviewStage(RUN_ID);expect(mocks.insertUsageEvent.mock.calls.map(c=>c[0].costUsd)).toEqual(['0.001000','0.002000']);expect(mocks.completeStage).not.toHaveBeenCalled();expect(mocks.insertReviewLog).not.toHaveBeenCalled();
  });

});
