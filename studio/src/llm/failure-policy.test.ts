import { describe, it, expect } from 'vitest';
import {
  buildJsonRepairMessages,
  CallLedger,
  classifyCallError,
  cutOffRetryLimit,
  FAILURE_POLICY,
  isNearMiss,
  isRefusal,
  isTimeoutLike,
  MAX_EXTRA_PROVIDER_CALLS,
  percentUsed,
  retryAfterMs,
  STRUCTURED_OUTPUT_FALLBACK_STATUSES,
  transientDelayMs,
} from './failure-policy';
import { NonTransientStageError, TransientStageError } from '../run-pipeline/retry-with-backoff';

// LLM Registry task, Part B (R5): the table, and the pure rules around it.
describe('the failure table', () => {
  it('covers cut-off, bad JSON, refusal, transient, structured-output rejection and bad request', () => {
    expect(Object.keys(FAILURE_POLICY).sort()).toEqual(['bad-json', 'bad-request', 'cut-off', 'refusal', 'structured-output-rejected', 'transient']);
  });

  it('no row may spend more extra calls than the ceiling, and the ceiling is two', () => {
    expect(MAX_EXTRA_PROVIDER_CALLS).toBe(2);
    for (const rule of Object.values(FAILURE_POLICY)) {
      expect(rule.maxExtraCalls).toBeLessThanOrEqual(MAX_EXTRA_PROVIDER_CALLS);
      expect(rule.summary.length).toBeGreaterThan(10);
    }
  });

  it('refusals and bad requests are never retried', () => {
    expect(FAILURE_POLICY.refusal.maxExtraCalls).toBe(0);
    expect(FAILURE_POLICY['bad-request'].maxExtraCalls).toBe(0);
  });

  it('cut-off and bad JSON each get exactly one more call; the structured-output fallback is one', () => {
    expect(FAILURE_POLICY['cut-off'].maxExtraCalls).toBe(1);
    expect(FAILURE_POLICY['bad-json'].maxExtraCalls).toBe(1);
    expect(FAILURE_POLICY['structured-output-rejected'].maxExtraCalls).toBe(1);
    expect(STRUCTURED_OUTPUT_FALLBACK_STATUSES).toEqual([400, 422]);
  });
});

describe('classifyCallError', () => {
  const nonTransient = (statusCode?: number) => new NonTransientStageError('x', undefined, statusCode ? { statusCode } : {});
  it.each([400, 422])('%i on a request that sent a schema is a structured-output rejection', (status) => {
    expect(classifyCallError(nonTransient(status), true)).toBe('structured-output-rejected');
  });
  it.each([400, 401, 403, 422])('%i with no schema is a bad request', (status) => {
    expect(classifyCallError(nonTransient(status), false)).toBe('bad-request');
  });
  it.each([401, 403])('%i with a schema is still a bad request, not a fallback', (status) => {
    expect(classifyCallError(nonTransient(status), true)).toBe('bad-request');
  });
  it('a transient error is transient whatever its status', () => {
    expect(classifyCallError(new TransientStageError('x', undefined, { statusCode: 529 }), true)).toBe('transient');
    expect(classifyCallError(new TransientStageError('x'), false)).toBe('transient');
  });
  it('an error with no status (a message that mentions the schema) is a bad request, never a fallback', () => {
    expect(classifyCallError(nonTransient(), true)).toBe('bad-request');
  });
});

describe('transient backoff', () => {
  const withHeaders = (headers: Record<string, string>) => new TransientStageError('x', undefined, { responseHeaders: headers });
  it('waits 1s, 2s, 4s... capped at 30s with no retry-after', () => {
    const e = new TransientStageError('x');
    expect([1, 2, 3, 4, 10].map((n) => transientDelayMs(e, n))).toEqual([1000, 2000, 4000, 8000, 30000]);
  });
  it('honours retry-after in seconds, retry-after-ms, and an HTTP date', () => {
    const now = new Date('2026-10-19T10:00:00Z');
    expect(retryAfterMs(withHeaders({ 'retry-after': '7' }))).toBe(7000);
    expect(retryAfterMs(withHeaders({ 'retry-after-ms': '2500' }))).toBe(2500);
    expect(retryAfterMs(withHeaders({ 'retry-after': 'Mon, 19 Oct 2026 10:00:09 GMT' }), now)).toBe(9000);
    expect(retryAfterMs(withHeaders({}))).toBeUndefined();
  });
  it('never waits less than retry-after, and gives up (null) on one over a minute', () => {
    expect(transientDelayMs(withHeaders({ 'retry-after': '7' }), 1)).toBe(7000);
    expect(transientDelayMs(withHeaders({ 'retry-after': '0' }), 1)).toBe(1000);
    expect(transientDelayMs(withHeaders({ 'retry-after': '61' }), 1)).toBeNull();
    expect(transientDelayMs(withHeaders({ 'retry-after': '60' }), 1)).toBe(60000);
  });
  it('recognises a timeout or a dropped connection that did not arrive as an API error', () => {
    const timeout = Object.assign(new Error('The operation timed out'), { name: 'TimeoutError' });
    const reset = new TypeError('fetch failed', { cause: Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }) });
    expect(isTimeoutLike(timeout)).toBe(true);
    expect(isTimeoutLike(reset)).toBe(true);
    expect(isTimeoutLike(new Error('boom'))).toBe(false);
  });
});

