import { describe, it, expect, vi } from 'vitest';
import { createStillsProgressReporter, readStillsProgress } from './stills-progress';

describe('createStillsProgressReporter', () => {
  it('stores the first and last counts at once and the ones between at most every 5 seconds', async () => {
    let t = 0;
    const write = vi.fn().mockResolvedValue(undefined);
    const reporter = createStillsProgressReporter(write, { now: () => t });
    reporter.report({ done: 0, total: 6 }); // first: stored
    t = 1000;
    reporter.report({ done: 1, total: 6 }); // too soon
    t = 2000;
    reporter.report({ done: 2, total: 6 }); // too soon
    t = 6000;
    reporter.report({ done: 3, total: 6 }); // 6 s since the first write: stored
    t = 6500;
    reporter.report({ done: 4, total: 6 }); // too soon
    reporter.report({ done: 6, total: 6 }); // last: always stored
    await reporter.flush();
    expect(write.mock.calls.map((c) => c[0].done)).toEqual([0, 3, 6]);
  });

  it('flush stores the newest held-back value and waits for every write', async () => {
    let t = 0;
    const write = vi.fn().mockResolvedValue(undefined);
    const reporter = createStillsProgressReporter(write, { now: () => t });
    reporter.report({ done: 0, total: 9 });
    t = 100;
    reporter.report({ done: 4, total: 9 });
    await reporter.flush();
    expect(write.mock.calls.map((c) => c[0].done)).toEqual([0, 4]);
  });

  it('a failing write never rejects', async () => {
    const reporter = createStillsProgressReporter(() => Promise.reject(new Error('db down')));
    reporter.report({ done: 0, total: 3 });
    await expect(reporter.flush()).resolves.toBeUndefined();
  });
});

describe('readStillsProgress', () => {
  it('reads the stored counter and ignores anything else', () => {
    expect(readStillsProgress({ stillsProgress: { done: 3, total: 12 } })).toEqual({ done: 3, total: 12 });
    expect(readStillsProgress(null)).toBeUndefined();
    expect(readStillsProgress({})).toBeUndefined();
    expect(readStillsProgress({ stillsProgress: { done: 'x', total: 1 } })).toBeUndefined();
  });
});
