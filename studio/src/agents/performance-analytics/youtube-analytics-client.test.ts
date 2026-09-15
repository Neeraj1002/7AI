import { describe, it, expect } from 'vitest';
import { classifyAnalyticsError } from './youtube-analytics-client';
import { TransientStageError, NonTransientStageError } from '../../run-pipeline/retry-with-backoff';

// Sprint 2 Task 4 (G1) — this exact classification was confirmed against a
// REAL, live 403 response from this project's own credentials at
// implementation time (not guessed): the YouTube Analytics API is not yet
// enabled for this Google Cloud project, a real, distinct founder action
// from the yt-analytics.readonly scope grant. Turns that into a real,
// repeatable regression test — same "same rigor" bar Week 5 Task 4's C4
// applied to Publishing's own mapGoogleError.

function serviceDisabledError() {
  return {
    response: {
      status: 403,
      data: {
        error: {
          code: 403,
          message:
            'YouTube Analytics API has not been used in project 714472645139 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/youtubeanalytics.googleapis.com/overview?project=714472645139 then retry.',
          status: 'PERMISSION_DENIED',
          errors: [{ reason: 'accessNotConfigured', domain: 'usageLimits' }],
          details: [{ reason: 'SERVICE_DISABLED', domain: 'googleapis.com' }],
        },
      },
    },
  };
}

describe('classifyAnalyticsError', () => {
  it('classifies the real SERVICE_DISABLED/accessNotConfigured response as a clear "API not enabled" error, not a generic auth failure', () => {
    const mapped = classifyAnalyticsError(serviceDisabledError(), {}) as NonTransientStageError;
    expect(mapped).toBeInstanceOf(NonTransientStageError);
    expect(mapped.message).toMatch(/not enabled/i);
    expect(mapped.message).toMatch(/KNOWN_ISSUES_AND_BLOCKERS/);
  });

  it('classifies an insufficientPermissions 403 as a clear "scope not granted" error', () => {
    const error = {
      response: {
        status: 403,
        data: {
          error: {
            message: 'Insufficient permission for this request',
            errors: [{ reason: 'insufficientPermissions' }],
          },
        },
      },
    };
    const mapped = classifyAnalyticsError(error, {}) as NonTransientStageError;
    expect(mapped).toBeInstanceOf(NonTransientStageError);
    expect(mapped.message).toMatch(/scope/i);
    expect(mapped.message).toMatch(/yt-analytics\.readonly/);
  });

  it('classifies a 429 as transient/retryable', () => {
    const error = { response: { status: 429, data: { error: { message: 'Quota exceeded' } } } };
    expect(classifyAnalyticsError(error, {})).toBeInstanceOf(TransientStageError);
  });

  it('classifies a 500 as transient/retryable', () => {
    const error = { response: { status: 500, data: { error: { message: 'Internal error' } } } };
    expect(classifyAnalyticsError(error, {})).toBeInstanceOf(TransientStageError);
  });

  it('classifies an unrecognized error as non-transient rather than silently swallowing it', () => {
    const error = { response: { status: 400, data: { error: { message: 'Bad request' } } } };
    expect(classifyAnalyticsError(error, {})).toBeInstanceOf(NonTransientStageError);
  });

  it('preserves the given context on the mapped error', () => {
    const mapped = classifyAnalyticsError(serviceDisabledError(), { provider: 'youtube-analytics' }) as NonTransientStageError;
    expect(mapped.context).toEqual({ provider: 'youtube-analytics' });
  });
});