describe('the ceiling (CallLedger)', () => {
  it('allows two extra calls across all causes, then refuses', async () => {
    const ledger = new CallLedger();
    expect(await ledger.take('script-generation', 'cut-off')).toEqual({ ok: true });
    expect(await ledger.take('script-generation', 'transient')).toEqual({ ok: true });
    expect(await ledger.take('script-generation', 'bad-json')).toEqual({ ok: false, why: 'ceiling' });
    expect(ledger.extraCallsUsed).toBe(2);
  });
  it('cannot be configured above the ceiling', async () => {
    const ledger = new CallLedger({ maxExtraCalls: 9 });
    await ledger.take('script-generation', 'cut-off');
    await ledger.take('script-generation', 'cut-off');
    expect((await ledger.take('script-generation', 'cut-off')).ok).toBe(false);
  });
  it('asks the budget guard before each extra call, with what is spent but not yet booked', async () => {
    const seen: unknown[] = [];
    const ledger = new CallLedger({ guard: async (info) => { seen.push(info); return null; } });
    ledger.noteSpend('0.002000');
    ledger.noteSpend(0.003);
    await ledger.take('script-review', 'cut-off');
    expect(seen).toEqual([{ purpose: 'script-review', reason: 'cut-off', unbookedCostUsd: 0.005 }]);
  });
  it('a budget refusal does not spend the allowance', async () => {
    let refuse = true;
    const ledger = new CallLedger({ guard: async () => (refuse ? 'Account spend limit reached' : null) });
    expect(await ledger.take('script-generation', 'cut-off')).toEqual({ ok: false, why: 'budget', detail: 'Account spend limit reached' });
    expect(ledger.extraCallsUsed).toBe(0);
    refuse = false;
    expect((await ledger.take('script-generation', 'cut-off')).ok).toBe(true);
  });
});

describe('small rules', () => {
  it('cut-off retry limit: double, at most 32,000, never above the model maximum', () => {
    expect(cutOffRetryLimit(4_000, 64_000)).toBe(8_000);
    expect(cutOffRetryLimit(16_000, 64_000)).toBe(32_000);
    expect(cutOffRetryLimit(16_000, 20_000)).toBe(20_000);
  });
  it('near-miss from 60% of the limit', () => {
    expect(isNearMiss(5_999, 10_000)).toBe(false);
    expect(isNearMiss(6_000, 10_000)).toBe(true);
    expect(percentUsed(556, 16_000)).toBe(3.5);
  });
  it('only the content-filter stop is a refusal', () => {
    expect(isRefusal('content-filter')).toBe(true);
    expect(isRefusal('stop')).toBe(false);
    expect(isRefusal('length')).toBe(false);
  });
  it('the JSON repair request is unchanged from Bugs Task 11 R5', () => {
    const messages = buildJsonRepairMessages('the brief', { what: 'did not return valid JSON', parseError: 'Unexpected token at 5' }, 'bad reply');
    expect(messages).toEqual([
      { role: 'user', content: 'the brief' },
      { role: 'assistant', content: 'bad reply' },
      {
        role: 'user',
        content:
          'Your previous reply could not be parsed as JSON (Unexpected token at 5). Reply again with ONLY the corrected JSON object. Escape every double quote inside a string value as \\" and write line breaks inside a string as \\n. No code fences, no commentary.',
      },
    ]);
    const shape = buildJsonRepairMessages('b', { what: 'output failed schema validation', parseError: 'missing x' }, 'r');
    expect(shape[2].content).toContain('did not match the required shape (missing x)');
  });
});
