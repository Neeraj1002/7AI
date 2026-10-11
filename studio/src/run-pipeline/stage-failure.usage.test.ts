import { describe, it, expect } from 'vitest';
import { failureUsageFields, llmUsageContext } from './stage-failure';
import { NonTransientStageError, TransientStageError } from './retry-with-backoff';

const llmCall = {
  text: 'irrelevant',
  usage: { inputTokens: 1200, outputTokens: 300 },
  stopReason: 'length',
  costUsd: '0.008100',
  provider: 'anthropic' as const,
  model: 'claude-sonnet-5',
};

describe('failureUsageFields (Bugs Task 11 R2)', () => {
  it('reads the real usage a thrower attached', () => {
    const error = new NonTransientStageError('bad json', undefined, llmUsageContext(llmCall));
    expect(failureUsageFields(error)).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      inputTokens: 1200,
      outputTokens: 300,
      costUsd: '0.008100',
    });
  });

  it('keeps provider/model but zero usage when only the provider call context exists', () => {
    const error = new TransientStageError('rate limited', undefined, { provider: 'anthropic', model: 'm' });
    expect(failureUsageFields(error)).toEqual({
      provider: 'anthropic',
      model: 'm',
      inputTokens: 0,
      outputTokens: 0,
      costUsd: '0.000000',
    });
  });

  it('is unknown/0/$0 only when no call is known to have happened', () => {
    expect(failureUsageFields(new Error('ffmpeg exploded'))).toEqual({
      provider: 'unknown',
      model: 'unknown',
      inputTokens: 0,
      outputTokens: 0,
      costUsd: '0.000000',
    });
  });
});
