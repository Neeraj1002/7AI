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
vi.mock('../../models/repositories/usage-event.repository', () => ({ sumUsageCostForRun: mocks.sumUsageCostForRun }));
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

  it('a run with every default stores resolvedOptions and nothing else', async () => {
    await caller().create(base);
    expect(Object.keys(stored())).toEqual(['resolvedOptions']);
    expect(stored().resolvedOptions.voice).toEqual({ key: 'alloy', label: 'Alloy', from: 'default' });
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
