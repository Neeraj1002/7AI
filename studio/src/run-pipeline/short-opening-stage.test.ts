import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ config: vi.fn(), budget: vi.fn(), usage: vi.fn(), update: vi.fn(), opening: vi.fn() }));
vi.mock('./resolved-config', () => ({ loadResolvedConfig: mocks.config }));
vi.mock('./budget-gate', async (orig) => ({ ...(await orig<object>()), checkBudget: mocks.budget }));
vi.mock('../models/repositories/usage-event.repository', async (orig) => ({ ...(await orig<object>()), insertUsageEvent: mocks.usage, sumUsageCostForRun: vi.fn() }));
vi.mock('../models/repositories/pipeline-run.repository', async (orig) => ({ ...(await orig<object>()), updatePipelineRun: mocks.update }));
vi.mock('../packaging/opening', async (orig) => ({ ...(await orig<object>()), buildShortOpening: mocks.opening }));

import { ensureShortOpening } from './packaging-stage';
import { scriptHashOf } from '../packaging/build';
import { EIFFEL_SCRIPT } from '../packaging/testkit';

const look = { stylePrompt: 'documentary', titleGuidance: null };
const HASH = scriptHashOf(EIFFEL_SCRIPT, look);
const channel = { id: 'c1', platform: 'youtube' } as never;
const base = { id: 'r1', tenantId: 't1', channelId: 'c1', briefText: '' };
const params = (creationOptions: object = {}) => ({ run: { ...base, creationOptions } as never, channel, scriptText: EIFFEL_SCRIPT, stageId: 's1' });
const opening = { scriptHash: HASH, hookLine: 'Why was it nearly torn down?', firstStillPrompt: 'a scene', question: 'q', device: 'stake', answerQuote: 'a', reasons: [], note: null, textCostUsd: 0.01, builtAt: 'x', brief: null };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mocks.config.mockResolvedValue({ videoKind: 'short', visualStylePrompt: 'documentary', titleGuidance: null });
  mocks.budget.mockResolvedValue({ ok: true });
  mocks.opening.mockResolvedValue(opening);
});

describe('ensureShortOpening (R7)', () => {
  it('makes the opening once, books it through the hook, and keeps it on the run', async () => {
    mocks.opening.mockImplementation(async (p: { onText: (l: string, c: unknown[]) => Promise<void> }) => {
      await p.onText('brief', [{ costUsd: '0.01', usage: { inputTokens: 1, outputTokens: 1 }, provider: 'anthropic', model: 'm' }]);
      return opening;
    });
    const out = await ensureShortOpening(params());
    expect(out).toEqual({ hookLine: 'Why was it nearly torn down?', firstStillPrompt: 'a scene' });
    expect(mocks.usage).toHaveBeenCalledOnce();
    expect(mocks.usage.mock.calls[0][0]).toMatchObject({ agent: 'packaging-brief', stageId: 's1' });
    expect(mocks.update).toHaveBeenCalledWith('r1', { creationOptionsMerge: { opening: expect.objectContaining({ scriptHash: HASH, hookLine: 'Why was it nearly torn down?' }) } });
  });

  it('reuses what the run already holds for the same script: a retry or a Revise never pays twice', async () => {
    const out = await ensureShortOpening(params({ opening }));
    expect(out?.hookLine).toBe('Why was it nearly torn down?');
    expect(mocks.opening).not.toHaveBeenCalled();
    expect(mocks.usage).not.toHaveBeenCalled();
  });

  it('builds again when the script is not the one it was made for', async () => {
    await ensureShortOpening(params({ opening: { ...opening, scriptHash: 'older' } }));
    expect(mocks.opening).toHaveBeenCalledOnce();
  });

  it('does nothing for a long video, and nothing when the channel budget is reached', async () => {
    mocks.config.mockResolvedValue({ videoKind: 'long', visualStylePrompt: null, titleGuidance: null });
    expect(await ensureShortOpening(params())).toBeUndefined();
    mocks.config.mockResolvedValue({ videoKind: 'short', visualStylePrompt: null, titleGuidance: null });
    mocks.budget.mockResolvedValue({ ok: false });
    expect(await ensureShortOpening(params())).toBeUndefined();
    expect(mocks.opening).not.toHaveBeenCalled();
  });

  it('a failure never stops the video: it returns nothing and the Short is made as before', async () => {
    mocks.opening.mockRejectedValue(new Error('provider exploded'));
    expect(await ensureShortOpening(params())).toBeUndefined();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
