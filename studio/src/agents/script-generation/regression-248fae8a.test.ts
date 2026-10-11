import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ callLLM: vi.fn() }));
vi.mock('../../llm', async (orig) => ({ ...(await orig<object>()), callLLM: mocks.callLLM }));

import { generateScript } from './index';
import { failureUsageEvents } from '../../run-pipeline/stage-failure';
import { NonTransientStageError, TransientStageError } from '../../run-pipeline/retry-with-backoff';

// Bugs Task 11 — fixture modelled on run 248fae8a (the founder's own test
// brief; creationOptions { audioLayer: 'none', visualSource: 'ai-stills',
// targetDurationSec: 45 }). The brief quotes several phrases; the working
// theory is that the model copies them into scriptText as unescaped straight
// quotes. The replies below are SYNTHETIC reconstructions of that shape, not
// the real reply (the real one was never stored: the error kept 200 characters).
const TOPIC = 'Roman soldiers and the myth that they were paid in salt, Roman Empire, 1st century AD';
const CONSTRAINTS = [
  'about 110 words, short sentences',
  "first sentence must be exactly: 'You've heard Roman soldiers were paid in salt. They weren't.'",
  'facts in order: (1) the word "salary" comes from Latin salarium, which in Roman texts simply means a money allowance (2) Pliny the Elder linked salt to the word, but no ancient source says soldiers were paid in salt (3) the "salt money" story was invented by 18th-century dictionary writers guessing at the word\'s origin (4, strongest) Roman soldiers were paid in coins, and the army deducted money for their food, clothes and weapons',
  'frame the salt payment as a myth throughout; say "no ancient source" rather than "never"',
  'end on fact 4. No moral, no question, no call to action.',
];

const HEAD =
  "You've heard Roman soldiers were paid in salt. They weren't. In Roman texts, salarium meant a money allowance, plain and simple. Pliny linked the word to salt, centuries after the fact. ";
