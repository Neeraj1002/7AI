import { describe, it, expect } from 'vitest';
import { decidePoll } from './poll-policy';

const day = 86_400_000;
const now = Date.parse('2026-10-11T00:00:00Z');

describe('decidePoll', () => {
  it('polls a recent video', () => {
    expect(decidePoll({ now, publishedAt: new Date(now - 5 * day), lastSnapshotAt: new Date(now - day) })).toBe('poll');
  });
  it('takes one final snapshot after 30 days, then stops', () => {
    const publishedAt = new Date(now - 40 * day);
    expect(decidePoll({ now, publishedAt, lastSnapshotAt: new Date(now - 12 * day) })).toBe('final');
    expect(decidePoll({ now, publishedAt, lastSnapshotAt: new Date(now - 1 * day) })).toBe('skip');
  });
  it('polls when the publish time is unknown', () => {
    expect(decidePoll({ now, publishedAt: null, lastSnapshotAt: null })).toBe('poll');
  });
});
