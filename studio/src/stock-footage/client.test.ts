import { describe, it, expect, vi, afterEach } from 'vitest';
import { searchAndDownloadClipViaProvider } from './client';

// Bugs Closure R6 — a revise attempt must not get back the clip an earlier attempt used.
function videos(ids: number[]) {
  return {
    videos: ids.map((id) => ({
      id,
      duration: 10,
      url: `https://pexels.test/${id}`,
      video_files: [{ id: id * 10, quality: 'hd', file_type: 'video/mp4', width: 1080, height: 1920, link: `https://files.test/${id}.mp4` }],
    })),
  };
}

describe('searchAndDownloadClipViaProvider — excludeSourceIds', () => {
  afterEach(() => vi.restoreAllMocks());

  const mockFetch = (ids: number[]) =>
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('api.pexels.com')) return new Response(JSON.stringify(videos(ids)), { status: 200 });
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    });

  it('takes the first result when nothing is excluded', async () => {
    mockFetch([1, 2, 3]);
    expect((await searchAndDownloadClipViaProvider({ query: 'q' })).sourceId).toBe('1');
  });

  it('skips a clip an earlier attempt used', async () => {
    mockFetch([1, 2, 3]);
    expect((await searchAndDownloadClipViaProvider({ query: 'q', excludeSourceIds: ['1'] })).sourceId).toBe('2');
  });

  it('falls back to the first result when every result was already used', async () => {
    mockFetch([1, 2]);
    expect((await searchAndDownloadClipViaProvider({ query: 'q', excludeSourceIds: ['1', '2'] })).sourceId).toBe('1');
  });
});
