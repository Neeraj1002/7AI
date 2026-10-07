import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ callLLM: vi.fn() }));
vi.mock('../../llm', async (orig) => ({ ...(await orig<object>()), callLLM: mocks.callLLM }));

import { generateScript } from './index';
import { getStageErrorContext } from '../../run-pipeline/retry-with-backoff';

// The error message becomes pipeline_runs.lastError and pipeline_stages.error, both
// returned by the admin inspector ("structure only") and the tenant run view. It must
// carry no model output. The raw reply is allowed only on the stage output (context).
const SECRET = 'SECRETSCRIPT-Roman-salt-story';
const reply = (text: string, stopReason = 'stop') => ({
  text,
  usage: { inputTokens: 1, outputTokens: 1 },
  stopReason,
  costUsd: '0.001000',
  provider: 'anthropic',
  model: 'claude-sonnet-5',
});
const params = { topic: 't', constraints: [] as string[] };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('script generation errors carry no reply text in their message', () => {
  it('after two unparseable replies', async () => {
    mocks.callLLM
      .mockResolvedValueOnce(reply(`{"scriptText":"${SECRET} "quoted" bit","captions":"c","hashtags":[]}`))
      .mockResolvedValueOnce(reply(`not json ${SECRET}`));
    const error = await generateScript(params).catch((e: unknown) => e);
    expect((error as Error).message).not.toContain(SECRET);
    expect((error as Error).message).toContain('did not return valid JSON');
    // the reply is still kept for the failed stage row
    expect(getStageErrorContext(error)!.rawReply).toContain(SECRET);
    expect(String(getStageErrorContext(error)!.parseError)).not.toContain(SECRET);
    expect(String(getStageErrorContext(error)!.firstParseError)).not.toContain(SECRET);
  });

  it('after a schema failure', async () => {
    mocks.callLLM.mockResolvedValue(reply(`{"scriptText":"","captions":"${SECRET}","hashtags":"${SECRET}"}`));
    const error = await generateScript(params).catch((e: unknown) => e);
    expect((error as Error).message).not.toContain(SECRET);
    expect((error as Error).message).toContain('failed schema validation');
  });

  it('after a cut-off reply', async () => {
    mocks.callLLM.mockResolvedValueOnce(reply(`{"scriptText":"${SECRET}`, 'length'));
    const error = await generateScript(params).catch((e: unknown) => e);
    expect((error as Error).message).not.toContain(SECRET);
    expect((error as Error).message).toContain('cut off at the output cap');
  });
});
