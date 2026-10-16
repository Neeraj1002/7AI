vi.mock('../../run-pipeline/resolved-config',()=>({loadResolvedConfig:mocks.loadResolvedConfig}));
vi.mock('../../models/repositories/review-log.repository',async orig=>({...await orig<object>(),listReviewLogsForRun:async()=>[]}));
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findLatestAttempt: vi.fn(),
  claimPlannerContractRecovery: vi.fn(),
  loadResolvedConfig: vi.fn(),
  findPipelineRunById: vi.fn(),
  updatePipelineRun: vi.fn(),
  findChannelById: vi.fn(),
  checkBudget: vi.fn(),
  resolvePendingApproval: vi.fn(),
  continuePipelineInBackground: vi.fn(),
  readPublishingReceipt: vi.fn(),
}));

vi.mock('../../models/repositories/pipeline-run.repository', () => ({
  findPipelineRunById: mocks.findPipelineRunById,
  updatePipelineRun: mocks.updatePipelineRun,
  claimPlannerContractRecovery: mocks.claimPlannerContractRecovery,
  listRuns: vi.fn(),
  CANCELLED_BY_USER: 'Cancelled by user',
}));
vi.mock('../../models/repositories/publishing-recovery.repository', () => ({
  readPublishingReceipt: mocks.readPublishingReceipt,
}));
vi.mock('../../models/repositories/channel.repository', () => ({ findChannelById: mocks.findChannelById }));
vi.mock('../../run-pipeline/budget-gate', () => ({
  checkBudget: mocks.checkBudget,
  describeBudgetRefusal: () => 'Weekly budget reached',
}));
vi.mock('../../run-pipeline/pipeline-runner', () => ({
  startPipelineInBackground: vi.fn(),
  continuePipelineInBackground: mocks.continuePipelineInBackground,
}));
vi.mock('../../notifications', async (orig) => ({
  ...(await orig<object>()),
  resolvePendingApproval: mocks.resolvePendingApproval,
}));

vi.mock('../../models/repositories/pipeline-stage.repository', async (orig) => ({
  ...(await orig<object>()), findLatestAttempt: mocks.findLatestAttempt,
}));

import { runsRouter } from './runs';
import { longPlanningInputHash } from '../../agents/video-generation/plan-long';

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const ctx = { tenantId: 't1', userId: 'u1', role: 'owner' } as never;
const caller = () => runsRouter.createCaller(ctx);

function run(over: Record<string, unknown> = {}) {
  return {
    id: RUN_ID, tenantId: 't1', channelId: 'c1', status: 'needs_attention', currentStage: 'video_generation',
    lastError: 'x', creationOptions: null, createdAt: new Date(), startedAt: null, updatedAt: new Date(), ...over,
  };
}
const used = (n: number) => ({ manualRetries: { video_generation: n } });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findLatestAttempt.mockResolvedValue(null);
  mocks.findChannelById.mockResolvedValue({ id: 'c1', tenantId: 't1', ownerUserId: 'u1', isActive: true, platform: 'youtube', defaultPrivacyStatus: 'private' });
  mocks.checkBudget.mockResolvedValue({ ok: true });
  mocks.updatePipelineRun.mockResolvedValue({});
  mocks.resolvePendingApproval.mockReturnValue({ resolved: true });
  mocks.readPublishingReceipt.mockResolvedValue(null);
});

describe('runs.retry manual cap', () => {
  it('allows three manual retries and refuses the fourth with the reason', async () => {
    for (const n of [0, 1, 2]) {
      mocks.findPipelineRunById.mockResolvedValue(run({ creationOptions: used(n) }));
      await caller().retry({ runId: RUN_ID });
    }
    // each accepted retry recorded one count
    expect(mocks.updatePipelineRun).toHaveBeenCalledWith(RUN_ID, { creationOptionsMerge: { manualRetries: { video_generation: 3 } } });
    mocks.findPipelineRunById.mockResolvedValue(run({ creationOptions: used(3) }));
    await expect(caller().retry({ runId: RUN_ID })).rejects.toThrow(/Retry limit reached for this step \(3\)/);
  });

  it('a budget-refused Retry does not count', async () => {
    mocks.findPipelineRunById.mockResolvedValue(run());
    mocks.checkBudget.mockResolvedValue({ ok: false });
    await expect(caller().retry({ runId: RUN_ID })).rejects.toThrow(/Weekly budget reached/);
    expect(mocks.updatePipelineRun).not.toHaveBeenCalled();
  });

  it('Retry on a run parked at gate2 restarts video_generation, never the gate', async () => {
    mocks.findPipelineRunById.mockResolvedValue(run({ currentStage: 'gate2', lastError: 'Gate 2 regen cap' }));
    await caller().retry({ runId: RUN_ID });
    expect(mocks.updatePipelineRun).toHaveBeenCalledWith(RUN_ID, { status: 'running', lastError: null, currentStage: 'video_generation' });
  });

  it('counts are per stage', async () => {
    mocks.findPipelineRunById.mockResolvedValue(run({ currentStage: 'script_generation', creationOptions: used(3) }));
    await expect(caller().retry({ runId: RUN_ID })).resolves.toBeDefined();
  });
});

