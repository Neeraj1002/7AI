import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findChannelById: vi.fn(),
  findByChannel: vi.fn(),
  updatePipelineRun: vi.fn(),
  sumUsageCostForRun: vi.fn(),
  loadResolvedConfig: vi.fn(),
}));
vi.mock('../models/repositories/channel.repository', () => ({ findChannelById: mocks.findChannelById }));
vi.mock('../models/repositories/agent-credential.repository', () => ({ findByChannel: mocks.findByChannel }));
vi.mock('../models/repositories/pipeline-run.repository', () => ({ updatePipelineRun: mocks.updatePipelineRun }));
vi.mock('../models/repositories/usage-event.repository', () => ({ sumUsageCostForRun: mocks.sumUsageCostForRun }));
vi.mock('./resolved-config', () => ({ loadResolvedConfig: mocks.loadResolvedConfig }));

import { preflightGate } from './preflight-gate';

const baseConfig = { audioDefaultVoice: 'coral', videoKind: 'long', targetSeconds: 120, visualSecondsPerStill: 5, audioDefaultMoodTag: 'inspirational' };
const deps = () => ({ probeProvider: vi.fn().mockResolvedValue(undefined), musicTracks: vi.fn().mockReturnValue([]), spentUsd: vi.fn().mockResolvedValue(0) });
const run = (extra: Record<string, unknown> = {}) => ({ id: 'r1', channelId: 'c1', creationOptions: { maxCostUsd: 1, ...extra } }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findChannelById.mockResolvedValue({ id: 'c1', brandAssets: {} });
  mocks.findByChannel.mockResolvedValue({ id: 'cred' });
  mocks.loadResolvedConfig.mockResolvedValue(baseConfig);
  mocks.updatePipelineRun.mockImplementation(async (_id, patch) => ({ id: 'r1', ...patch }));
});

describe('preflightGate', () => {
  it('lets a healthy run through and writes nothing', async () => {
    expect(await preflightGate(run(), 'video_generation', deps(), false)).toBeNull();
    expect(mocks.updatePipelineRun).not.toHaveBeenCalled();
  });

  it('parks the run in needs_attention with the message and the block record, before any spend', async () => {
    mocks.loadResolvedConfig.mockResolvedValue({ ...baseConfig, audioDefaultVoice: 'robot' });
    const blocked = await preflightGate(run(), 'video_generation', deps(), false);
    expect(blocked).toMatchObject({ status: 'needs_attention', currentStage: 'video_generation' });
    const patch = mocks.updatePipelineRun.mock.calls[0][1];
    expect(patch.lastError).toMatch(/Stopped before spending anything.*Voice/);
    expect(patch.creationOptionsMerge.preflightBlock.issues[0]).toMatchObject({ check: 'voice', setting: 'Voice' });
  });

  it('clears an earlier block once the checks pass', async () => {
    const earlier = { stage: 'video_generation', at: 'x', issues: [{ check: 'voice', setting: 'Voice', message: 'm' }] };
    expect(await preflightGate(run({ preflightBlock: earlier }), 'video_generation', deps(), false)).toBeNull();
    expect(mocks.updatePipelineRun).toHaveBeenCalledWith('r1', { creationOptionsMerge: { preflightBlock: null } });
  });

  it('is skipped entirely when disabled (tests and stubbed dry runs)', async () => {
    mocks.loadResolvedConfig.mockResolvedValue({ ...baseConfig, audioDefaultVoice: 'robot' });
    expect(await preflightGate(run(), 'video_generation', deps(), true)).toBeNull();
  });

  it('blocks publishing for a channel flagged as needing a YouTube reconnect', async () => {
    mocks.findChannelById.mockResolvedValue({ id: 'c1', brandAssets: { youtubeAuthError: { at: 'x', code: 'invalid_grant' } } });
    const blocked = await preflightGate(run(), 'publishing', deps(), false);
    expect(blocked).toMatchObject({ status: 'needs_attention', currentStage: 'publishing' });
  });
});
