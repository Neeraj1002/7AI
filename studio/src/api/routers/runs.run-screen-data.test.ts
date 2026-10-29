import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findChannelById: vi.fn(),
  findByChannel: vi.fn(),
  findActiveProfileForChannel: vi.fn(),
  createRun: vi.fn(),
  findPipelineRunById: vi.fn(),
  listStagesForRun: vi.fn(),
  listReviewLogsForRun: vi.fn(),
  sumUsageCostForRun: vi.fn(),
  listUsageCostByStage: vi.fn(),
  getRemainingWeeklyUsd: vi.fn(),
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
vi.mock('../../models/repositories/review-log.repository', () => ({ listReviewLogsForRun: mocks.listReviewLogsForRun }));
vi.mock('../../models/repositories/usage-event.repository', () => ({ sumUsageCostForRun: mocks.sumUsageCostForRun, listUsageCostByStage: mocks.listUsageCostByStage }));
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

import { runsRouter, deriveGateDecisions } from './runs';

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const CHANNEL_ID = '22222222-2222-4222-8222-222222222222';
const ctx = { tenantId: 't1', userId: 'u1', role: 'owner' } as never;
const caller = () => runsRouter.createCaller(ctx);
const at = (iso: string) => new Date(iso);

const run = (creationOptions: unknown = null) => ({
  id: RUN_ID, tenantId: 't1', channelId: CHANNEL_ID, status: 'completed', currentStage: null, briefText: 'b',
  intakeParsed: null, creationOptions, profileVersionId: null, retryCount: 0, lastError: null,
  startedAt: null, completedAt: null, createdAt: at('2026-10-01T00:00:00Z'), updatedAt: at('2026-10-01T00:00:00Z'),
});
const gateStage = (id: string, stageName: 'gate1' | 'gate2', output: Record<string, unknown>, done: string) => ({
  id, pipelineRunId: RUN_ID, stageName, status: 'completed', attemptNumber: 1, input: null, output,
  startedAt: at(done), completedAt: at(done), error: null, createdAt: at(done), updatedAt: at(done),
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findChannelById.mockResolvedValue({
    id: CHANNEL_ID, tenantId: 't1', name: 'Chan', isActive: true, platform: 'youtube', styleGuide: null, defaultVoice: null,
  });
  mocks.findByChannel.mockResolvedValue({ id: 'cred' });
  mocks.findActiveProfileForChannel.mockResolvedValue(null);
  mocks.createRun.mockResolvedValue({ id: 'run1' });
  mocks.listStagesForRun.mockResolvedValue([]);
  mocks.listReviewLogsForRun.mockResolvedValue([]);
  mocks.sumUsageCostForRun.mockResolvedValue(0);
  mocks.listUsageCostByStage.mockResolvedValue(new Map());
});

describe('runs.get: older run is unchanged', () => {
  it('has no resolvedOptions, gateDecisions or maxCostUsd; spentUsd is 0', async () => {
    mocks.findPipelineRunById.mockResolvedValue(run());
    const detail = await caller().get({ id: RUN_ID });
    expect(detail).not.toHaveProperty('resolvedOptions');
    expect(detail).not.toHaveProperty('gateDecisions');
    expect(detail).not.toHaveProperty('maxCostUsd');
    expect(detail.spentUsd).toBe(0);
    expect(detail.lastGateDecision).toBeNull();
  });
});

