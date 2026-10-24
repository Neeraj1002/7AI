import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ callLLM: vi.fn() }));
vi.mock('../../llm', async (orig) => ({ ...(await orig<object>()), callLLM: mocks.callLLM }));

import { generateScript } from './index';
import { failureUsageEvents } from '../../run-pipeline/stage-failure';

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

  // LLM Registry task, Part B (R5): the structured-output fallback (a 400 or 422 on the schema request, one
  // fallback to plain text) now lives in callLLM and its failure table; its status tests are in
  // llm/index.test.ts. What stays true here: once callLLM says it fell back, the repair call sends no schema.
  it('after callLLM fell back to plain text, the repair call sends no schema either', async () => {
    mocks.callLLM
      .mockResolvedValueOnce(reply(BAD_REPLY, { structuredOutputFallback: true }))
      .mockResolvedValueOnce(reply(GOOD_REPLY, { structuredOutputFallback: true }));
    const { output, calls } = await generateScript(params);
    expect(calls).toHaveLength(2);
    expect(mocks.callLLM.mock.calls[0][0].outputSchema).toBeDefined();
    expect(mocks.callLLM.mock.calls[1][0].outputSchema).toBeUndefined();
    expect(output.scriptText).toContain('"salt money"');
  });

  it('the first call and the repair call share one ledger (the two-extra-calls ceiling)', async () => {
    mocks.callLLM.mockResolvedValueOnce(reply(BAD_REPLY)).mockResolvedValueOnce(reply(GOOD_REPLY));
    await generateScript(params);
    const first = mocks.callLLM.mock.calls[0][0].ledger;
    expect(first).toBeDefined();
    expect(mocks.callLLM.mock.calls[1][0].ledger).toBe(first);
    expect(first.extraCallsUsed).toBe(1); // the repair call took its place
  });

  it('when the ceiling is already used up there is no repair call: the first unusable reply fails the stage', async () => {
    mocks.callLLM.mockImplementationOnce(async (req: { ledger: { take: (p: string, r: string) => Promise<unknown> } }) => {
      await req.ledger.take('script-generation', 'cut-off');
      await req.ledger.take('script-generation', 'transient');
      return reply(BAD_REPLY);
    });
    await expect(generateScript(params)).rejects.toThrow(/did not return valid JSON/);
    expect(mocks.callLLM).toHaveBeenCalledTimes(1);
  });

  it('a budget refusal before the repair call fails with the spend-limit message and books the first call', async () => {
    mocks.callLLM.mockResolvedValueOnce(reply(BAD_REPLY));
    const error = await generateScript({ ...params, retryGuard: async () => 'Account spend limit reached: $10.00 used of $10.00 this week.' }).catch((e: unknown) => e);
    expect((error as Error).message).toContain('Spend limit reached before the retry');
    expect(mocks.callLLM).toHaveBeenCalledTimes(1);
    expect(failureUsageEvents(error)).toHaveLength(1);
  });
});
