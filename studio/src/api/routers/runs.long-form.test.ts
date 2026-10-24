import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findChannelById: vi.fn(),
  findByChannel: vi.fn(),
  findActiveProfileForChannel: vi.fn(),
  createRun: vi.fn(),
  getRemainingWeeklyUsd: vi.fn(),
  findPipelineRunById: vi.fn(),
  listStagesForRun: vi.fn(),
}));

vi.mock('../../models/repositories/pipeline-run.repository', () => ({
  findPipelineRunById: mocks.findPipelineRunById,
  updatePipelineRun: vi.fn(),
  listRuns: vi.fn(),
  CANCELLED_BY_USER: 'Cancelled by user',
}));
vi.mock('../../models/repositories/pipeline-stage.repository', () => ({
  listStagesForRun: mocks.listStagesForRun,
  findLatestAttempt: vi.fn(),
  findLatestCompletedAttempt: vi.fn(),
}));
vi.mock('../../models/repositories/review-log.repository', () => ({ listReviewLogsForRun: vi.fn().mockResolvedValue([]) }));
vi.mock('../../models/repositories/channel.repository', () => ({ findChannelById: mocks.findChannelById }));
vi.mock('../../models/repositories/agent-credential.repository', () => ({ findByChannel: mocks.findByChannel }));
vi.mock('../../models/repositories/channel-profile-version.repository', () => ({
  findActiveProfileForChannel: mocks.findActiveProfileForChannel,
  findProfileVersionById: vi.fn(),
}));
vi.mock('../../run-pipeline/state-machine', () => ({ createRun: mocks.createRun }));
vi.mock('../../run-pipeline/budget-gate', () => ({
  checkBudget: vi.fn(),
  describeBudgetRefusal: () => '',
  getRemainingWeeklyUsd: mocks.getRemainingWeeklyUsd,
  NoBudgetConfiguredError: class NoBudgetConfiguredError extends Error {},
}));
vi.mock('../../run-pipeline/pipeline-runner', () => ({
  startPipelineInBackground: vi.fn(),
  continuePipelineInBackground: vi.fn(),
}));

import { runsRouter, deriveChapters } from './runs';

const CHANNEL_ID = '22222222-2222-4222-8222-222222222222';
const ctx = { tenantId: 't1', userId: 'u1', role: 'owner' } as never;
const caller = () => runsRouter.createCaller(ctx);
const base = { channelId: CHANNEL_ID, briefText: 'a brief' };

const profile = (offeredFormatKeys?: string[]) => ({ data: offeredFormatKeys ? { offeredFormatKeys } : {} });
const createdAll = () => mocks.createRun.mock.calls[0]![0].creationOptions;
// The user's picks as stored, without the Task 12 resolvedOptions (checked in runs.run-screen-data.test.ts).
const createdOptions = () => {
  const picks = { ...createdAll() };
  delete picks.resolvedOptions;
  return Object.keys(picks).length > 0 ? picks : undefined;
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findChannelById.mockResolvedValue({
    id: CHANNEL_ID, tenantId: 't1', name: 'Chan', isActive: true, platform: 'youtube', styleGuide: null, defaultVoice: null,
  });
  mocks.findByChannel.mockResolvedValue({ id: 'cred' });
  mocks.findActiveProfileForChannel.mockResolvedValue(null);
  mocks.createRun.mockResolvedValue({ id: 'run1' });
  mocks.getRemainingWeeklyUsd.mockResolvedValue(7.5);
});

