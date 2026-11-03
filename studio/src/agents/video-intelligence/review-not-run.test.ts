import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ callProviderModel: vi.fn() }));
vi.mock('../../llm/client', () => ({ callProviderModel: mocks.callProviderModel }));

import { outcomeFromJson, MultimodalVerdictSchema } from './index';
import { callLLMJson } from '../../llm/json';
import { formatGate2Message, parseGate2Reply, REPAIR_NOT_VERIFIED_BANNER, REVIEW_NOT_RUN_BANNER } from '../gate2';

const reply = (text: string) => ({ text, usage: { inputTokens: 1000, outputTokens: 50 }, stopReason: 'stop', costUsd: '0.002000' });
const review = () =>
  callLLMJson({
    purpose: 'video-intelligence-own-draft',
    system: 's',
    schema: MultimodalVerdictSchema,
    messages: [{ role: 'user', content: 'review', attachments: [{ mediaType: 'image/jpeg', dataBase64: 'AAAA' }] }],
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('video review reply handling', () => {
  it('schema-valid reply: the verdict passes through and the schema was sent', async () => {
    mocks.callProviderModel.mockResolvedValueOnce(reply('{"verdict":"pass","notes":"fine"}'));
    const outcome = outcomeFromJson(await review(), undefined, [1], undefined);
    expect(outcome).toMatchObject({ verdict: 'pass', rationale: 'fine', multimodalRan: true });
    expect(outcome.reviewFailures).toBeUndefined();
    expect(mocks.callProviderModel.mock.calls[0][0].outputSchema).toBe(MultimodalVerdictSchema);
  });

  it('bad then valid: the re-ask gives the verdict, both calls are kept, the first bad reply is recorded', async () => {
    mocks.callProviderModel
      .mockResolvedValueOnce(reply('{"verdict":"pass","notes":"a "quoted" word"}'))
      .mockResolvedValueOnce(reply('{"verdict":"fail","notes":"blurry"}'));
    const outcome = outcomeFromJson(await review(), undefined, [1], undefined);
    expect(outcome).toMatchObject({ verdict: 'fail', rationale: 'blurry' });
    expect(outcome.llmCalls).toHaveLength(2);
    expect(outcome.reviewFailures).toHaveLength(1);
  });

  it('bad twice: not_run, never pass, no throw, every raw reply kept, both calls billed', async () => {
    mocks.callProviderModel.mockResolvedValueOnce(reply('{"verdict":"pass",')).mockResolvedValueOnce(reply('I cannot tell'));
    const outcome = outcomeFromJson(await review(), undefined, [1], undefined);
    expect(outcome.verdict).toBe('not_run');
    expect(outcome.rationale).toMatch(/^Automated review did not run/);
    expect(outcome.reviewFailures?.map((f) => f.rawReply)).toEqual(['{"verdict":"pass",', 'I cannot tell']);
    expect(outcome.llmCalls).toHaveLength(2);
    expect(mocks.callProviderModel).toHaveBeenCalledTimes(2);
  });

  it('two defects in a valid reply keep the first (the bound is enforced in code too)', () => {
    const defect = (id: string) => ({ sceneId: id, timestampSeconds: 1, kind: 'artifact' as const, reason: 'r', requiredVisualConstraints: [] });
    const outcome = outcomeFromJson(
      { ok: true, value: { verdict: 'fail', notes: 'n', visualDefects: [defect('a'), defect('b')] }, calls: [{} as never], failures: [] },
      undefined,
      [1],
      [{ sceneId: 'a', startSec: 0, endSec: 2 }, { sceneId: 'b', startSec: 0, endSec: 2 }],
    );
    expect(outcome.visualDefects?.map((d) => d.sceneId)).toEqual(['a']);
  });
});

describe('Gate 2 when the review did not run', () => {
  it('first-build message carries the banner and the rerun command', () => {
    const text = formatGate2Message({ channelName: 'Ch', verdict: 'not_run', rationale: 'Automated review did not run: x' });
    expect(text).toContain(REVIEW_NOT_RUN_BANNER.toUpperCase());
    expect(text).toContain('run review again');
  });
  it('repaired message says the repair is not verified', () => {
    const text = formatGate2Message({ channelName: 'Ch', verdict: 'not_run', rationale: 'r', repaired: true });
    expect(text).toContain(REPAIR_NOT_VERIFIED_BANNER.toUpperCase());
  });
  it('a normal verdict shows no banner and no rerun command', () => {
    const text = formatGate2Message({ channelName: 'Ch', verdict: 'pass', rationale: 'r' });
    expect(text).not.toMatch(/did not run|run review again/i);
  });
  it('"run review again" is an exact command; anything else stays revision notes', () => {
    expect(parseGate2Reply(' Run review again ')).toEqual({ type: 'rereview' });
    expect(parseGate2Reply('please run review again and fix the music')).toMatchObject({ type: 'revise' });
  });
});
