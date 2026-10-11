import { describe, it, expect } from 'vitest';
import { classifyEndError, tallyEndedRuns } from './end-reason';

describe('classifyEndError', () => {
  it('classifies legacy text-only rows', () => {
    expect(classifyEndError('Cancelled by user')).toBe('cancelled');
    expect(classifyEndError('Rejected at Gate 2: nope')).toBe('rejected');
    expect(classifyEndError('Rejected at Gate 1: x')).toBe('rejected');
    expect(classifyEndError('Channel deleted')).toBe('channel_deleted');
    expect(classifyEndError('Video render crashed')).toBe('failed');
    expect(classifyEndError(null)).toBe('failed');
  });
});

describe('tallyEndedRuns (2026-10-10 preview shape: 18 published, 16 cancelled, 5 rejected)', () => {
  const groups = [
    { lastError: 'Cancelled by user', count: 16 },
    { lastError: 'Rejected at Gate 2: a', count: 3 },
    { lastError: 'Rejected at Gate 2: b', count: 1 },
    { lastError: 'Rejected at Gate 1: c', count: 1 },
  ];
  it('keeps cancelled out of the rate and labels rejections', () => {
    const t = tallyEndedRuns(18, groups);
    expect(t).toMatchObject({ published: 18, failed: 0, rejected: 5, cancelled: 16 });
    expect(t.rate).toBeCloseTo(18 / 23, 5);
  });
  it('splits a real failure out and counts every failed-status run exactly once', () => {
    const t = tallyEndedRuns(2, [...groups, { lastError: 'boom', count: 2 }, { lastError: 'Channel deleted', count: 1 }]);
    expect(t.published + t.failed + t.rejected + t.cancelled).toBe(2 + 16 + 5 + 2 + 1);
    expect(t.failed).toBe(2);
    expect(t.cancelled).toBe(17);
  });
  it('has no rate with nothing counted', () => {
    expect(tallyEndedRuns(0, [{ lastError: 'Cancelled by user', count: 4 }]).rate).toBeNull();
  });
});