describe('runs.get: chapterBounds (R9)', () => {
  const titled = (n: number) =>
    `Topic: x\nConstraint: chapters, titles exactly: ${Array.from({ length: n }, (_, i) => `"Title ${i + 1}"`).join(', ')}.`;
  const longRun = (targetDurationSec: number | undefined, briefText: string | null) => ({
    ...run({ videoKind: 'long', ...(targetDurationSec !== undefined && { targetDurationSec }) }),
    briefText: briefText as string,
  });
  const boundsOf = async () => (await caller().get({ id: RUN_ID })).chapterBounds;

  it('is null for a Short, and the existing fields are as before', async () => {
    mocks.findPipelineRunById.mockResolvedValue(run({ targetDurationSec: 45 }));
    const detail = await caller().get({ id: RUN_ID });
    expect(detail.chapterBounds).toBeNull();
    expect(detail).toMatchObject({ videoKind: 'short', targetSeconds: 45, spentUsd: 0, lastGateDecision: null });
    expect(detail).not.toHaveProperty('resolvedOptions');
  });

  it('gives a 10-minute run with no titles the default range', async () => {
    mocks.findPipelineRunById.mockResolvedValue(longRun(600, 'a brief with no chapter list'));
    expect(await boundsOf()).toEqual({ min: 3, max: 20, minWordsPerChapter: 26, exactCount: false, editMin: 3, editMax: 20, targetWords: 1550 });
  });

  it.each([7, 8, 9])('gives a run whose brief lists %i titles exactly that count', async (n) => {
    mocks.findPipelineRunById.mockResolvedValue(longRun(600, titled(n)));
    expect(await boundsOf()).toEqual({ min: n, max: n, minWordsPerChapter: 26, exactCount: true, editMin: 3, editMax: 20, targetWords: 1550 });
  });

  it.each([
    [120, 12],
    [300, 20],
    [900, 20],
  ])('a %i s run has the length-based ceiling %i', async (seconds, max) => {
    mocks.findPipelineRunById.mockResolvedValue(longRun(seconds, 'no list'));
    expect(await boundsOf()).toMatchObject({ min: 3, max, exactCount: false, editMin: 3, editMax: max });
  });

  it('gives an old long run (no stored length, no readable brief) the default, without throwing', async () => {
    mocks.findPipelineRunById.mockResolvedValue(longRun(undefined, null));
    expect(await boundsOf()).toEqual({ min: 3, max: 20, minWordsPerChapter: 26, exactCount: false, editMin: 3, editMax: 20, targetWords: 1550 });
  });

  it('a 7-title brief keeps the edit range wider than the generation range, up to the length ceiling', async () => {
    mocks.findPipelineRunById.mockResolvedValue(longRun(120, titled(7)));
    expect(await boundsOf()).toMatchObject({ min: 7, max: 7, exactCount: true, editMin: 3, editMax: 12, targetWords: 310 });
  });

  it('targetWords is the word count the brief states, else minutes x pace', async () => {
    mocks.findPipelineRunById.mockResolvedValue(longRun(600, 'Topic: x\nConstraint: about 1,500 words for a 10 minute video.'));
    expect(await boundsOf()).toMatchObject({ targetWords: 1500 });
    mocks.findPipelineRunById.mockResolvedValue(longRun(300, 'no stated count'));
    expect(await boundsOf()).toMatchObject({ targetWords: 775 });
  });

  it('spends nothing and calls no model', async () => {
    mocks.findPipelineRunById.mockResolvedValue(longRun(600, titled(7)));
    await boundsOf();
    expect(mocks.createRun).not.toHaveBeenCalled();
  });
});

describe('runs.get: spend (R3)', () => {
  it('returns the summed cost rounded to 4 decimals and the run spend limit', async () => {
    mocks.findPipelineRunById.mockResolvedValue(run({ videoKind: 'long', targetDurationSec: 600, maxCostUsd: 4 }));
    mocks.sumUsageCostForRun.mockResolvedValue(0.123449999);
    const detail = await caller().get({ id: RUN_ID });
    expect(mocks.sumUsageCostForRun).toHaveBeenCalledWith(RUN_ID);
    expect(detail.spentUsd).toBe(0.1234);
    expect(detail.maxCostUsd).toBe(4);
  });
});

