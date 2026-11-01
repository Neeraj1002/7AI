import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFAULT_TTS_VOICE } from '../../media';

const mocks = vi.hoisted(() => ({
  findChannelById: vi.fn(),
  listActiveChannelsByTenant: vi.fn(),
  findActiveProfileDataByChannelIds: vi.fn(),
  findByChannel: vi.fn(),
}));

vi.mock('../../models/repositories/channel.repository', () => ({
  findChannelById: mocks.findChannelById,
  listActiveChannelsByTenant: mocks.listActiveChannelsByTenant,
  updateChannel: vi.fn(),
  updateChannelBrandAssets: vi.fn(),
  updateChannelApprovalGateConfig: vi.fn(),
  archiveChannel: vi.fn(),
}));
vi.mock('../../models/repositories/channel-profile-version.repository', () => ({
  findActiveProfileForChannel: vi.fn(),
  findActiveProfileDataByChannelIds: mocks.findActiveProfileDataByChannelIds,
  insertProfileVersion: vi.fn(),
  listProfileVersionsForChannel: vi.fn(),
}));
vi.mock('../../models/repositories/agent-credential.repository', () => ({
  findByChannel: mocks.findByChannel,
  deleteForChannel: vi.fn(),
}));

import { channelsRouter } from './channels';

const A = '33333333-3333-4333-8333-333333333333';
const B = '44444444-4444-4444-8444-444444444444';
const caller = () => channelsRouter.createCaller({ tenantId: 't1', userId: 'u1', role: 'owner' } as never);
const channel = (id: string) => ({ id, tenantId: 't1', brandAssets: {}, name: id });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findByChannel.mockResolvedValue(null);
});

describe('channels read: defaultVoice comes from the active profile', () => {
  it('list sends the profile voice, or the platform default, from one profile query', async () => {
    mocks.listActiveChannelsByTenant.mockResolvedValue([channel(A), channel(B)]);
    mocks.findActiveProfileDataByChannelIds.mockResolvedValue(new Map([[A, { audio: { defaultVoice: 'onyx' } }]]));
    const out = await caller().list();
    expect(out.map((c) => c.defaultVoice)).toEqual(['onyx', DEFAULT_TTS_VOICE]);
    expect(mocks.findActiveProfileDataByChannelIds).toHaveBeenCalledTimes(1);
    expect(mocks.findActiveProfileDataByChannelIds).toHaveBeenCalledWith([A, B]);
  });

  it('get sends the profile voice, and the platform default for a channel with no profile', async () => {
    mocks.findChannelById.mockResolvedValue(channel(A));
    mocks.findActiveProfileDataByChannelIds.mockResolvedValue(new Map([[A, { audio: { defaultVoice: 'nova' } }]]));
    expect((await caller().get({ channelId: A })).defaultVoice).toBe('nova');
    mocks.findActiveProfileDataByChannelIds.mockResolvedValue(new Map());
    expect((await caller().get({ channelId: A })).defaultVoice).toBe(DEFAULT_TTS_VOICE);
  });

  it('a profile without a voice sends the platform default', async () => {
    mocks.findChannelById.mockResolvedValue(channel(A));
    mocks.findActiveProfileDataByChannelIds.mockResolvedValue(new Map([[A, { script: { guide: 'g' } }]]));
    expect((await caller().get({ channelId: A })).defaultVoice).toBe(DEFAULT_TTS_VOICE);
  });
});
