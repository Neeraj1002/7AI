import { describe, it, expect } from 'vitest';
import { failureOutputFromError, FAILED_STAGE_RAW_REPLY_CAP } from './stage-failure';
import { NonTransientStageError } from './retry-with-backoff';

describe('failureOutputFromError', () => {
  it('is undefined for an error with no raw reply (failed rows keep a null output)', () => {
    expect(failureOutputFromError(new Error('boom'))).toBeUndefined();
    expect(failureOutputFromError(new NonTransientStageError('x', undefined, { provider: 'a' }))).toBeUndefined();
  });

  it('keeps the raw reply with its diagnostics', () => {
    const out = failureOutputFromError(
      new NonTransientStageError('x', undefined, { rawReply: 'abc', stopReason: 'length', replyLength: 3, parseError: 'p' }),
    );
    expect(out).toEqual({ rawReply: 'abc', rawReplyTruncated: false, stopReason: 'length', replyLength: 3, parseError: 'p' });
  });

  it('caps the stored reply at 8000 characters and says so', () => {
    const long = 'x'.repeat(FAILED_STAGE_RAW_REPLY_CAP + 500);
    const out = failureOutputFromError(new NonTransientStageError('x', undefined, { rawReply: long }))!;
    expect((out.rawReply as string).length).toBe(8000);
    expect(out.rawReplyTruncated).toBe(true);
  });

  it('persists output exhaustion separately from JSON diagnostics with the failed scene range', () => {
    const out = failureOutputFromError(new NonTransientStageError('cap', undefined, {
      rawReply: '{', stopReason: 'length', failureKind: 'output_token_exhaustion', sceneOffset: 12, sceneCount: 1,
    }));
    expect(out).toMatchObject({ failureKind: 'output_token_exhaustion', sceneOffset: 12, sceneCount: 1 });
  });
});
