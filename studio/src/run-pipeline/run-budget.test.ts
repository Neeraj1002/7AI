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

describe('resume window for a long video (Sprint 4 Task 9, R5.6)', () => {
  it('a running long-form stage gets at least 3 hours; everything else keeps the default', () => {
    const long = { creationOptions: { videoKind: 'long' as const } };
    expect(resumeStaleWindowMs(long, { status: 'running' })).toBe(Math.max(env.RESUME_STALE_WINDOW_MS, LONG_FORM_RESUME_STALE_WINDOW_MS));
    expect(resumeStaleWindowMs(long, { status: 'completed' })).toBe(env.RESUME_STALE_WINDOW_MS);
    expect(resumeStaleWindowMs({ creationOptions: null }, { status: 'running' })).toBe(env.RESUME_STALE_WINDOW_MS);
  });
});
