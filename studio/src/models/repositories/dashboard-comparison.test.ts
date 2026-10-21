import { describe, it, expect } from 'vitest';
import { buildChannelComparison } from './dashboard.repository';

const channels = [
  { id: 'a', name: 'Alpha' },
  { id: 'b', name: 'Brand New' },
];
const v = (channelId: string, formatKey: string | null, views: number) => ({
  channelId,
  formatKey,
  views,
  likes: views / 10,
  comments: 1,
});

describe('buildChannelComparison', () => {
  it('keeps a channel with no data, all zeros and null average', () => {
    const out = buildChannelComparison(channels, [v('a', null, 100)], []);
    const b = out.channels.find((c) => c.channelId === 'b')!;
    expect(b.videoCount).toBe(0);
    expect(b.totals).toEqual({ views: 0, likes: 0, comments: 0 });
    expect(b.avgViewsPerVideo).toBeNull();
    expect(b.byFormat).toEqual([
      { formatKey: null, videoKind: 'short', videoCount: 0, totals: { views: 0, likes: 0, comments: 0 }, avgViewsPerVideo: null, longFormWatch: null },
    ]);
  });

  it('splits two named formats plus Freeform into three groups with correct totals', () => {
    const out = buildChannelComparison(
      channels,
      [v('a', 'listicle', 300), v('a', 'listicle', 100), v('a', 'story', 500), v('a', null, 50)],
      [],
    );
    const a = out.channels[0];
    expect(a.videoCount).toBe(4);
    expect(a.totals.views).toBe(950);
    expect(a.avgViewsPerVideo).toBe(237.5);
    expect(a.byFormat.map((f) => f.formatKey)).toEqual(['story', 'listicle', null]);
    const listicle = a.byFormat.find((f) => f.formatKey === 'listicle')!;
    expect(listicle).toMatchObject({ videoCount: 2, avgViewsPerVideo: 200 });
    expect(listicle.totals).toEqual({ views: 400, likes: 40, comments: 2 });
  });

  it('shows a format used by a run but with no tracked video yet, with zeros', () => {
    const out = buildChannelComparison(channels, [v('a', null, 10)], [{ channelId: 'a', formatKey: 'story' }]);
    const story = out.channels[0].byFormat.find((f) => f.formatKey === 'story')!;
    expect(story.videoCount).toBe(0);
    expect(story.avgViewsPerVideo).toBeNull();
  });

  it('never averages Shorts and long-form together', () => {
    const long = (views: number) => ({ ...v('a', 'chaptered-explainer', views), videoKind: 'long' as const });
    const out = buildChannelComparison(channels, [v('a', null, 100), v('a', null, 300), long(1000)], []);
    const a = out.channels[0];
    expect(a.avgViewsPerVideo).toBeNull();
    expect(a.totals.views).toBe(1400);
    expect(a.byVideoKind).toEqual([
      expect.objectContaining({ videoKind: 'short', videoCount: 2, avgViewsPerVideo: 200 }),
      expect.objectContaining({ videoKind: 'long', videoCount: 1, avgViewsPerVideo: 1000 }),
    ]);
    expect(a.byFormat.map((f) => [f.formatKey, f.videoKind])).toEqual([
      ['chaptered-explainer', 'long'],
      [null, 'short'],
    ]);
  });

  it('splits Freeform into one row per kind', () => {
    const out = buildChannelComparison(channels, [v('a', null, 10), { ...v('a', null, 90), videoKind: 'long' as const }], []);
    expect(out.channels[0].byFormat.map((f) => [f.formatKey, f.videoKind, f.avgViewsPerVideo])).toEqual([
      [null, 'short', 10],
      [null, 'long', 90],
    ]);
  });

  it('filters by videoKind', () => {
    const long = { ...v('a', 'chaptered-explainer', 1000), videoKind: 'long' as const };
    const out = buildChannelComparison(channels, [v('a', null, 100), long], [{ channelId: 'a', formatKey: null, videoKind: 'short' }], 'long');
    const a = out.channels[0];
    expect(a.videoCount).toBe(1);
    expect(a.avgViewsPerVideo).toBe(1000);
    expect(a.byFormat).toHaveLength(1);
    expect(a.byFormat[0].videoKind).toBe('long');
  });

  it('does not leak one channel video into another', () => {
    const out = buildChannelComparison(channels, [v('a', null, 10)], []);
    expect(out.channels[1].totals.views).toBe(0);
  });
});

describe('long-form watch numbers in the comparison (Sprint 5 Task 8, R11.4)', () => {
  const longVideo = (channelId: string, formatKey: string | null, views: number, m: { d: number | null; p: number | null; min: number | null } | null) => ({
    channelId, formatKey, videoKind: 'long' as const, views, likes: 1, comments: 1,
    longFormMetrics: m && { averageViewDurationSec: m.d, averageViewPercentage: m.p, estimatedMinutesWatched: m.min },
  });

  it('averages duration and percentage over the measured long videos and sums the minutes watched', () => {
    const out = buildChannelComparison(channels, [
      longVideo('a', 'doc', 1000, { d: 100, p: 40, min: 50 }),
      longVideo('a', 'doc', 500, { d: 60, p: 20, min: 10.5 }),
      longVideo('a', 'doc', 200, null), // not measured yet
    ], []);
    const a = out.channels.find((c) => c.channelId === 'a')!;
    expect(a.byVideoKind[0]).toMatchObject({ videoKind: 'long', videoCount: 3, longFormWatch: { videosMeasured: 2, avgViewDurationSec: 80, avgViewPercentage: 30, estimatedMinutesWatched: 60.5 } });
    expect(a.byFormat[0]).toMatchObject({ formatKey: 'doc', videoKind: 'long', longFormWatch: { videosMeasured: 2 } });
  });

  it('a Short never carries watch numbers, and a long group with none says null', () => {
    const out = buildChannelComparison(channels, [
      { channelId: 'a', formatKey: null, views: 10, likes: 1, comments: 1, longFormMetrics: { averageViewDurationSec: 9, averageViewPercentage: 9, estimatedMinutesWatched: 9 } },
      longVideo('b', null, 5, null),
    ], []);
    expect(out.channels.find((c) => c.channelId === 'a')!.byVideoKind[0].longFormWatch).toBeNull();
    expect(out.channels.find((c) => c.channelId === 'b')!.byVideoKind[0].longFormWatch).toBeNull();
  });

  it('keeps null for a metric the API did not return, instead of 0', () => {
    const out = buildChannelComparison(channels, [longVideo('a', null, 5, { d: 90, p: null, min: null })], []);
    expect(out.channels.find((c) => c.channelId === 'a')!.byVideoKind[0].longFormWatch).toEqual({ videosMeasured: 1, avgViewDurationSec: 90, avgViewPercentage: null, estimatedMinutesWatched: 0 });
  });
});
