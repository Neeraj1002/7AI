import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  listRunsByStatus: vi.fn(),
  updatePipelineRun: vi.fn(),
  findLatestStageForRun: vi.fn(),
  continuePipelineInBackground: vi.fn(),
  runGate2Stage: vi.fn(),
  runVideoGenerationStage: vi.fn(),
}));

vi.mock('../models/repositories/pipeline-run.repository', () => ({
  listRunsByStatus: mocks.listRunsByStatus,
  updatePipelineRun: mocks.updatePipelineRun,
}));
vi.mock('../models/repositories/pipeline-stage.repository', () => ({ findLatestStageForRun: mocks.findLatestStageForRun }));
vi.mock('./pipeline-runner', () => ({ continuePipelineInBackground: mocks.continuePipelineInBackground }));
vi.mock('./state-machine', () => ({
  runIntakeStage: vi.fn(),
  runScriptGenerationStage: vi.fn(),
  runScriptReviewStage: vi.fn(),
  runGate1Stage: vi.fn(),
  runVideoGenerationStage: mocks.runVideoGenerationStage,
  runVideoReviewStage: vi.fn(),
  runGate2Stage: mocks.runGate2Stage,
  runPublishingStage: vi.fn(),
  runAnalyticsStage: vi.fn(),
}));

import { resumeOnStartup } from './resume-on-startup';

const stage = (over: Record<string, unknown>) => ({
  stageName: 'video_generation', status: 'running', attemptNumber: 1,
  createdAt: new Date(), startedAt: new Date(), completedAt: null, ...over,
});
const run = (over: Record<string, unknown> = {}) => ({ id: 'r1', status: 'running', currentStage: 'video_generation', retryCount: 0, ...over });
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updatePipelineRun.mockResolvedValue({});
  mocks.listRunsByStatus.mockImplementation(async (s: string) => (s === 'running' ? [run()] : []));
});

describe('resumeOnStartup', () => {
  it('repairs a gate attempt left running (2026-10-10) into paused_gate2 and does not re-run the gate', async () => {
    mocks.listRunsByStatus.mockImplementation(async (s: string) => (s === 'running' ? [run({ currentStage: 'gate2' })] : []));
    mocks.findLatestStageForRun.mockResolvedValue(stage({ stageName: 'gate2', attemptNumber: 2 }));
    await resumeOnStartup();
    expect(mocks.updatePipelineRun).toHaveBeenCalledWith('r1', { status: 'paused_gate2', currentStage: 'gate2' });
    expect(mocks.runGate2Stage).not.toHaveBeenCalled();
  });

  it('does not block boot on a resumed stage that never returns', async () => {
    mocks.findLatestStageForRun.mockResolvedValue(stage({}));
    mocks.runVideoGenerationStage.mockReturnValue(new Promise(() => undefined));
    await expect(resumeOnStartup()).resolves.toBeUndefined();
    expect(mocks.runVideoGenerationStage).toHaveBeenCalledWith('r1');
    expect(mocks.updatePipelineRun).toHaveBeenCalledWith('r1', { retryCount: 1 });
  });

  it('parks a run whose resume throws; the server and other runs carry on', async () => {
    mocks.listRunsByStatus.mockImplementation(async (s: string) => (s === 'running' ? [run(), run({ id: 'r2' })] : []));
    mocks.findLatestStageForRun.mockResolvedValue(stage({}));
    mocks.runVideoGenerationStage.mockRejectedValueOnce(new Error('boom')).mockReturnValue(new Promise(() => undefined));
    await resumeOnStartup();
    await flush();
    expect(mocks.updatePipelineRun).toHaveBeenCalledWith('r1', expect.objectContaining({ status: 'needs_attention' }));
    expect(mocks.runVideoGenerationStage).toHaveBeenCalledWith('r2');
  });

  it('parks a run on the third boot instead of resuming it again', async () => {
    mocks.listRunsByStatus.mockImplementation(async (s: string) => (s === 'running' ? [run({ retryCount: 2 })] : []));
    mocks.findLatestStageForRun.mockResolvedValue(stage({}));
    await resumeOnStartup();
    expect(mocks.runVideoGenerationStage).not.toHaveBeenCalled();
    expect(mocks.updatePipelineRun).toHaveBeenCalledWith('r1', expect.objectContaining({ status: 'needs_attention' }));
  });
});