describe('publishing Retry receipt guard', () => {
  beforeEach(() => {
    mocks.findPipelineRunById.mockResolvedValue(run({ currentStage: 'publishing' }));
    mocks.findLatestAttempt.mockResolvedValue({ stageName: 'publishing', status: 'failed', output: null });
  });
  it.each([
    [{ phase: 'ambiguous' }, 'unresolved'],
    [{ phase: 'uploading', ownerToken: 'owner', leaseUntil: '2100-01-01T00:00:00.000Z' }, 'active'],
  ])('blocks an unresolved or active upload before changing the run', async (receipt, _label) => {
    mocks.readPublishingReceipt.mockResolvedValue(receipt);
    await expect(caller().retry({ runId: RUN_ID })).rejects.toThrow(/Publishing is active or its YouTube outcome is unresolved/);
    expect(mocks.continuePipelineInBackground).not.toHaveBeenCalled();
  });
  it('allows a known ID with no active owner to resume follow-ups', async () => {
    mocks.readPublishingReceipt.mockResolvedValue({ phase: 'uploaded', youtubeVideoId: 'known',
      ownerToken: null, leaseUntil: null });
    await expect(caller().retry({ runId: RUN_ID })).resolves.toBeDefined();
    expect(mocks.continuePipelineInBackground).toHaveBeenCalledWith(RUN_ID);
  });
});

describe('runs.gate2 revise manual cap', () => {
  const revise = () => caller().gate2({ runId: RUN_ID, action: 'revise', notes: 'more Lego' });

  it('counts a Revise like a Retry', async () => {
    mocks.findPipelineRunById.mockResolvedValue(run({ status: 'paused_gate2', currentStage: 'gate2', creationOptions: used(1) }));
    await revise();
    expect(mocks.updatePipelineRun).toHaveBeenCalledWith(RUN_ID, { creationOptionsMerge: { manualRetries: { video_generation: 2 } } });
  });

  it('is refused at the cap, before the reply is consumed', async () => {
    mocks.findPipelineRunById.mockResolvedValue(run({ status: 'paused_gate2', currentStage: 'gate2', creationOptions: used(3) }));
    await expect(revise()).rejects.toThrow(/Retry limit reached/);
    expect(mocks.resolvePendingApproval).not.toHaveBeenCalled();
  });

  it('a budget-refused Revise does not count and keeps the gate open', async () => {
    mocks.findPipelineRunById.mockResolvedValue(run({ status: 'paused_gate2', currentStage: 'gate2' }));
    mocks.checkBudget.mockResolvedValue({ ok: false });
    await expect(revise()).rejects.toThrow(/Weekly budget reached/);
    expect(mocks.resolvePendingApproval).not.toHaveBeenCalled();
    expect(mocks.updatePipelineRun).not.toHaveBeenCalled();
  });
});

