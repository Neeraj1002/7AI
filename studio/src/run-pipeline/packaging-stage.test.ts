import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  config: vi.fn(),
  list: vi.fn(),
  patch: vi.fn(),
  usage: vi.fn(),
  spent: vi.fn(),
  budget: vi.fn(),
  build: vi.fn(),
}));
vi.mock('./resolved-config', () => ({ loadResolvedConfig: mocks.config }));
vi.mock('./budget-gate', async (orig) => ({ ...(await orig<object>()), checkBudget: mocks.budget }));
vi.mock('../models/repositories/pipeline-stage.repository', async (orig) => ({ ...(await orig<object>()), listStagesForRun: mocks.list, patchStageOutput: mocks.patch }));
vi.mock('../models/repositories/usage-event.repository', async (orig) => ({ ...(await orig<object>()), insertUsageEvent: mocks.usage, sumUsageCostForRun: mocks.spent }));
vi.mock('../packaging/build', async (orig) => ({ ...(await orig<object>()), buildPackaging: mocks.build }));

import { ensurePackagingForGate2, imagesAllowedBySpend, packagingFieldOf, readPackaging } from './packaging-stage';
import { PACKAGING_OUTPUT_VERSION, scriptHashOf, type PackagingOutput } from '../packaging/build';
import { EIFFEL_SCRIPT } from '../packaging/testkit';

const look = { stylePrompt: 'documentary', titleGuidance: null };
const HASH = scriptHashOf(EIFFEL_SCRIPT, look);
const out = (over: Partial<PackagingOutput> = {}): PackagingOutput => ({
  version: PACKAGING_OUTPUT_VERSION, status: 'ready', reason: null, scriptHash: HASH, brief: null, faceMode: null, typeface: null, titleLimit: 70,
  concepts: [], dropped: [], packages: [], textCostUsd: 0.05, imageCostUsd: 0.02, ...over,
});
const run = { id: 'r1', tenantId: 't1', channelId: 'c1', briefText: '', creationOptions: { maxCostUsd: 2 } } as never;
const channel = { id: 'c1', platform: 'youtube' } as never;
const params = (gateRow: { id: string; output: unknown }) => ({ run, channel, gateRow: gateRow as never, scriptText: EIFFEL_SCRIPT, videoGenOutput: {} });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mocks.config.mockResolvedValue({ videoKind: 'long', visualStylePrompt: 'documentary', titleGuidance: null });
  mocks.list.mockResolvedValue([]);
  mocks.patch.mockResolvedValue({});
  mocks.spent.mockResolvedValue(0.4);
  mocks.budget.mockResolvedValue({ ok: true });
  mocks.build.mockResolvedValue(out());
});

describe('imagesAllowedBySpend', () => {
  it('allows all three with no limit, fewer as the limit closes in, none at the limit', () => {
    const base = { imageUsd: 0.01, textReserveUsd: 0.1 };
    expect(imagesAllowedBySpend({ ...base, limitUsd: undefined, spentUsd: 5 })).toBe(3);
    expect(imagesAllowedBySpend({ ...base, limitUsd: 2, spentUsd: 0.4 })).toBe(3);
    expect(imagesAllowedBySpend({ ...base, limitUsd: 0.52, spentUsd: 0.4 })).toBe(1);
    expect(imagesAllowedBySpend({ ...base, limitUsd: 0.4, spentUsd: 0.4 })).toBe(0);
  });
});

