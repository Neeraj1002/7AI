import { describe, it, expect, vi, beforeEach } from 'vitest';

// Sprint 5 Task 8 (R13): runs.updateSettings. Same mock layout as runs.retry.test.ts.
const mocks = vi.hoisted(() => ({
  findLatestAttempt: vi.fn(),
  listStagesForRun: vi.fn(),
  claimPlannerContractRecovery: vi.fn(),
  loadResolvedConfig: vi.fn(),
  findPipelineRunById: vi.fn(),
  updatePipelineRun: vi.fn(),
  findChannelById: vi.fn(),
  findUserById: vi.fn(),
  checkBudget: vi.fn(),
  continuePipelineInBackground: vi.fn(),
  readPublishingReceipt: vi.fn(),
  settingsPreflightIssues: vi.fn(),
  resolvePendingApproval: vi.fn(),
}));

vi.mock('../../run-pipeline/resolved-config', () => ({ loadResolvedConfig: mocks.loadResolvedConfig }));
vi.mock('../../models/repositories/review-log.repository', async (orig) => ({ ...(await orig<object>()), listReviewLogsForRun: async () => [] }));
vi.mock('../../models/repositories/pipeline-run.repository', () => ({
  findPipelineRunById: mocks.findPipelineRunById,
  updatePipelineRun: mocks.updatePipelineRun,
  claimPlannerContractRecovery: mocks.claimPlannerContractRecovery,
  listRuns: vi.fn(),
  CANCELLED_BY_USER: 'Cancelled by user',
}));
vi.mock('../../models/repositories/publishing-recovery.repository', () => ({ readPublishingReceipt: mocks.readPublishingReceipt }));
vi.mock('../../models/repositories/channel.repository', () => ({ findChannelById: mocks.findChannelById }));
vi.mock('../../models/repositories/user.repository', () => ({ findUserById: mocks.findUserById }));
vi.mock('../../run-pipeline/budget-gate', () => ({ checkBudget: mocks.checkBudget, describeBudgetRefusal: () => 'Weekly budget reached' }));
vi.mock('../../run-pipeline/pipeline-runner', () => ({ startPipelineInBackground: vi.fn(), continuePipelineInBackground: mocks.continuePipelineInBackground }));
vi.mock('../../notifications', async (orig) => ({ ...(await orig<object>()), resolvePendingApproval: mocks.resolvePendingApproval }));
vi.mock('../../run-pipeline/preflight-gate', () => ({ settingsPreflightIssues: mocks.settingsPreflightIssues }));
vi.mock('../../models/repositories/pipeline-stage.repository', async (orig) => ({
  ...(await orig<object>()),
  findLatestAttempt: mocks.findLatestAttempt,
  listStagesForRun: mocks.listStagesForRun,
}));

import { runsRouter } from './runs';

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const ctx = { tenantId: 't1', userId: 'u1', role: 'owner' } as never;
const caller = () => runsRouter.createCaller(ctx);

function run(over: Record<string, unknown> = {}) {
  return {
    id: RUN_ID, tenantId: 't1', channelId: 'c1', status: 'paused_gate1', currentStage: 'gate1', lastError: null, retryCount: 0,
    creationOptions: { videoKind: 'long', maxCostUsd: 0.5, resolvedOptions: { voice: { key: 'coral', label: 'Coral', from: 'default' }, visualSource: { value: 'ai-stills', label: 'AI images', from: 'default' }, music: { label: 'calm', from: 'default' }, targetSeconds: { value: 120, from: 'default' }, videoKind: 'long', formatKey: null } },
    createdAt: new Date(), startedAt: null, updatedAt: new Date(), ...over,
  };
}
const lastMerge = () => mocks.updatePipelineRun.mock.calls.at(-1)![1].creationOptionsMerge;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findLatestAttempt.mockResolvedValue(null);
  mocks.listStagesForRun.mockResolvedValue([]);
  mocks.findChannelById.mockResolvedValue({ id: 'c1', tenantId: 't1', ownerUserId: 'u1', isActive: true, platform: 'youtube', defaultPrivacyStatus: 'private', approvalGateConfig: { gate2Enabled: true } });
  mocks.findUserById.mockResolvedValue({ id: 'u1', name: 'Neeraj', email: 'n@example.com' });
  mocks.loadResolvedConfig.mockResolvedValue({ audioDefaultVoice: 'coral', audioDefaultMoodTag: 'calm', visualDefaultSource: 'ai-stills', videoKind: 'long', targetSeconds: 120 });
  mocks.checkBudget.mockResolvedValue({ ok: true });
  mocks.updatePipelineRun.mockImplementation(async (_id: string, patch: object) => ({ id: RUN_ID, ...patch }));
  mocks.readPublishingReceipt.mockResolvedValue(null);
  mocks.settingsPreflightIssues.mockResolvedValue([]);
  mocks.findPipelineRunById.mockResolvedValue(run());
  mocks.resolvePendingApproval.mockReturnValue({ resolved: true });
});

