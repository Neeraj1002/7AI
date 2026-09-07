// Retry / circuit-breaker wrapper — BUSINESS_LOGIC.md Section 4.
// Defined now as reusable middleware; only the `intake` stage exercises it this
// week, since it's the only stage that makes a real external (LLM) call.

// Transient failures (timeout, rate limit, 5xx) retry with exponential backoff.
export class TransientStageError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'TransientStageError';
  }
}

// Non-transient failures (a 4xx validation error, an unparseable brief) do not
// retry — they fail immediately and the caller routes the run to `needs_attention`.
export class NonTransientStageError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'NonTransientStageError';
  }
}

// Thrown once the retry cap is exhausted — the hard cap on total retries within a
// single stage attempt. A separate cap on regeneration loops between stages
// (e.g. Video Review failing back to Video Generation) is defined here as a
// constant for later weeks; there's no regeneration loop to exercise yet since
// Week 1 only has one real stage.
export class CircuitBreakerTrippedError extends Error {
  constructor(message: string, readonly lastError: unknown) {
    super(message);
    this.name = 'CircuitBreakerTrippedError';
  }
}

export const MAX_RETRIES_PER_STAGE = 3;
export const BASE_BACKOFF_MS = 500;
export const MAX_REGENERATION_LOOPS = 2;

export type RetryOptions = {
  maxRetries?: number;
  baseDelayMs?: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Runs `fn` (one stage attempt), retrying on TransientStageError with exponential
// backoff up to `maxRetries` times. A NonTransientStageError propagates
// immediately without retrying. Once retries are exhausted, throws
// CircuitBreakerTrippedError — the caller (state-machine.ts) routes that to
// `needs_attention`, per the transition table.
export async function withRetryAndCircuitBreaker<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? MAX_RETRIES_PER_STAGE;
  const baseDelayMs = options.baseDelayMs ?? BASE_BACKOFF_MS;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      if (error instanceof NonTransientStageError) {
        throw error;
      }
      lastError = error;
      if (attempt < maxRetries) {
        await sleep(baseDelayMs * 2 ** (attempt - 1));
      }
    }
  }

  throw new CircuitBreakerTrippedError(
    `Stage attempt failed after ${maxRetries} retries`,
    lastError,
  );
}