const BAD_TEXT = `${HEAD}The story of "salt money" came from 18th-century dictionary writers. There is "no ancient source" for it. Roman soldiers were paid in coins, and the army deducted money for food, clothes and weapons.`;
const BAD_REPLY = `{"scriptText":"${BAD_TEXT}","captions":"Roman soldiers were never paid in salt.","hashtags":["rome","history"]}`;
const GOOD_TEXT = BAD_TEXT.replace(/"/g, '\\"');
const GOOD_REPLY = `{"scriptText":"${GOOD_TEXT}","captions":"Roman soldiers were never paid in salt.","hashtags":["rome","history"]}`;

const reply = (text: string, extra: Record<string, unknown> = {}) => ({
  text,
  usage: { inputTokens: 900, outputTokens: 220 },
  stopReason: 'stop',
  costUsd: '0.005000',
  provider: 'anthropic',
  model: 'claude-sonnet-5',
  ...extra,
});
const params = { topic: TOPIC, constraints: CONSTRAINTS, targetDurationSec: 45 as const };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('regression: run 248fae8a brief (quoted spans copied into scriptText)', () => {
  it('the synthetic bad reply really is unparseable, and the break sits at the first stray quote', () => {
    let message = '';
    try {
      JSON.parse(BAD_REPLY);
    } catch (error) {
      message = (error as Error).message;
    }
    const position = Number(/position (\d+)/.exec(message)?.[1]);
    const stray = BAD_REPLY.indexOf('"salt money"');
    expect(position).toBeGreaterThanOrEqual(stray);
    expect(position).toBeLessThanOrEqual(stray + '"salt money"'.length + 1);
  });

  it('retries once, feeds the parse error back, and accepts the escaped reply', async () => {
    mocks.callLLM.mockResolvedValueOnce(reply(BAD_REPLY)).mockResolvedValueOnce(reply(GOOD_REPLY));
    const { output, calls } = await generateScript(params);
    expect(calls).toHaveLength(2);
    expect(output.scriptText).toContain('"salt money"');
    expect(output.scriptText).toContain('"no ancient source"');
    expect(output.scriptText.startsWith("You've heard Roman soldiers were paid in salt. They weren't.")).toBe(true);
    const first = mocks.callLLM.mock.calls[0][0].messages[0].content as string;
    expect(first).toContain('approximately 45 seconds');
    expect(mocks.callLLM.mock.calls[1][0].messages[2].content).toMatch(/position \d+/);
  });

  it('if the model repeats the stray quotes, the run fails after two calls and both are booked', async () => {
    mocks.callLLM.mockResolvedValue(reply(BAD_REPLY));
    const error = await generateScript(params).catch((e: unknown) => e);
    expect(mocks.callLLM).toHaveBeenCalledTimes(2);
    expect((error as Error).message).toContain('did not return valid JSON');
    expect(failureUsageEvents(error)).toHaveLength(2);
  });
});

// Confirmed by the founder: the same brief with straight double quotes failed
// twice at script generation; with curly quotes it passed. Straight quotes are
// the regression, curly quotes the control that must keep passing.
const CURLY_TEXT = BAD_TEXT.replace(/"salt money"/, '“salt money”').replace(/"no ancient source"/, '“no ancient source”');
const CURLY_REPLY = `{"scriptText":"${CURLY_TEXT}","captions":"c","hashtags":["rome"]}`;

describe('primary path: schema-constrained output (Bugs Task 11)', () => {
  it('REGRESSION, straight quotes: the first call asks for structured output and its escaped reply passes with one call', async () => {
    mocks.callLLM.mockResolvedValueOnce(reply(GOOD_REPLY));
    const { output, calls } = await generateScript(params);
    expect(calls).toHaveLength(1);
    expect(mocks.callLLM.mock.calls[0][0].outputSchema).toBeDefined();
    expect(output.scriptText).toContain('"salt money"');
    expect(output.scriptText).toContain('"no ancient source"');
  });

  it('CONTROL, curly quotes: passes with one call', async () => {
    expect(() => JSON.parse(CURLY_REPLY)).not.toThrow();
    mocks.callLLM.mockResolvedValueOnce(reply(CURLY_REPLY));
    const { output, calls } = await generateScript(params);
    expect(calls).toHaveLength(1);
    expect(output.scriptText).toContain('“salt money”');
    expect(output.scriptText).not.toContain('"salt money"');
  });

  // The fallback decides on the HTTP status the client attached, never on message text.
  const providerError = (status: number | undefined, message = 'LLM provider call failed') => {
    const context = { provider: 'anthropic', model: 'm', ...(status === undefined ? {} : { statusCode: status }) };
    return status !== undefined && status >= 500
      ? new TransientStageError(`${message} (retryable)`, undefined, context)
      : new NonTransientStageError(message, undefined, context);
  };

  it.each([400, 422])(
    'a %i from the structured-output call falls back to plain text once, and the retry/repair path still recovers straight quotes',
    async (status) => {
      mocks.callLLM
        .mockRejectedValueOnce(providerError(status))
        .mockResolvedValueOnce(reply(BAD_REPLY))
        .mockResolvedValueOnce(reply(GOOD_REPLY));
      const { output, calls } = await generateScript(params);
      expect(calls).toHaveLength(2);
      expect(mocks.callLLM).toHaveBeenCalledTimes(3);
      expect(mocks.callLLM.mock.calls[0][0].outputSchema).toBeDefined();
      expect(mocks.callLLM.mock.calls[1][0].outputSchema).toBeUndefined();
      expect(mocks.callLLM.mock.calls[2][0].outputSchema).toBeUndefined();
      expect(output.scriptText).toContain('"salt money"');
      const logged = (console.error as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0])).join('\n');
      expect(logged).toContain(`provider returned ${status} for the structured-output request`);
    },
  );

  it('falls back only once: a second 400 (now on the plain-text call) is raised, not retried again', async () => {
    mocks.callLLM.mockRejectedValueOnce(providerError(400)).mockRejectedValueOnce(providerError(400));
    await expect(generateScript(params)).rejects.toBeInstanceOf(NonTransientStageError);
    expect(mocks.callLLM).toHaveBeenCalledTimes(2);
  });

  it.each([500, 529, 401, 429])('a %i does NOT fall back: the error is raised after one call', async (status) => {
    const original = providerError(status);
    mocks.callLLM.mockRejectedValueOnce(original);
    await expect(generateScript(params)).rejects.toBe(original);
    expect(mocks.callLLM).toHaveBeenCalledTimes(1);
  });

  it('an error with no status (and a message that mentions the schema) does NOT fall back', async () => {
    const original = providerError(undefined, 'LLM provider call failed: invalid output_format schema');
    mocks.callLLM.mockRejectedValueOnce(original);
    await expect(generateScript(params)).rejects.toBe(original);
    expect(mocks.callLLM).toHaveBeenCalledTimes(1);
  });
});
