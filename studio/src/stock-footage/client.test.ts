import { describe, it, expect } from 'vitest';
import { pickUnusedVideo } from './client';
import { stubSearchAndDownloadClip } from './stub';

describe('pickUnusedVideo (Sprint 4 Task 8, R5)', () => {
  const videos = [{ id: 1 }, { id: 2 }, { id: 3 }];

  it('returns the first result when nothing has been used', () => {
    expect(pickUnusedVideo(videos)?.id).toBe(1);
  });

  it('skips clip IDs already used in this render and moves to the next result', () => {
    expect(pickUnusedVideo(videos, ['1'])?.id).toBe(2);
    expect(pickUnusedVideo(videos, ['1', '2'])?.id).toBe(3);
  });

  it('returns undefined when every candidate was already used', () => {
    expect(pickUnusedVideo(videos, ['1', '2', '3'])).toBeUndefined();
  });
});

describe('stub honours excludeSourceIds so duplicate queries still give distinct clips', () => {
  it('assigns a different sourceId when the first is excluded', async () => {
    const a = await stubSearchAndDownloadClip({ query: 'ocean waves' });
    const b = await stubSearchAndDownloadClip({ query: 'ocean waves', excludeSourceIds: [a.sourceId] });
    expect(b.sourceId).not.toBe(a.sourceId);
  }, 30_000);
});