describe('runs.create: Shorts unchanged', () => {
  it('a request with neither videoKind nor length creates no creationOptions at all', async () => {
    await caller().create(base);
    expect(createdOptions()).toBeUndefined();
  });

  it('a Short with a length stores only that length, exactly as before', async () => {
    await caller().create({ ...base, targetDurationSec: 45 });
    expect(createdOptions()).toEqual({ targetDurationSec: 45 });
  });

  it('a Short keeps today validation: 90 s is refused', async () => {
    await expect(caller().create({ ...base, targetDurationSec: 90 })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('a Short with a format stores just the format', async () => {
    await caller().create({ ...base, formatKey: 'countdown' });
    expect(createdOptions()).toEqual({ formatKey: 'countdown' });
  });
});

const planBrief = (titles: number, budgets?: number) =>
  `Topic: x
Constraint: chapters, titles exactly: ${Array.from({ length: titles }, (_, i) => `"Title ${i + 1}"`).join(', ')}.` +
  (budgets === undefined ? '' : `
Constraint: word budgets: ${Array.from({ length: budgets }, () => 150).join(', ')}.`);

describe('runs.create: chapter plan intake check (before any spend)', () => {
  it('stops a long brief whose titles and word budgets disagree, with a plain sentence and no run', async () => {
    await expect(caller().create({ channelId: CHANNEL_ID, briefText: planBrief(8, 7), videoKind: 'long' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringContaining('8 titles but 7 word budgets'),
    });
    expect(mocks.createRun).not.toHaveBeenCalled();
    expect(mocks.getRemainingWeeklyUsd).not.toHaveBeenCalled();
  });

  it('refuses 21 chapters', async () => {
    await expect(caller().create({ channelId: CHANNEL_ID, briefText: planBrief(21), videoKind: 'long', targetDurationSec: 900 })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringContaining('21 chapters'),
    });
    expect(mocks.createRun).not.toHaveBeenCalled();
  });

  it.each([7, 8, 9])('accepts %i listed chapters in 10 minutes without a warning', async (n) => {
    await caller().create({ channelId: CHANNEL_ID, briefText: planBrief(n, n), videoKind: 'long' });
    expect(createdAll().intakeWarnings).toBeUndefined();
  });

  it('records a warning, and still creates the run, when the average chapter is under 40 seconds', async () => {
    await caller().create({ channelId: CHANNEL_ID, briefText: planBrief(9), videoKind: 'long', targetDurationSec: 300 });
    expect(createdAll().intakeWarnings).toEqual([expect.stringMatching(/9 chapters in a 5-minute video/)]);
  });

  it('leaves a Short alone, whatever its brief says', async () => {
    await caller().create({ channelId: CHANNEL_ID, briefText: planBrief(8, 7) });
    expect(mocks.createRun).toHaveBeenCalledOnce();
    expect(createdOptions()).toBeUndefined();
  });
});

describe('runs.create: long-form', () => {
  it('stores videoKind, the default 600 s and the suggested spend limit', async () => {
    await caller().create({ ...base, videoKind: 'long' });
    const opts = createdOptions();
    expect(opts).toMatchObject({ videoKind: 'long', targetDurationSec: 600 });
    expect(opts.maxCostUsd).toBeGreaterThan(1);
  });

  it('infers long from a long format and takes its length', async () => {
    await caller().create({ ...base, formatKey: 'chaptered-explainer' });
    expect(createdOptions()).toMatchObject({ videoKind: 'long', targetDurationSec: 600, formatKey: 'chaptered-explainer' });
  });

  it('accepts whole minutes 2..15 and refuses anything else with the plain message', async () => {
    await caller().create({ ...base, videoKind: 'long', targetDurationSec: 120 });
    expect(createdOptions().targetDurationSec).toBe(120);
    for (const bad of [60, 90, 150, 960, 45]) {
      await expect(caller().create({ ...base, videoKind: 'long', targetDurationSec: bad })).rejects.toThrow(
        'Video length must be a whole number of minutes from 2 to 15',
      );
    }
  });

  it('refuses a format whose kind disagrees with videoKind', async () => {
    await expect(caller().create({ ...base, videoKind: 'short', formatKey: 'chaptered-explainer' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    await expect(caller().create({ ...base, videoKind: 'long', formatKey: 'countdown' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('refuses stock footage for a long video', async () => {
    await expect(caller().create({ ...base, videoKind: 'long', visualSource: 'stock-footage' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    await caller().create({ ...base, videoKind: 'long', visualSource: 'ai-stills' });
  });

  it('validates maxCostUsd: below the estimate and above the absolute cap are refused, a good one is stored', async () => {
    await expect(caller().create({ ...base, videoKind: 'long', maxCostUsd: 0.5 })).rejects.toThrow(/below the estimated \$/);
    await expect(caller().create({ ...base, videoKind: 'long', maxCostUsd: 50 })).rejects.toThrow(/cannot be more than \$10\.00/);
    await caller().create({ ...base, videoKind: 'long', maxCostUsd: 4 });
    expect(createdOptions().maxCostUsd).toBe(4);
  });

  it('refuses a spend limit on a Short', async () => {
    await expect(caller().create({ ...base, maxCostUsd: 2 })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('runs.create: formats offered by the channel (R1b)', () => {
  it('an empty or missing list accepts any known format', async () => {
    await caller().create({ ...base, formatKey: 'top-3' });
    mocks.findActiveProfileForChannel.mockResolvedValue(profile([]));
    await caller().create({ ...base, formatKey: 'top-3' });
    expect(mocks.createRun).toHaveBeenCalledTimes(2);
  });

  it('a non-empty list refuses a format outside it and accepts one inside it', async () => {
    mocks.findActiveProfileForChannel.mockResolvedValue(profile(['top-3', 'chaptered-explainer']));
    await expect(caller().create({ ...base, formatKey: 'countdown' })).rejects.toThrow('That format is not offered by this channel');
    await caller().create({ ...base, formatKey: 'top-3' });
    await caller().create({ ...base, formatKey: 'chaptered-explainer' });
  });

  it('Freeform (no formatKey) is always allowed', async () => {
    mocks.findActiveProfileForChannel.mockResolvedValue(profile(['top-3']));
    await caller().create(base);
    expect(createdOptions()).toBeUndefined();
  });
});

describe('runs.estimateCost', () => {
  it('returns the estimate, its range with retries, and the weekly figures for a 10-minute video', async () => {
    const out = await caller().estimateCost({ channelId: CHANNEL_ID, videoKind: 'long', targetDurationSec: 600 });
    expect(Object.keys(out).sort()).toEqual(['estimateUsd', 'rangeUsd', 'remainingWeeklyUsd', 'retryAllowanceUsd', 'suggestedMaxUsd', 'worstCaseUsd']);
    expect(out.remainingWeeklyUsd).toBe(7.5);
    expect(out.suggestedMaxUsd).toBeGreaterThanOrEqual(out.estimateUsd * 1.5);
    expect(out.worstCaseUsd).toBeGreaterThan(out.estimateUsd);
  });

  it('the default long length is 10 minutes, and the suggested limit is what create accepts', async () => {
    const out = await caller().estimateCost({ channelId: CHANNEL_ID, videoKind: 'long' });
    await caller().create({ ...base, videoKind: 'long', maxCostUsd: out.suggestedMaxUsd });
  });

  it('validates length per kind and the channel tenant', async () => {
    await expect(caller().estimateCost({ channelId: CHANNEL_ID, videoKind: 'long', targetDurationSec: 90 })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    mocks.findChannelById.mockResolvedValue({ id: CHANNEL_ID, tenantId: 'other' });
    await expect(caller().estimateCost({ channelId: CHANNEL_ID, videoKind: 'long' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('runs.get long-form fields', () => {
  const RUN_ID = '44444444-4444-4444-8444-444444444444';
  const run = (creationOptions: unknown) => ({
    id: RUN_ID, tenantId: 't1', channelId: CHANNEL_ID, status: 'running', currentStage: 'script_generation',
    creationOptions, profileVersionId: null, lastError: null, createdAt: new Date(), startedAt: null, updatedAt: new Date(),
  });

  it('a Short reports videoKind short and its length, with no long-form fields', async () => {
    mocks.findPipelineRunById.mockResolvedValue(run(null));
    mocks.listStagesForRun.mockResolvedValue([]);
    const out = await caller().get({ id: RUN_ID });
    expect([out.videoKind, out.targetSeconds]).toEqual(['short', 45]);
    for (const key of ['chapters', 'previewUrl', 'subtitlesUrl', 'subtitlesUploaded', 'subtitlesMessage']) {
      expect(key in out).toBe(false);
    }
  });

  it('a long run reports videoKind long and its stored length, and chapters once a script has them', async () => {
    mocks.findPipelineRunById.mockResolvedValue(run({ videoKind: 'long', targetDurationSec: 300 }));
    const chapters = [{ title: 'Why', text: 'Because.' }];
    mocks.listStagesForRun.mockResolvedValue([
      { stageName: 'script_generation', status: 'completed', attemptNumber: 1, output: { scriptText: 'Because.', chapters } },
    ]);
    const out = await caller().get({ id: RUN_ID });
    expect([out.videoKind, out.targetSeconds]).toEqual(['long', 300]);
    expect(out.chapters).toEqual(chapters);
  });
});

describe('deriveChapters', () => {
  const stage = (attemptNumber: number, output: unknown, status = 'completed') =>
    ({ stageName: 'script_generation', status, attemptNumber, output }) as never;

  it('is absent for a Short (no chapters in the output) and before any script', () => {
    expect(deriveChapters([])).toBeUndefined();
    expect(deriveChapters([stage(1, { scriptText: 'x' })])).toBeUndefined();
  });

  it('reads the latest completed attempt chapters', () => {
    const chapters = [{ title: 'Why', text: 'Because.' }];
    expect(deriveChapters([stage(1, { chapters: [{ title: 'old', text: 'o' }] }), stage(2, { chapters })])).toEqual(chapters);
    expect(deriveChapters([stage(1, { chapters }), stage(2, { chapters: [] }, 'running')])).toEqual(chapters);
  });
});

describe('runs.create: stale channel voice (review of #104)', () => {
  it('refuses a channel default voice that is no longer offered, before any run exists', async () => {
    mocks.findChannelById.mockResolvedValue({ ...(await mocks.findChannelById()), defaultVoice: 'retired-voice' });
    await expect(caller().create(base)).rejects.toMatchObject({ code: 'BAD_REQUEST', message: expect.stringContaining('retired-voice') });
    expect(mocks.createRun).not.toHaveBeenCalled();
  });
});