describe('runs.get: attempt outcomes and cost per attempt and stage (Task 8 R5, R8.7)', () => {
  const stage = (id: string, stageName: string, attemptNumber: number, status: string, output: unknown, input: unknown = null, error: string | null = null) => ({
    id, pipelineRunId: RUN_ID, stageName, status, attemptNumber, input, output, error,
    startedAt: at('2026-10-18T10:00:00Z'), completedAt: at('2026-10-18T10:05:00Z'), createdAt: at('2026-10-18T10:00:00Z'), updatedAt: at('2026-10-18T10:05:00Z'),
  });

  it('replays the Lego run: attempt 1 is a failed review with its reason, attempt 2 completed; money adds up', async () => {
    mocks.findPipelineRunById.mockResolvedValue(run({ videoKind: 'long', maxCostUsd: 1, estimateUsd: 0.24, retryAllowanceUsd: 0.48 }));
    mocks.listStagesForRun.mockResolvedValue([
      stage('s-script', 'script_generation', 1, 'completed', { scriptText: 'x' }),
      stage('s-gen1', 'video_generation', 1, 'completed', { videoPath: '/v/1.mp4' }),
      stage('s-rev1', 'video_review', 1, 'completed', { verdict: 'fail', reasonCode: 'shot_length', rationale: 'Longest AI still shot is 8.3s (pacing limit: 7.5s)' }, { videoPath: '/v/1.mp4' }),
      stage('s-gen2', 'video_generation', 2, 'completed', { videoPath: '/v/2.mp4' }),
      stage('s-rev2', 'video_review', 2, 'completed', { verdict: 'pass', rationale: 'ok' }, { videoPath: '/v/2.mp4' }),
    ]);
    const costs = new Map<string | null, number>([['s-script', 0.02], ['s-gen1', 0.2], ['s-rev1', 0], ['s-gen2', 0.0125], ['s-rev2', 0.004], [null, 0.001]]);
    mocks.listUsageCostByStage.mockResolvedValue(costs);
    mocks.sumUsageCostForRun.mockResolvedValue(0.2375);
    const detail = await caller().get({ id: RUN_ID });

    expect(detail.videoAttempts.map((a) => [a.attempt, a.outcome])).toEqual([[1, 'failed_review'], [2, 'completed']]);
    expect(detail.videoAttempts[0]).toMatchObject({ reasonCode: 'shot_length', errorClass: 'content' });
    expect(detail.videoAttempts[0].reason).toContain('8.3s');
    expect(detail.videoAttempts[0].stages.map((s) => s.stageName)).toEqual(['video_generation', 'video_review']);
    expect(detail.videoAttempts[0].costUsd).toBe(0.2);
    expect(detail.videoAttempts[1].costUsd).toBe(0.0165);
    // the review stage row is not "done": it failed review
    expect(detail.stageSummaries.find((s) => s.stageId === 's-rev1')).toMatchObject({ status: 'completed', outcome: 'failed_review' });
    expect(detail.stageSummaries.find((s) => s.stageId === 's-script')).toMatchObject({ outcome: 'completed', costUsd: 0.02 });
    // totals add up: attempts + other stages + usage not tied to a stage = spent
    const c = detail.cost;
    expect(c).toMatchObject({ estimateUsd: 0.24, limitUsd: 1, retryAllowanceUsd: 0.48 });
    expect(Number((c.attemptsUsd + c.otherStagesUsd + c.unattributedUsd).toFixed(6))).toBe(c.spentUsd);
    expect(c.spentUsd).toBeCloseTo(0.2375, 6);
    expect(c.unattributedUsd).toBe(0.001);
  });

  it('a provider limit during review is a blocked attempt with the provider message, not a failure of the video', async () => {
    mocks.findPipelineRunById.mockResolvedValue(run());
    mocks.listStagesForRun.mockResolvedValue([
      stage('g', 'video_generation', 3, 'completed', { videoPath: '/v/3.mp4' }),
      stage('r', 'video_review', 1, 'failed', { recovery: { kind: 'provider_capacity', message: 'capacity', providerErrorMessage: 'regain access on 2026-11-01' } }, { videoPath: '/v/3.mp4' }, 'LLM provider capacity exhausted'),
    ]);
    const detail = await caller().get({ id: RUN_ID });
    expect(detail.videoAttempts[0]).toMatchObject({ attempt: 3, outcome: 'blocked', errorClass: 'provider_limit', retryStep: 'video_review', reason: 'regain access on 2026-11-01' });
  });

  it('an older run with no stage costs still returns the new fields, empty', async () => {
    mocks.findPipelineRunById.mockResolvedValue(run());
    const detail = await caller().get({ id: RUN_ID });
    expect(detail.videoAttempts).toEqual([]);
    expect(detail.stageSummaries).toEqual([]);
    expect(detail.cost).toMatchObject({ spentUsd: 0, attemptsUsd: 0, otherStagesUsd: 0, unattributedUsd: 0 });
    expect(detail.preflightBlock).toBeNull();
  });
});

describe('runs.get: resolvedOptions (R1)', () => {
  it('returns what the run stored', async () => {
    const resolvedOptions = {
      voice: { key: 'onyx', label: 'Onyx', from: 'run' },
      visualSource: { value: 'ai-stills', label: 'AI images', from: 'run' },
      music: { label: 'Auto', from: 'default' },
      targetSeconds: { value: 45, from: 'default' },
      videoKind: 'short',
      formatKey: null,
    };
    mocks.findPipelineRunById.mockResolvedValue(run({ voice: 'onyx', visualSource: 'ai-stills', resolvedOptions }));
    expect((await caller().get({ id: RUN_ID })).resolvedOptions).toEqual(resolvedOptions);
  });
});

