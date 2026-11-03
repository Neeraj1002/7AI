import { describe, it, expect, vi, beforeEach } from 'vitest';

// Sprint 6 Task 1: "Run review again" completes the open Gate 2 row and Gate 2 reopens on a NEW row. That reopening
// must take the finished packaging (and the founder's choice) over: no new text or image calls, no spend, no reset.
const mocks = vi.hoisted(() => ({
  buildPackaging: vi.fn(), insertUsageEvent: vi.fn(), patchStageOutput: vi.fn(), listStagesForRun: vi.fn(), checkBudget: vi.fn(),
}));
vi.mock('../packaging/build', async (orig) => ({ ...(await orig<object>()), buildPackaging: mocks.buildPackaging }));
vi.mock('../models/repositories/usage-event.repository', async (orig) => ({ ...(await orig<object>()), insertUsageEvent: mocks.insertUsageEvent, sumUsageCostForRun: vi.fn(async () => 0) }));
vi.mock('../models/repositories/pipeline-stage.repository', async (orig) => ({ ...(await orig<object>()), patchStageOutput: mocks.patchStageOutput, listStagesForRun: mocks.listStagesForRun }));
vi.mock('./budget-gate', async (orig) => ({ ...(await orig<object>()), checkBudget: mocks.checkBudget }));
vi.mock('./resolved-config', () => ({ loadResolvedConfig: vi.fn(async () => ({ videoKind: 'long', visualStylePrompt: 'style', titleGuidance: 'guide' })) }));

import { ensurePackagingForGate2 } from './packaging-stage';
import { PACKAGING_OUTPUT_VERSION, scriptHashOf } from '../packaging/build';

const look = { stylePrompt: 'style', titleGuidance: 'guide' };
const SCRIPT = 'the approved script';
const run = { id: 'r1', tenantId: 't1', channelId: 'c1', briefText: 'b', creationOptions: { maxCostUsd: 5 } } as never;
const channel = { id: 'c1', platform: 'youtube' } as never;
const packaged = (status: string, extra: object = {}) => ({
  version: PACKAGING_OUTPUT_VERSION, scriptHash: scriptHashOf(SCRIPT, look), status, packages: [{ id: 'p1' }], ...extra,
});
const gate = (id: string, packaging: object | null, status = 'completed') => ({ id, stageName: 'gate2', status, output: packaging ? { packaging } : {} });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.checkBudget.mockResolvedValue({ ok: true });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

const reopen = (stages: object[]) => {
  mocks.listStagesForRun.mockResolvedValue(stages);
  return ensurePackagingForGate2({ run, channel, gateRow: { id: 'g2-new', output: null }, scriptText: SCRIPT, videoGenOutput: {} });
};

describe('Gate 2 reopened after "Run review again"', () => {
  it('takes the ready packaging and the founder\'s choice over: no build, no spend, nothing reset', async () => {
    const ready = packaged('ready', { choice: { packageId: 'p1', title: 'T', titleEdited: false } });
    const result = await reopen([gate('g2-old', ready), gate('g2-new', null, 'running')]);
    expect(result).toEqual(ready);
    expect(mocks.buildPackaging).not.toHaveBeenCalled();
    expect(mocks.insertUsageEvent).not.toHaveBeenCalled();
    expect(mocks.patchStageOutput).toHaveBeenCalledTimes(1);
    expect(mocks.patchStageOutput).toHaveBeenCalledWith('g2-new', { packaging: ready });
  });

  it('a failed packaging is also kept, not retried for money', async () => {
    await reopen([gate('g2-old', packaged('failed')), gate('g2-new', null, 'running')]);
    expect(mocks.buildPackaging).not.toHaveBeenCalled();
  });

  it('only a skipped (budget-refused) packaging is built again, and only through the normal budget checks', async () => {
    mocks.buildPackaging.mockResolvedValue(packaged('ready'));
    await reopen([gate('g2-old', packaged('skipped')), gate('g2-new', null, 'running')]);
    expect(mocks.checkBudget).toHaveBeenCalled();
    expect(mocks.buildPackaging).toHaveBeenCalledTimes(1);
  });
});
