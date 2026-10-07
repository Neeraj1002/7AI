import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findPipelineRunById: vi.fn(),
  updatePipelineRun: vi.fn(),
  findChannelById: vi.fn(),
  listStagesForRun: vi.fn(),
  resolvePendingApproval: vi.fn(),
}));

vi.mock('../../models/repositories/pipeline-run.repository', () => ({
  findPipelineRunById: mocks.findPipelineRunById,
  updatePipelineRun: mocks.updatePipelineRun,
  listRuns: vi.fn(),
  CANCELLED_BY_USER: 'Cancelled by user',
}));
vi.mock('../../models/repositories/channel.repository', () => ({ findChannelById: mocks.findChannelById }));
vi.mock('../../models/repositories/pipeline-stage.repository', async (orig) => ({
  ...(await orig<object>()),
  listStagesForRun: mocks.listStagesForRun,
}));
vi.mock('../../notifications', async (orig) => ({
  ...(await orig<object>()),
  resolvePendingApproval: mocks.resolvePendingApproval,
}));

import { runsRouter } from './runs';
import { markDriven, unmarkDriven, isCancellationRequested, clearCancellation } from '../../run-pipeline/cancellation-registry';

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const ctx = { tenantId: 't1', userId: 'u1', role: 'owner' } as never;
const caller = () => runsRouter.createCaller(ctx);

function run(over: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    id: RUN_ID, tenantId: 't1', channelId: 'c1', status: 'running', currentStage: 'video_generation',
    lastError: null, createdAt: over.updatedAt ?? now, startedAt: null, updatedAt: now, ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clearCancellation(RUN_ID);
  unmarkDriven(RUN_ID);
  mocks.findChannelById.mockResolvedValue({ id: 'c1', tenantId: 't1', ownerUserId: 'u1', isActive: true });
  mocks.listStagesForRun.mockResolvedValue([]);
  mocks.updatePipelineRun.mockResolvedValue({});
});

describe('runs.cancel', () => {
  it('ends a running run no loop is driving immediately', async () => {
    mocks.findPipelineRunById.mockResolvedValue(run());
    const out = await caller().cancel({ runId: RUN_ID });
    expect(out).toEqual({ cancelled: true, immediate: true, alreadyEnded: false });
    expect(mocks.updatePipelineRun).toHaveBeenCalledWith(RUN_ID, { status: 'failed', lastError: 'Cancelled by user' });
    expect(isCancellationRequested(RUN_ID)).toBe(true); // a stalled loop that wakes later still stops
  });

  it('leaves an actively driven run to its loop', async () => {
    markDriven(RUN_ID);
    mocks.findPipelineRunById.mockResolvedValue(run());
    const out = await caller().cancel({ runId: RUN_ID });
    expect(out).toEqual({ cancelled: true, immediate: false, alreadyEnded: false });
    expect(mocks.updatePipelineRun).not.toHaveBeenCalled();
    expect(isCancellationRequested(RUN_ID)).toBe(true);
  });

  it('treats a driven run with no progress past the stale threshold as not driven', async () => {
    markDriven(RUN_ID);
    const old = new Date(Date.now() - 11 * 60 * 1000);
    mocks.findPipelineRunById.mockResolvedValue(run({ updatedAt: old }));
    mocks.listStagesForRun.mockResolvedValue([{ createdAt: old, startedAt: old, completedAt: null, updatedAt: old }]);
    const out = await caller().cancel({ runId: RUN_ID });
    expect(out.immediate).toBe(true);
  });

  it('a recent stage-row write keeps an old run row "driven"', async () => {
    markDriven(RUN_ID);
    mocks.findPipelineRunById.mockResolvedValue(run({ updatedAt: new Date(Date.now() - 30 * 60 * 1000) }));
    mocks.listStagesForRun.mockResolvedValue([{ createdAt: new Date(), startedAt: new Date(), completedAt: null, updatedAt: new Date() }]);
    const out = await caller().cancel({ runId: RUN_ID });
    expect(out.immediate).toBe(false);
  });

  it('needs_attention is cancelled immediately', async () => {
    mocks.findPipelineRunById.mockResolvedValue(run({ status: 'needs_attention' }));
    expect(await caller().cancel({ runId: RUN_ID })).toEqual({ cancelled: true, immediate: true, alreadyEnded: false });
  });

  it('a gate-paused run cancelled through its pending approval is immediate', async () => {
    mocks.findPipelineRunById.mockResolvedValue(run({ status: 'paused_gate1' }));
    mocks.resolvePendingApproval.mockReturnValue({ resolved: true });
    expect(await caller().cancel({ runId: RUN_ID })).toEqual({ cancelled: true, immediate: true, alreadyEnded: false });
    expect(mocks.resolvePendingApproval).toHaveBeenCalledWith(RUN_ID, 'reject Cancelled by user');
  });

  it('is idempotent on a run already ended as a cancel', async () => {
    mocks.findPipelineRunById.mockResolvedValue(run({ status: 'failed', lastError: 'Cancelled by user' }));
    expect(await caller().cancel({ runId: RUN_ID })).toEqual({ cancelled: true, immediate: false, alreadyEnded: true });
    expect(mocks.updatePipelineRun).not.toHaveBeenCalled();
  });

  it('does not report a completed run as cancelled', async () => {
    mocks.findPipelineRunById.mockResolvedValue(run({ status: 'completed' }));
    expect(await caller().cancel({ runId: RUN_ID })).toEqual({ cancelled: false, immediate: false, alreadyEnded: true });
  });

  it('does not report an otherwise failed run as cancelled', async () => {
    mocks.findPipelineRunById.mockResolvedValue(run({ status: 'failed', lastError: 'Channel deleted' }));
    expect(await caller().cancel({ runId: RUN_ID })).toEqual({ cancelled: false, immediate: false, alreadyEnded: true });
  });
});

describe('cancelRequested on runs.get', () => {
  it('is true while a request is recorded and the run has not ended, false once it ended', async () => {
    mocks.findPipelineRunById.mockResolvedValue(run());
    expect((await caller().get({ id: RUN_ID })).cancelRequested).toBe(false);
    markDriven(RUN_ID);
    await caller().cancel({ runId: RUN_ID });
    expect((await caller().get({ id: RUN_ID })).cancelRequested).toBe(true);
    mocks.findPipelineRunById.mockResolvedValue(run({ status: 'failed', lastError: 'Cancelled by user' }));
    const ended = await caller().get({ id: RUN_ID });
    expect(ended.cancelRequested).toBe(false);
    expect(ended.endReason).toBe('cancelled');
  });
});