describe('ensurePackagingForGate2', () => {
  it('does nothing for a Short (PR A is the long video)', async () => {
    mocks.config.mockResolvedValue({ videoKind: 'short', visualStylePrompt: null, titleGuidance: null });
    expect(await ensurePackagingForGate2(params({ id: 'g2', output: null }))).toBeNull();
    expect(mocks.build).not.toHaveBeenCalled();
  });

  it('builds once, books nothing itself and saves the result on the Gate 2 row', async () => {
    const result = await ensurePackagingForGate2(params({ id: 'g2', output: null }));
    expect(result?.status).toBe('ready');
    expect(mocks.build).toHaveBeenCalledOnce();
    expect(mocks.patch).toHaveBeenCalled();
    expect(mocks.patch.mock.calls.at(-1)![0]).toBe('g2');
    expect(mocks.build.mock.calls[0][0].imagesAllowed).toBe(3);
  });

  it('reuses what is already on this Gate 2 row after a restart, without another call', async () => {
    const result = await ensurePackagingForGate2(params({ id: 'g2', output: { packaging: out() } }));
    expect(result?.scriptHash).toBe(HASH);
    expect(mocks.build).not.toHaveBeenCalled();
  });

  it('takes finished packaging over from an earlier Gate 2 row when a Revise reopens the gate (no second payment)', async () => {
    mocks.list.mockResolvedValue([{ id: 'old', stageName: 'gate2', output: { outcome: 'revise', packaging: out() } }]);
    const result = await ensurePackagingForGate2(params({ id: 'new', output: null }));
    expect(result?.status).toBe('ready');
    expect(mocks.build).not.toHaveBeenCalled();
    expect(mocks.patch).toHaveBeenCalledWith('new', { packaging: expect.objectContaining({ scriptHash: HASH }) });
  });

  it('a failure never throws: it is recorded and Gate 2 opens with YouTube\'s thumbnail', async () => {
    mocks.build.mockRejectedValue(new Error('provider exploded'));
    const result = await ensurePackagingForGate2(params({ id: 'g2', output: null }));
    expect(result?.status).toBe('failed');
    expect(result?.reason).toMatch(/provider exploded/);
    const saved = mocks.patch.mock.calls.at(-1)![1].packaging;
    expect(saved.status).toBe('failed');
  });

  it('is skipped, with the reason, when the channel budget is exhausted', async () => {
    mocks.budget.mockResolvedValue({ ok: false });
    const result = await ensurePackagingForGate2(params({ id: 'g2', output: null }));
    expect(result?.status).toBe('skipped');
    expect(mocks.build).not.toHaveBeenCalled();
  });
});

describe('packagingFieldOf / readPackaging', () => {
  it('reads only output with this task\'s version and shape', () => {
    expect(readPackaging({ packaging: out() })?.status).toBe('ready');
    expect(readPackaging({ packaging: { ...out(), version: 99 } })).toBeNull();
    expect(readPackaging(null)).toBeNull();
    expect(readPackaging({ outcome: 'approve' })).toBeNull();
  });
  it('re-attaches packaging when Gate 2 records its decision', async () => {
    mocks.list.mockResolvedValue([{ id: 'g2', output: { packaging: out({ reason: 'kept' }) } }]);
    expect(await packagingFieldOf('r1', 'g2')).toEqual({ packaging: expect.objectContaining({ reason: 'kept' }) });
    expect(await packagingFieldOf('r1', 'other')).toEqual({});
  });
});

import { roundTwoRoomFor } from './packaging-stage';

describe('roundTwoRoomFor (R10 rule 2: the budget is checked before a second round spends)', () => {
  const base = { budgetOk: true, spentUsd: 0.4, imageUsd: 0.01, textReserveUsd: 0.1 };
  it('allows a round when the limit and the retry allowance leave room', () => {
    expect(roundTwoRoomFor({ ...base, limitUsd: 2, allowanceUsd: 2 })).toEqual({ ok: true, imagesAllowed: 3, reason: null });
    expect(roundTwoRoomFor(base).ok).toBe(true);
  });
  it('refuses, with the reason, when the channel budget is reached', () => {
    expect(roundTwoRoomFor({ ...base, budgetOk: false })).toMatchObject({ ok: false, reason: "the channel's spending limit is reached" });
  });
  it("refuses when the run's limit leaves fewer than two pictures, and names which limit", () => {
    const tight = roundTwoRoomFor({ ...base, limitUsd: 0.51 });
    expect(tight.ok).toBe(false);
    expect(tight.reason).toMatch(/the run's spend limit leaves no room/);
  });
  it('the retry allowance counts: the smaller of the two caps decides', () => {
    const r = roundTwoRoomFor({ ...base, limitUsd: 5, allowanceUsd: 0.5 });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/the run's retry allowance/);
  });
});
