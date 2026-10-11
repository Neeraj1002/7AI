import { describe, it, expect } from 'vitest';
import { deriveScriptReview } from './runs';

const stage = (attemptNumber: number, output: Record<string, unknown> | null, status = 'completed') =>
  ({ stageName: 'script_review', status, attemptNumber, output }) as never;

describe('deriveScriptReview', () => {
  it('is null before any completed review', () => {
    expect(deriveScriptReview({ creationOptions: null }, [])).toBeNull();
    expect(deriveScriptReview({ creationOptions: null }, [stage(1, null, 'running')])).toBeNull();
  });

  it('uses the latest completed attempt and the run sources', () => {
    const out = deriveScriptReview({ creationOptions: { sources: ['https://e.com'] } }, [
      stage(1, { factualConcerns: ['old'], styleGuideViolations: [] }),
      stage(2, { factualConcerns: ['new'], styleGuideViolations: ['v'] }),
    ]);
    expect(out).toEqual({ factualConcerns: ['new'], styleGuideViolations: ['v'], sources: ['https://e.com'], repeatTopic: null });
  });

  it('defaults missing fields (a review stored before Task 2) to empty arrays', () => {
    expect(deriveScriptReview({ creationOptions: null }, [stage(1, { score: 8 })])).toEqual({
      factualConcerns: [],
      styleGuideViolations: [],
      sources: [],
      repeatTopic: null,
    });
  });
});

describe('deriveScriptReview repeatTopic (Sprint 4 Task 5, B16)', () => {
  const review = {
    stageName: 'script_review',
    status: 'completed',
    attemptNumber: 1,
    output: { factualConcerns: [], styleGuideViolations: [] },
  } as never;
  const intake = (output: Record<string, unknown>) =>
    ({ stageName: 'intake', status: 'completed', attemptNumber: 1, output }) as never;
  it('returns the intake stage repeatTopic, or null when none', () => {
    const warn = { runId: 'r1', topic: 'old topic', createdAt: '2026-10-02T00:00:00.000Z' };
    expect(deriveScriptReview({ creationOptions: null }, [intake({ topic: 'x', repeatTopic: warn }), review])?.repeatTopic).toEqual(warn);
    expect(deriveScriptReview({ creationOptions: null }, [intake({ topic: 'x' }), review])?.repeatTopic).toBeNull();
    expect(deriveScriptReview({ creationOptions: null }, [review])?.repeatTopic).toBeNull();
  });
});
