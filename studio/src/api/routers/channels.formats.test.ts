import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findChannelById: vi.fn(),
  findActiveProfileForChannel: vi.fn(),
}));

vi.mock('../../models/repositories/channel.repository', () => ({
  findChannelById: mocks.findChannelById,
  listActiveChannelsByTenant: vi.fn(),
  updateChannel: vi.fn(),
  updateChannelBrandAssets: vi.fn(),
  updateChannelApprovalGateConfig: vi.fn(),
  archiveChannel: vi.fn(),
}));
vi.mock('../../models/repositories/channel-profile-version.repository', () => ({
  findActiveProfileForChannel: mocks.findActiveProfileForChannel,
  insertProfileVersion: vi.fn(),
  listProfileVersionsForChannel: vi.fn(),
}));

import { channelsRouter } from './channels';
import { CONTENT_FORMATS } from '../../formats/manifest';

const CHANNEL_ID = '33333333-3333-4333-8333-333333333333';
const caller = () => channelsRouter.createCaller({ tenantId: 't1', userId: 'u1', role: 'owner' } as never);
const offered = (keys?: string[]) => mocks.findActiveProfileForChannel.mockResolvedValue({ data: keys ? { offeredFormatKeys: keys } : {} });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findChannelById.mockResolvedValue({ id: CHANNEL_ID, tenantId: 't1' });
  mocks.findActiveProfileForChannel.mockResolvedValue(null);
});

describe('channels.listFormats', () => {
  it('without input returns every format, each with videoKind', async () => {
    const all = await caller().listFormats();
    expect(all).toHaveLength(CONTENT_FORMATS.length);
    expect(all.every((f) => f.videoKind === 'short' || f.videoKind === 'long')).toBe(true);
    expect(await caller().listFormats({})).toEqual(all);
  });

  it('videoKind alone filters the full list', async () => {
    const long = await caller().listFormats({ videoKind: 'long' });
    expect(long.map((f) => f.key)).toEqual(['chaptered-explainer']);
    expect((await caller().listFormats({ videoKind: 'short' })).length).toBe(CONTENT_FORMATS.length - 1);
  });

  it('with channelId returns only the profile formats, in the profile order', async () => {
    offered(['top-3', 'chaptered-explainer', 'countdown']);
    const out = await caller().listFormats({ channelId: CHANNEL_ID });
    expect(out.map((f) => f.key)).toEqual(['top-3', 'chaptered-explainer', 'countdown']);
    expect(Object.keys(out[0]!).sort()).toEqual(
      ['briefTemplate', 'key', 'label', 'scriptStructure', 'targetSeconds', 'videoKind'],
    );
  });

  it('channelId then videoKind filters after the profile list', async () => {
    offered(['top-3', 'chaptered-explainer', 'countdown']);
    expect((await caller().listFormats({ channelId: CHANNEL_ID, videoKind: 'long' })).map((f) => f.key)).toEqual(['chaptered-explainer']);
    expect((await caller().listFormats({ channelId: CHANNEL_ID, videoKind: 'short' })).map((f) => f.key)).toEqual(['top-3', 'countdown']);
  });

  it('an empty list, an older profile version and no profile at all give []', async () => {
    offered([]);
    expect(await caller().listFormats({ channelId: CHANNEL_ID })).toEqual([]);
    offered(undefined);
    expect(await caller().listFormats({ channelId: CHANNEL_ID })).toEqual([]);
    mocks.findActiveProfileForChannel.mockResolvedValue(null);
    expect(await caller().listFormats({ channelId: CHANNEL_ID })).toEqual([]);
  });

  it("another tenant's channel reads as not found", async () => {
    mocks.findChannelById.mockResolvedValue({ id: CHANNEL_ID, tenantId: 'other' });
    await expect(caller().listFormats({ channelId: CHANNEL_ID })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
