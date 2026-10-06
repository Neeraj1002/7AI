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
    expect(out).toEqual({ factualConcerns: ['new'], styleGuideViolations: ['v'], sources: ['https://e.com'] });
  });

  it('defaults missing fields (a review stored before Task 2) to empty arrays', () => {
    expect(deriveScriptReview({ creationOptions: null }, [stage(1, { score: 8 })])).toEqual({
      factualConcerns: [],
      styleGuideViolations: [],
      sources: [],
    });
  });
});
