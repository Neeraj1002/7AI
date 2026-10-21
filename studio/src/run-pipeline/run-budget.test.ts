import { describe, it, expect } from 'vitest';
import { assertWithinRunLimit, describeRunSpendLimit, isRunSpendLimitReached, RunSpendLimitError } from './run-budget';
import { resumeStaleWindowMs, LONG_FORM_RESUME_STALE_WINDOW_MS } from './resume-on-startup';
import { env } from '../config/env';

describe('per-video spend limit (Sprint 4 Task 9, R7.3)', () => {
  it('is reached when what is booked meets the limit', () => {
    expect(isRunSpendLimitReached(1.99, 2)).toBe(false);
    expect(isRunSpendLimitReached(2, 2)).toBe(true);
    expect(isRunSpendLimitReached(2.5, 2)).toBe(true);
  });

  it('assertWithinRunLimit passes under the limit and stops at it with a plain, non-transient message', async () => {
    await expect(assertWithinRunLimit('r', 3, async () => 1.2)).resolves.toBeUndefined();
    const err = await assertWithinRunLimit('r', 3, async () => 3.01).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RunSpendLimitError);
    expect((err as Error).message).toBe(describeRunSpendLimit(3.01, 3));
    expect((err as Error).message).toMatch(/\$3\.01 of its \$3\.00 limit/);
    expect((err as Error).name).toBe('RunSpendLimitError');
  });
});

describe('the limit is checked before a call that would pass it (Task 8 R8.2)', () => {
  it('stops when the next call would cross the limit, and not before', async () => {
    await expect(assertWithinRunLimit('r', 0.5, async () => 0.4947, 0.0053)).resolves.toBeUndefined();
    await expect(assertWithinRunLimit('r', 0.5, async () => 0.4950, 0.0053)).rejects.toBeInstanceOf(RunSpendLimitError);
    await expect(assertWithinRunLimit('r', 0.5, async () => 0.1, 0.0053)).resolves.toBeUndefined();
  });
  it('without a next-call price it behaves as before', async () => {
    await expect(assertWithinRunLimit('r', 0.5, async () => 0.4999)).resolves.toBeUndefined();
  });
});

describe('resume window for a long video (Sprint 4 Task 9, R5.6)', () => {
  it('a running long-form stage gets at least 3 hours; everything else keeps the default', () => {
    const long = { creationOptions: { videoKind: 'long' as const } };
    expect(resumeStaleWindowMs(long, { status: 'running' })).toBe(Math.max(env.RESUME_STALE_WINDOW_MS, LONG_FORM_RESUME_STALE_WINDOW_MS));
    expect(resumeStaleWindowMs(long, { status: 'completed' })).toBe(env.RESUME_STALE_WINDOW_MS);
    expect(resumeStaleWindowMs({ creationOptions: null }, { status: 'running' })).toBe(env.RESUME_STALE_WINDOW_MS);
  });
});
