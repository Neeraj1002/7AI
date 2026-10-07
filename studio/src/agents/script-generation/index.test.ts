import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ callLLM: vi.fn() }));
vi.mock('../../llm', async (orig) => ({ ...(await orig<object>()), callLLM: mocks.callLLM }));

import { generateScript } from './index';
import { getStageErrorContext, NonTransientStageError } from '../../run-pipeline/retry-with-backoff';

const reply = (text: string, extra: Record<string, unknown> = {}) => ({
  text,
  usage: { inputTokens: 100, outputTokens: 50 },
  stopReason: 'stop',
  costUsd: '0.001000',
  provider: 'anthropic',
  model: 'claude-sonnet-5',
  ...extra,
});
const GOOD = '{"scriptText":"Hello there.","captions":"Hello there.","hashtags":["a","b"]}';
const params = { topic: 't', constraints: [] as string[] };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('generateScript — Bugs Task 11 R1 diagnostics', () => {
  it('parses a clean reply', async () => {
    mocks.callLLM.mockResolvedValueOnce(reply(GOOD));
    const { output } = await generateScript(params);
    expect(output.scriptText).toBe('Hello there.');
  });

  it('an unescaped quote inside scriptText fails with the parser message, stopReason, length and raw reply', async () => {
    const bad = '{"scriptText":"He said "no" to salt. ' + 'x'.repeat(500) + '","captions":"c","hashtags":[]}';
    mocks.callLLM.mockResolvedValueOnce(reply(bad));
    const error = await generateScript(params).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NonTransientStageError);
    const message = (error as Error).message;
    expect(message).toContain('did not return valid JSON');
    expect(message).toContain('stopReason=stop');
    expect(message).toContain(`replyLength=${bad.length}`);
    expect(message).toMatch(/position \d+/);
    const context = getStageErrorContext(error)!;
    expect(context.rawReply).toBe(bad);
    expect(context.stopReason).toBe('stop');
    expect(context.replyLength).toBe(bad.length);
    expect(typeof context.parseError).toBe('string');
  });

  it('logs the first and last 300 characters of the reply', async () => {
    const bad = 'A'.repeat(300) + 'MIDDLE'.repeat(100) + 'Z'.repeat(300) + ' not json';
    mocks.callLLM.mockResolvedValueOnce(reply(bad));
    await generateScript(params).catch(() => undefined);
    const logged = (console.error as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('A'.repeat(300));
    expect(logged).toContain('Z'.repeat(290));
    expect(logged).not.toContain('MIDDLE'.repeat(100));
  });

  it('a schema failure also carries the diagnostics', async () => {
    mocks.callLLM.mockResolvedValueOnce(reply('{"scriptText":""}'));
    const error = await generateScript(params).catch((e: unknown) => e);
    expect((error as Error).message).toContain('failed schema validation');
    expect(getStageErrorContext(error)!.rawReply).toBe('{"scriptText":""}');
  });
});
