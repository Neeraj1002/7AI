import { describe, it, expect } from 'vitest';
import { deriveReviewNotRun } from './runs';

const stage = (stageName: string, output: object, attemptNumber = 1) => ({ stageName, status: 'completed', attemptNumber, output }) as never;

describe('deriveReviewNotRun', () => {
  it('is null when the review ran', () => {
    expect(deriveReviewNotRun({ status: 'paused_gate2' }, [stage('video_review', { verdict: 'pass' })])).toBeNull();
  });
  it('first build: plain banner, can run again at Gate 2', () => {
    expect(deriveReviewNotRun({ status: 'paused_gate2' }, [stage('video_generation', {}), stage('video_review', { verdict: 'not_run', rationale: 'r' })]))
      .toMatchObject({ repaired: false, canRerun: true, reason: 'r' });
  });
  it('repaired: the repair-not-verified banner', () => {
    const r = deriveReviewNotRun({ status: 'paused_gate2' }, [stage('video_generation', { visualRepairReceipt: {} }), stage('video_review', { verdict: 'not_run' })]);
    expect(r?.banner).toBe('Automated review did not run: the repair is not verified');
  });
  it('only the latest review counts, and cannot be re-run once the run left Gate 2', () => {
    const stages = [stage('video_review', { verdict: 'not_run' }, 1), stage('video_review', { verdict: 'pass' }, 2)];
    expect(deriveReviewNotRun({ status: 'paused_gate2' }, stages)).toBeNull();
    expect(deriveReviewNotRun({ status: 'running' }, [stage('video_review', { verdict: 'not_run' })])?.canRerun).toBe(false);
  });
});