describe('runs.updateSettings', () => {
  it('at Gate 1 a voice change is free: one write with the history entry and refreshed options, no retry', async () => {
    mocks.findPipelineRunById.mockResolvedValue(run());
    const out = await caller().updateSettings({ runId: RUN_ID, voice: 'ballad-documentary' });
    expect(out.changes).toEqual([{ label: 'Voice', from: 'Coral', to: 'Ballad (documentary)' }]);
    expect(mocks.updatePipelineRun).toHaveBeenCalledTimes(1);
    const merge = lastMerge();
    expect(merge.voice).toBe('ballad-documentary');
    expect(merge.resolvedOptions.voice).toEqual({ key: 'ballad-documentary', label: 'Ballad (documentary)', from: 'run' });
    expect(merge.settingsChanges).toHaveLength(1);
    expect(merge.settingsChanges[0]).toMatchObject({ by: { userId: 'u1', name: 'Neeraj' }, changes: [{ label: 'Voice', from: 'Coral', to: 'Ballad (documentary)' }] });
    expect(mocks.continuePipelineInBackground).not.toHaveBeenCalled();
  });

  it('keeps the earlier history entries and appends', async () => {
    const earlier = { at: '2026-10-19T00:00:00.000Z', by: { userId: 'u1', name: 'Neeraj' }, changes: [{ label: 'Max spend', from: '$0.50', to: '$1.00' }] };
    mocks.findPipelineRunById.mockResolvedValue(run({ creationOptions: { videoKind: 'long', maxCostUsd: 1, settingsChanges: [earlier] } }));
    await caller().updateSettings({ runId: RUN_ID, audioLayer: 'tense' });
    expect(lastMerge().settingsChanges).toHaveLength(2);
    expect(lastMerge().settingsChanges[0]).toEqual(earlier);
  });

  it('at Gate 2 the video is made: voice, music and pictures are refused with a one-line reason, and nothing is written', async () => {
    mocks.findPipelineRunById.mockResolvedValue(run({ status: 'paused_gate2', currentStage: 'gate2' }));
    for (const change of [{ voice: 'onyx' }, { audioLayer: 'tense' }, { visualSource: 'stock-footage' }]) {
      await expect(caller().updateSettings({ runId: RUN_ID, ...change } as never)).rejects.toThrow(/already made.*Revise at Gate 2/);
    }
    expect(mocks.updatePipelineRun).not.toHaveBeenCalled();
  });

  it('at Gate 2 visibility and max spend are still allowed', async () => {
    mocks.findPipelineRunById.mockResolvedValue(run({ status: 'paused_gate2', currentStage: 'gate2' }));
    const out = await caller().updateSettings({ runId: RUN_ID, privacyStatus: 'unlisted', maxCostUsd: 1.5 });
    expect(out.changes.map((c) => c.label)).toEqual(['YouTube visibility', 'Max spend']);
    expect(lastMerge()).toMatchObject({ privacyStatus: 'unlisted', maxCostUsd: 1.5 });
  });

  it('a failed review that Retry would not redo (video made, review blocked) refuses a voice change but allows visibility', async () => {
    mocks.findPipelineRunById.mockResolvedValue(run({ status: 'needs_attention', currentStage: 'video_review', lastError: 'provider limit' }));
    await expect(caller().updateSettings({ runId: RUN_ID, voice: 'onyx' })).rejects.toThrow(/already made/);
    await expect(caller().updateSettings({ runId: RUN_ID, privacyStatus: 'public' })).resolves.toBeDefined();
  });

  it('retry:true applies the change and the Retry in one write, with the same rules as runs.retry', async () => {
    mocks.findPipelineRunById.mockResolvedValue(run({ status: 'needs_attention', currentStage: 'video_generation', lastError: 'Spend limit reached' }));
    await caller().updateSettings({ runId: RUN_ID, voice: 'onyx', maxCostUsd: 2, retry: true });
    expect(mocks.updatePipelineRun).toHaveBeenCalledTimes(2); // the manual-retry count, then the single settings+retry write
    const [, patch] = mocks.updatePipelineRun.mock.calls.at(-1)!;
    expect(patch).toMatchObject({ status: 'running', lastError: null });
    expect(patch.creationOptionsMerge).toMatchObject({ voice: 'onyx', maxCostUsd: 2 });
    expect(patch.creationOptionsMerge.settingsChanges[0].changes.map((c: { label: string }) => c.label)).toEqual(['Voice', 'Max spend']);
    expect(mocks.continuePipelineInBackground).toHaveBeenCalledWith(RUN_ID);
  });

  it('retry:true is refused with retry\'s own cap message, and changes nothing', async () => {
    mocks.findPipelineRunById.mockResolvedValue(run({ status: 'needs_attention', currentStage: 'video_generation', creationOptions: { videoKind: 'long', manualRetries: { video_generation: 3 } } }));
    await expect(caller().updateSettings({ runId: RUN_ID, voice: 'onyx', retry: true })).rejects.toThrow(/Retry limit reached for this step \(3\)/);
    expect(mocks.updatePipelineRun).not.toHaveBeenCalled();
  });

  it('retry:true is only for a run in Needs attention', async () => {
    await expect(caller().updateSettings({ runId: RUN_ID, voice: 'onyx', retry: true })).rejects.toThrow(/only applies to a run in Needs attention/);
  });

  it('the preflight for the options as they would be blocks the save with its message, writing nothing', async () => {
    mocks.settingsPreflightIssues.mockResolvedValue([{ check: 'music', setting: 'Music', message: "No audio-bed track found for mood 'tense'. Pick another music mood or add the track." }]);
    await expect(caller().updateSettings({ runId: RUN_ID, audioLayer: 'tense' })).rejects.toThrow(/No audio-bed track/);
    expect(mocks.updatePipelineRun).not.toHaveBeenCalled();
    // it was asked about the new options and the stage the change touches
    expect(mocks.settingsPreflightIssues.mock.calls[0][1]).toEqual(['video_generation']);
    expect(mocks.settingsPreflightIssues.mock.calls[0][2]).toMatchObject({ audioLayer: 'tense' });
  });

  it('max spend uses the same rule as runs.retry: a long video only, under the ceiling', async () => {
    mocks.findPipelineRunById.mockResolvedValue(run({ creationOptions: { videoKind: undefined } }));
    await expect(caller().updateSettings({ runId: RUN_ID, maxCostUsd: 1 })).rejects.toThrow('A spend limit can only be set for a long video');
    mocks.findPipelineRunById.mockResolvedValue(run());
    await expect(caller().updateSettings({ runId: RUN_ID, maxCostUsd: 100000 })).rejects.toThrow(/cannot be more than/);
    expect(mocks.updatePipelineRun).not.toHaveBeenCalled();
  });

  it('long videos still refuse stock footage with run creation\'s message', async () => {
    mocks.loadResolvedConfig.mockResolvedValue({ audioDefaultVoice: 'coral', audioDefaultMoodTag: 'calm', visualDefaultSource: null, videoKind: 'long', targetSeconds: 120 });
    await expect(caller().updateSettings({ runId: RUN_ID, visualSource: 'stock-footage' })).rejects.toThrow('Long videos use AI stills only; stock footage is not available for them');
  });

  it('with Gate 2 off only private is allowed, and a video already on YouTube cannot change visibility', async () => {
    mocks.findChannelById.mockResolvedValue({ id: 'c1', tenantId: 't1', ownerUserId: 'u1', isActive: true, platform: 'youtube', defaultPrivacyStatus: 'private', approvalGateConfig: { gate2Enabled: false } });
    await expect(caller().updateSettings({ runId: RUN_ID, privacyStatus: 'public' })).rejects.toThrow(/Gate 2 is off/);
    mocks.findChannelById.mockResolvedValue({ id: 'c1', tenantId: 't1', ownerUserId: 'u1', isActive: true, platform: 'youtube', defaultPrivacyStatus: 'private', approvalGateConfig: { gate2Enabled: true } });
    mocks.readPublishingReceipt.mockResolvedValue({ youtubeVideoId: 'abc' });
    await expect(caller().updateSettings({ runId: RUN_ID, privacyStatus: 'public' })).rejects.toThrow(/already on YouTube/);
  });

  it('refuses a run that is not waiting, an unknown voice, and a save that changes nothing', async () => {
    mocks.findPipelineRunById.mockResolvedValue(run({ status: 'running' }));
    await expect(caller().updateSettings({ runId: RUN_ID, voice: 'onyx' })).rejects.toThrow(/while a run is waiting/);
    mocks.findPipelineRunById.mockResolvedValue(run());
    await expect(caller().updateSettings({ runId: RUN_ID, voice: 'robot' as never })).rejects.toThrow();
    await expect(caller().updateSettings({ runId: RUN_ID, voice: 'coral' })).rejects.toThrow(/Nothing to change/);
    expect(mocks.updatePipelineRun).not.toHaveBeenCalled();
  });

  it('shows the visibility the run really has as the "from" side: its own choice, else Gate 2\'s, else the channel default', async () => {
    mocks.findPipelineRunById.mockResolvedValue(run({ creationOptions: { videoKind: 'long' }, status: 'needs_attention', currentStage: 'publishing' }));
    mocks.listStagesForRun.mockResolvedValue([{ stageName: 'gate2', status: 'completed', attemptNumber: 1, output: { outcome: 'approve', privacyStatus: 'public' } }]);
    const out = await caller().updateSettings({ runId: RUN_ID, privacyStatus: 'unlisted' });
    expect(out.changes).toEqual([{ label: 'YouTube visibility', from: 'Public', to: 'Unlisted' }]);
  });
});

