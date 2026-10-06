import { describe, it, expect } from 'vitest';
import {
  markDriven,
  unmarkDriven,
  isActivelyDriven,
  requestCancellation,
  isCancellationRequested,
  clearCancellation,
  CANCEL_STALE_AFTER_MS,
} from './cancellation-registry';

// Bugs Task 10 (R1) — the "is a loop really driving this run" decision that
// decides whether runs.cancel ends a run at once or leaves it to the loop.
describe('isActivelyDriven', () => {
  const now = Date.parse('2026-10-06T12:00:00Z');

  it('is true for a driven run that made progress recently', () => {
    markDriven('run-active');
    expect(isActivelyDriven('run-active', new Date(now - 60_000), now)).toBe(true);
    unmarkDriven('run-active');
  });

  it('is false for a driven run with no progress past the stale threshold (hung loop)', () => {
    markDriven('run-hung');
    expect(isActivelyDriven('run-hung', new Date(now - CANCEL_STALE_AFTER_MS - 1), now)).toBe(false);
    unmarkDriven('run-hung');
  });

  it('is false for a run no loop is driving, however fresh its timestamp', () => {
    expect(isActivelyDriven('run-not-driven', new Date(now), now)).toBe(false);
  });

  it('is false again after unmarkDriven', () => {
    markDriven('run-done');
    unmarkDriven('run-done');
    expect(isActivelyDriven('run-done', new Date(now), now)).toBe(false);
  });
});

describe('cancellation requests', () => {
  it('records and clears a request', () => {
    requestCancellation('run-c');
    expect(isCancellationRequested('run-c')).toBe(true);
    clearCancellation('run-c');
    expect(isCancellationRequested('run-c')).toBe(false);
  });
});
