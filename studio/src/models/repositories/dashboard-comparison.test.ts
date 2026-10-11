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
      { formatKey: null, videoCount: 0, totals: { views: 0, likes: 0, comments: 0 }, avgViewsPerVideo: null },
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

  it('does not leak one channel video into another', () => {
    const out = buildChannelComparison(channels, [v('a', null, 10)], []);
    expect(out.channels[1].totals.views).toBe(0);
  });
});
