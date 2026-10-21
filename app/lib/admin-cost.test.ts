// Sprint 5 Task 7 R2 (A10).
import { describe, it, expect } from 'vitest';
import { adminStageLabel, groupUsage } from './admin-cost';

const stages = [
  { stageName: 'video_generation', attemptNumber: 1, startedAt: '2026-10-18T04:00:00Z', finishedAt: '2026-10-18T04:10:00Z' },
  { stageName: 'video_review', attemptNumber: 1, startedAt: '2026-10-18T04:10:00Z', finishedAt: '2026-10-18T04:12:00Z' },
  { stageName: 'video_generation', attemptNumber: 2, startedAt: '2026-10-18T04:20:00Z', finishedAt: null },
];
const ev = (at: string, costUsd: number) => ({ at, costUsd });

describe('admin usage grouping', () => {
  it('places events in the attempt window, and the subtotals add up to the total', () => {
    const usage = [ev('2026-10-18T04:01:00Z', 0.1), ev('2026-10-18T04:05:00Z', 0.03), ev('2026-10-18T04:11:00Z', 0.02), ev('2026-10-18T04:30:00Z', 0.2), ev('2026-10-18T03:59:00Z', 0.01)];
    const { groups, totalUsd } = groupUsage(stages, usage);
    const by = Object.fromEntries(groups.map((g) => [g.key, g.subtotalUsd]));
    expect(by['video_generation:1']).toBeCloseTo(0.13);
    expect(by['video_review:1']).toBeCloseTo(0.02);
    expect(by['video_generation:2']).toBeCloseTo(0.2); // open-ended attempt
    expect(by['before']).toBeCloseTo(0.01);
    expect(totalUsd).toBeCloseTo(usage.reduce((n, u) => n + u.costUsd, 0));
  });
  it('an event just after its stage closed goes to that stage, and $0 events are counted', () => {
    const { groups } = groupUsage(stages, [ev('2026-10-18T04:15:00Z', 0)]);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('video_review:1');
    expect(groups[0].zeroEvents).toBe(1);
  });
  it('labels gates plainly', () => {
    expect(adminStageLabel('gate2')).toBe('Gate 2');
    expect(adminStageLabel('video_review')).toBe('Video review');
  });
});