describe('runs.create: resolvedOptions (R1)', () => {
  const base = { channelId: CHANNEL_ID, briefText: 'a brief' };
  const stored = () => mocks.createRun.mock.calls[0]![0].creationOptions;

  it('a run with every default stores the derived disclaimer choice and resolvedOptions, nothing else', async () => {
    await caller().create(base);
    expect(Object.keys(stored())).toEqual(['disclaimer', 'resolvedOptions']);
    expect(stored().resolvedOptions.voice).toEqual({ key: 'alloy', label: 'Alloy', from: 'default' });
  });

  it('the disclaimer default comes from the visuals and the brief; one explicit tap overrides it', async () => {
    await caller().create({ ...base, visualSource: 'ai-stills' });
    expect(stored().disclaimer).toMatchObject({ enabled: true, defaultReason: 'ai-visuals' });
    vi.clearAllMocks();
    mocks.createRun.mockResolvedValue({ id: 'run1' });
    await caller().create({ ...base, visualSource: 'ai-stills', disclaimerEnabled: false });
    expect(stored().disclaimer).toMatchObject({ enabled: false, defaultReason: 'ai-visuals' });
  });

  it('picks are marked as coming from the run, and the picks stay as before', async () => {
    await caller().create({ ...base, voice: 'onyx', visualSource: 'ai-stills', targetDurationSec: 30 });
    expect(stored()).toMatchObject({ voice: 'onyx', visualSource: 'ai-stills', targetDurationSec: 30 });
    expect(stored().resolvedOptions).toMatchObject({
      voice: { key: 'onyx', label: 'Onyx', from: 'run' },
      visualSource: { value: 'ai-stills', from: 'run' },
      targetSeconds: { value: 30, from: 'run' },
    });
  });

  it('a long run without a picked length says the 600 s came from the default', async () => {
    mocks.getRemainingWeeklyUsd.mockResolvedValue(100);
    await caller().create({ ...base, videoKind: 'long' });
    expect(stored().targetDurationSec).toBe(600);
    expect(stored().resolvedOptions).toMatchObject({ videoKind: 'long', targetSeconds: { value: 600, from: 'default' } });
  });

  it('records the format', async () => {
    await caller().create({ ...base, formatKey: 'countdown' });
    expect(stored().resolvedOptions).toMatchObject({ formatKey: 'countdown', targetSeconds: { from: 'format' } });
  });
});

describe('deriveGateDecisions (R2)', () => {
  it('lists every decided gate oldest first; a gate with a system auto-approve log is auto', () => {
    const stages = [
      gateStage('g1', 'gate1', { outcome: 'approve', sanctionedScriptText: 'x' }, '2026-10-01T01:00:00Z'),
      gateStage('g2', 'gate2', { outcome: 'approve', privacyStatus: 'private' }, '2026-10-01T02:00:00Z'),
    ] as never;
    const logs = [{ stageId: 'g2', agent: 'system', verdict: 'auto-approve' }];
    expect(deriveGateDecisions(stages, logs)).toEqual([
      { gate: 1, outcome: 'approve', decidedBy: 'user', decidedAt: at('2026-10-01T01:00:00Z') },
      { gate: 2, outcome: 'approve', privacyStatus: 'private', decidedBy: 'auto', decidedAt: at('2026-10-01T02:00:00Z') },
    ]);
  });

  it('keeps a revise before the later approve, carries reason and notes, skips pending gates', () => {
    const pending = { ...gateStage('g3', 'gate2', {}, '2026-10-01T04:00:00Z'), status: 'running', output: null };
    const stages = [
      gateStage('g1', 'gate1', { outcome: 'reject', reason: 'off topic' }, '2026-10-01T01:00:00Z'),
      gateStage('g2', 'gate2', { outcome: 'revise', notes: 'brighter' }, '2026-10-01T03:00:00Z'),
      pending,
    ] as never;
    const result = deriveGateDecisions(stages, [])!;
    expect(result.map((d) => [d.gate, d.outcome])).toEqual([[1, 'reject'], [2, 'revise']]);
    expect(result[0]).toMatchObject({ reason: 'off topic' });
    expect(result[1]).toMatchObject({ notes: 'brighter' });
  });

  it('is absent when no gate was decided', () => {
    expect(deriveGateDecisions([], [])).toBeUndefined();
  });

  it('lastGateDecision is still only the latest gate', async () => {
    mocks.findPipelineRunById.mockResolvedValue(run());
    mocks.listStagesForRun.mockResolvedValue([
      gateStage('g1', 'gate1', { outcome: 'approve' }, '2026-10-01T01:00:00Z'),
      gateStage('g2', 'gate2', { outcome: 'approve', privacyStatus: 'private' }, '2026-10-01T02:00:00Z'),
    ]);
    const detail = await caller().get({ id: RUN_ID });
    expect(detail.lastGateDecision).toMatchObject({ gate: 2, outcome: 'approve' });
    expect(detail.gateDecisions).toHaveLength(2);
  });
});
