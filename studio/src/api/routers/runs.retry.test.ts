import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findPipelineRunById: vi.fn(),
  updatePipelineRun: vi.fn(),
  findChannelById: vi.fn(),
  checkBudget: vi.fn(),
  resolvePendingApproval: vi.fn(),
  continuePipelineInBackground: vi.fn(),
}));

vi.mock('../../models/repositories/pipeline-run.repository', () => ({
  findPipelineRunById: mocks.findPipelineRunById,
  updatePipelineRun: mocks.updatePipelineRun,
  listRuns: vi.fn(),
  CANCELLED_BY_USER: 'Cancelled by user',
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

import { runsRouter } from './runs';

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
  mocks.findChannelById.mockResolvedValue({ id: 'c1', tenantId: 't1', ownerUserId: 'u1', isActive: true, platform: 'youtube', defaultPrivacyStatus: 'private' });
  mocks.checkBudget.mockResolvedValue({ ok: true });
  mocks.updatePipelineRun.mockResolvedValue({});
  mocks.resolvePendingApproval.mockReturnValue({ resolved: true });
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