describe('Gate 2 and the per-run visibility', () => {
  it('approving without an explicit choice uses the visibility set earlier, else the channel default', async () => {
    mocks.findPipelineRunById.mockResolvedValue(run({ status: 'paused_gate2', currentStage: 'gate2', creationOptions: { privacyStatus: 'unlisted' } }));
    await caller().gate2({ runId: RUN_ID, action: 'approve' });
    expect(mocks.resolvePendingApproval.mock.calls[0][1].reply).toBe('approve unlisted');
    mocks.findPipelineRunById.mockResolvedValue(run({ status: 'paused_gate2', currentStage: 'gate2', creationOptions: {} }));
    await caller().gate2({ runId: RUN_ID, action: 'approve' });
    expect(mocks.resolvePendingApproval.mock.calls[1][1].reply).toBe('approve private');
  });

  it('an explicit choice at Gate 2 wins over the earlier one', async () => {
    mocks.findPipelineRunById.mockResolvedValue(run({ status: 'paused_gate2', currentStage: 'gate2', creationOptions: { privacyStatus: 'unlisted' } }));
    await caller().gate2({ runId: RUN_ID, action: 'approve', privacyStatus: 'public' });
    expect(mocks.resolvePendingApproval.mock.calls[0][1].reply).toBe('approve public');
  });
});