describe('eligible recovery at the ordinary retry cap', () => {
  it.each(['spend_limit', 'provider_capacity', 'rate_limit_exhausted'])('%s resumes without incrementing the counter', async (kind) => {
    mocks.findPipelineRunById.mockResolvedValue(run({ creationOptions: used(3) }));
    mocks.findLatestAttempt.mockResolvedValue({ status: 'failed', output: { recovery: { kind } } });
    await caller().retry({ runId: RUN_ID });
    expect(mocks.updatePipelineRun).not.toHaveBeenCalledWith(RUN_ID, expect.objectContaining({ creationOptionsMerge: expect.objectContaining({ manualRetries: expect.anything() }) }));
    expect(mocks.continuePipelineInBackground).toHaveBeenCalledWith(RUN_ID);
  });
  it('still refuses the application budget', async () => {
    mocks.findPipelineRunById.mockResolvedValue(run({ creationOptions: used(3) }));
    mocks.findLatestAttempt.mockResolvedValue({ status: 'failed', output: { recovery: { kind: 'provider_capacity' } } });
    mocks.checkBudget.mockResolvedValue({ ok: false });
    await expect(caller().retry({ runId: RUN_ID })).rejects.toThrow(/Weekly budget/);
    expect(mocks.continuePipelineInBackground).not.toHaveBeenCalled();
  });
  it.each(['authentication', 'invalid_request', 'render'])('%s failures still hit the cap', async (kind) => {
    mocks.findPipelineRunById.mockResolvedValue(run({ creationOptions: used(3) }));
    mocks.findLatestAttempt.mockResolvedValue({ status: 'failed', output: { recovery: { kind } } });
    await expect(caller().retry({ runId: RUN_ID })).rejects.toThrow(/Retry limit/);
  });
});

it('a cancelled run with a recovery checkpoint cannot resume', async () => {
  mocks.findPipelineRunById.mockResolvedValue(run({ status: 'failed', lastError: 'Cancelled by user', creationOptions: used(3) }));
  mocks.findLatestAttempt.mockResolvedValue({ status: 'failed', output: { recovery: { kind: 'provider_capacity' } } });
  await expect(caller().retry({ runId: RUN_ID })).rejects.toThrow(/only be retried from Needs attention/);
  expect(mocks.continuePipelineInBackground).not.toHaveBeenCalled();
});

const legacyChapters = [{title:'Merchant',text:Array.from({length:240},(_,i)=>'word'+i).join(' ')}];

describe('legacy contract recovery API',()=>{
  beforeEach(()=>{
    mocks.findPipelineRunById.mockResolvedValue(run({intakeParsed:{topic:'Market'},creationOptions:used(3)}));
    mocks.loadResolvedConfig.mockResolvedValue({videoKind:'long',targetSeconds:120,audioDefaultMoodTag:'none'});
    const checkpoint={inputHash:longPlanningInputHash({chapters:legacyChapters,topic:'Market',targetSeconds:120,audioLayerOverride:'none'},2),scenes:{'0:0':{words:'word0 word1 word2 word3 word4 word5',prompt:'paid'}}};
    mocks.findLatestAttempt.mockImplementation(async(_id,name)=>name==='gate1'?{status:'completed',output:{sanctionedScriptText:legacyChapters[0].text,chapters:legacyChapters}}:{status:'failed',error:'Video production planning for chapter 2 ("Merchant") was unusable twice: received 13 scenes, exactly 12 were requested',input:{scriptText:legacyChapters[0].text,fixNotes:null},output:{longPlanningCheckpoint:checkpoint}});
    mocks.claimPlannerContractRecovery.mockResolvedValue({status:'running'});
  });
  it('claims a validated legacy recovery without resetting or incrementing manual retries',async()=>{
    await caller().retry({runId:RUN_ID});
    expect(mocks.claimPlannerContractRecovery).toHaveBeenCalledTimes(1);
    expect(mocks.updatePipelineRun).not.toHaveBeenCalled();
    expect(mocks.continuePipelineInBackground).toHaveBeenCalledTimes(1);
  });
  it('does not enqueue work if another caller claimed recovery or the run changed',async()=>{
    mocks.claimPlannerContractRecovery.mockResolvedValue(undefined);
    await expect(caller().retry({runId:RUN_ID})).rejects.toThrow(/already started or the run changed/);
    expect(mocks.continuePipelineInBackground).not.toHaveBeenCalled();
  });
  it('does not consume the allowance when the weekly budget refuses it',async()=>{
    mocks.checkBudget.mockResolvedValue({ok:false});
    await expect(caller().retry({runId:RUN_ID})).rejects.toThrow(/Weekly budget/);
    expect(mocks.claimPlannerContractRecovery).not.toHaveBeenCalled();
  });
  it('refuses a second allowance and newly failed contracts at the ordinary cap',async()=>{
    mocks.findPipelineRunById.mockResolvedValue(run({intakeParsed:{topic:'Market'},creationOptions:{...used(3),plannerContractRecoveryUsed:true}}));
    await expect(caller().retry({runId:RUN_ID})).rejects.toThrow(/Retry limit/);
    expect(mocks.claimPlannerContractRecovery).not.toHaveBeenCalled();
  });
});
