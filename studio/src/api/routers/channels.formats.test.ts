import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findChannelById: vi.fn(),
  findActiveProfileForChannel: vi.fn(),
  insertProfileVersion: vi.fn(),
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
  insertProfileVersion: mocks.insertProfileVersion,
  listProfileVersionsForChannel: vi.fn(),
}));

import { channelsRouter } from './channels';
import { CONTENT_FORMATS } from '../../formats/manifest';

const CHANNEL_ID = '33333333-3333-4333-8333-333333333333';
const caller = () => channelsRouter.createCaller({ tenantId: 't1', userId: 'u1', role: 'owner' } as never);
const offered = (keys?: string[]) => mocks.findActiveProfileForChannel.mockResolvedValue({ data: keys ? { offeredFormatKeys: keys } : {} });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findChannelById.mockResolvedValue({ id: CHANNEL_ID, tenantId: 't1', isActive: true });
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

describe('channels.directionPresets and profile contract', () => {
  it('returns server wording and the five presets', async () => {
    const presets = await caller().directionPresets();
    expect(presets.map((p) => p.key)).toEqual(['history', 'story-first', 'explainer', 'neutral', 'puzzle-reveal']);
    expect(presets[0]).toMatchObject({ version: 1, label: 'History documentary' });
    expect(presets[0]?.parts.find((part) => part.key === 'persona')?.text).toContain('documentary storyteller');
  });

  it.each(['puzzle-reveal', 'explainer'])('saves and reopens %s with and without a note', async (preset) => {
    mocks.insertProfileVersion.mockImplementation(async ({ data }) => ({ id: 'saved', data }));
    for (const note of [undefined, 'Let viewers inspect the evidence.']) {
      const direction = note ? { preset, note } : { preset };
      const saved = await caller().createProfileVersion({ channelId: CHANNEL_ID, data: { direction } });
      mocks.findActiveProfileForChannel.mockResolvedValue(saved);
      expect((await caller().getActiveProfile({ channelId: CHANNEL_ID }))?.data).toEqual({ direction });
    }
  });

  it('rejects invalid direction data before saving', async () => {
    for (const direction of [{ preset: 'unknown' }, { preset: 'history', note: 'x'.repeat(301) }, { preset: 'history', extra: true }]) {
      await expect(caller().createProfileVersion({ channelId: CHANNEL_ID, data: { direction } })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    }
    expect(mocks.insertProfileVersion).not.toHaveBeenCalled();
  });

  it('saves a valid direction and returns advisory warnings', async () => {
    mocks.insertProfileVersion.mockImplementation(async ({ data }) => ({ id: 'saved', data }));
    const result = await caller().createProfileVersion({
      channelId: CHANNEL_ID,
      data: { direction: { preset: 'explainer' }, script: { guide: 'Use 12 words per sentence.' } },
    });
    expect(result).toMatchObject({ id: 'saved', warnings: [expect.stringContaining('numeric')] });
    expect(mocks.insertProfileVersion).toHaveBeenCalledOnce();
  });

  it('does not read or write another tenant\'s profile', async () => {
    mocks.findChannelById.mockResolvedValue({ id: CHANNEL_ID, tenantId: 'other' });
    await expect(caller().getActiveProfile({ channelId: CHANNEL_ID })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(caller().createProfileVersion({ channelId: CHANNEL_ID, data: { direction: { preset: 'history' } } })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(mocks.insertProfileVersion).not.toHaveBeenCalled();
  });
});
