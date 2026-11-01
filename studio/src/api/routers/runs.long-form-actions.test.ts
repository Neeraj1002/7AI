import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findPipelineRunById: vi.fn(),
  updatePipelineRun: vi.fn(),
  findChannelById: vi.fn(),
  findByChannel: vi.fn(),
  findActiveProfileForChannel: vi.fn(),
  checkBudget: vi.fn(),
  getRemainingWeeklyUsd: vi.fn(),
  resolvePendingApproval: vi.fn(),
  continuePipelineInBackground: vi.fn(),
  createRun: vi.fn(),
}));

vi.mock('../../models/repositories/pipeline-run.repository', () => ({
  findPipelineRunById: mocks.findPipelineRunById,
  updatePipelineRun: mocks.updatePipelineRun,
  listRuns: vi.fn(),
  CANCELLED_BY_USER: 'Cancelled by user',
}));
vi.mock('../../models/repositories/channel.repository', () => ({ findChannelById: mocks.findChannelById }));
vi.mock('../../models/repositories/agent-credential.repository', () => ({ findByChannel: mocks.findByChannel }));
vi.mock('../../models/repositories/channel-profile-version.repository', () => ({
  findActiveProfileForChannel: mocks.findActiveProfileForChannel,
  findProfileVersionById: vi.fn(),
}));
vi.mock('../../run-pipeline/state-machine', () => ({ createRun: mocks.createRun }));
vi.mock('../../run-pipeline/budget-gate', () => ({
  checkBudget: mocks.checkBudget,
  describeBudgetRefusal: () => 'Weekly budget reached',
  getRemainingWeeklyUsd: mocks.getRemainingWeeklyUsd,
  NoBudgetConfiguredError: class NoBudgetConfiguredError extends Error {},
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
import { formatChapterSheet } from '../../agents/script-generation/long-form';

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const CHANNEL_ID = '22222222-2222-4222-8222-222222222222';
const ctx = { tenantId: 't1', userId: 'u1', role: 'owner' } as never;
const caller = () => runsRouter.createCaller(ctx);

const run = (over: Record<string, unknown> = {}) => ({
  id: RUN_ID, tenantId: 't1', channelId: CHANNEL_ID, status: 'needs_attention', currentStage: 'video_generation',
  lastError: 'Spend limit reached', creationOptions: { videoKind: 'long', targetDurationSec: 600, maxCostUsd: 3 },
  createdAt: new Date(), startedAt: null, updatedAt: new Date(), ...over,
});
const chapter = (title: string) => ({ title, text: `${title}? ${Array(30).fill('word').join(' ')}.` });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findChannelById.mockResolvedValue({
    id: CHANNEL_ID, tenantId: 't1', ownerUserId: 'u1', name: 'Chan', isActive: true, platform: 'youtube',
    defaultPrivacyStatus: 'private',
  });
  mocks.findByChannel.mockResolvedValue({ id: 'cred' });
  mocks.findActiveProfileForChannel.mockResolvedValue(null);
  mocks.checkBudget.mockResolvedValue({ ok: true });
  mocks.getRemainingWeeklyUsd.mockResolvedValue(10);
  mocks.updatePipelineRun.mockResolvedValue({});
  mocks.resolvePendingApproval.mockReturnValue({ resolved: true });
  mocks.createRun.mockResolvedValue({ id: 'run1' });
});

describe('runs.create weekly pre-check (R7.2)', () => {
  it('refuses a long video that does not fit what is left this week, stating both numbers', async () => {
    mocks.getRemainingWeeklyUsd.mockResolvedValue(0.8);
    await expect(caller().create({ channelId: CHANNEL_ID, briefText: 'b', videoKind: 'long' })).rejects.toThrow(
      /Estimated \$1\.\d\d for this video, \$0\.80 left this week for this channel/,
    );
    expect(mocks.createRun).not.toHaveBeenCalled();
  });

  it('accepts it when one attempt fits', async () => {
    mocks.getRemainingWeeklyUsd.mockResolvedValue(2.5);
    await caller().create({ channelId: CHANNEL_ID, briefText: 'b', videoKind: 'long' });
    expect(mocks.createRun).toHaveBeenCalledOnce();
  });

  it('never checks the weekly budget for a Short (unchanged)', async () => {
    await caller().create({ channelId: CHANNEL_ID, briefText: 'b' });
    expect(mocks.getRemainingWeeklyUsd).not.toHaveBeenCalled();
  });
});

describe('runs.gate1 edit on a long script (R2.5)', () => {
  it('refuses an edit that parses into fewer than 3 chapters, before the gate is touched', async () => {
    mocks.findPipelineRunById.mockResolvedValue(run({ status: 'paused_gate1', currentStage: 'gate1' }));
    await expect(
      caller().gate1({ runId: RUN_ID, action: 'edit', editedScriptText: formatChapterSheet([chapter('One'), chapter('Two')]) }),
    ).rejects.toThrow(/at least 3 chapters/);
    expect(mocks.resolvePendingApproval).not.toHaveBeenCalled();
  });

  it('passes a good chapter sheet through unchanged', async () => {
    mocks.findPipelineRunById.mockResolvedValue(run({ status: 'paused_gate1', currentStage: 'gate1' }));
    const sheet = formatChapterSheet([chapter('One'), chapter('Two'), chapter('Three')]);
    await caller().gate1({ runId: RUN_ID, action: 'edit', editedScriptText: sheet });
    expect(mocks.resolvePendingApproval).toHaveBeenCalledWith(RUN_ID, { reply: sheet, userId: 'u1' });
  });

  it('a Short edit is free text, exactly as before', async () => {
    mocks.findPipelineRunById.mockResolvedValue(run({ status: 'paused_gate1', currentStage: 'gate1', creationOptions: null }));
    await caller().gate1({ runId: RUN_ID, action: 'edit', editedScriptText: 'just one blob' });
    expect(mocks.resolvePendingApproval).toHaveBeenCalledWith(RUN_ID, { reply: 'just one blob', userId: 'u1' });
  });
});

describe('runs.retry with a higher spend limit (R7.3)', () => {
  it('stores the new limit on a long run and continues it', async () => {
    mocks.findPipelineRunById.mockResolvedValue(run());
    await caller().retry({ runId: RUN_ID, maxCostUsd: 5 });
    expect(mocks.updatePipelineRun).toHaveBeenCalledWith(RUN_ID, expect.objectContaining({ creationOptionsMerge: { maxCostUsd: 5 } }));
    expect(mocks.continuePipelineInBackground).toHaveBeenCalledWith(RUN_ID);
  });

  it('refuses a limit above the absolute cap, and any limit on a Short', async () => {
    mocks.findPipelineRunById.mockResolvedValue(run());
    await expect(caller().retry({ runId: RUN_ID, maxCostUsd: 50 })).rejects.toThrow(/cannot be more than \$10\.00/);
    mocks.findPipelineRunById.mockResolvedValue(run({ creationOptions: null }));
    await expect(caller().retry({ runId: RUN_ID, maxCostUsd: 5 })).rejects.toThrow(/only be set for a long video/);
    expect(mocks.continuePipelineInBackground).not.toHaveBeenCalled();
  });

  it('a plain Retry does not touch the limit', async () => {
    mocks.findPipelineRunById.mockResolvedValue(run());
    await caller().retry({ runId: RUN_ID });
    expect(mocks.updatePipelineRun.mock.calls.at(-1)![1]).not.toHaveProperty('creationOptionsMerge', { maxCostUsd: expect.anything() });
  });
});
