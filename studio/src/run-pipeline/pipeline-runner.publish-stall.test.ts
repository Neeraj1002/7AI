import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  publish: vi.fn(), receipt: vi.fn(), update: vi.fn(),
}));
vi.mock('./state-machine', () => ({
  runIntakeStage: vi.fn(), runScriptGenerationStage: vi.fn(), runScriptReviewStage: vi.fn(),
  runGate1Stage: vi.fn(), runVideoGenerationStage: vi.fn(), runVideoReviewStage: vi.fn(),
  runGate2Stage: vi.fn(), runPublishingStage: mocks.publish, runAnalyticsStage: vi.fn(),
}));
vi.mock('../models/repositories/publishing-recovery.repository', () => ({
  readPublishingReceipt: mocks.receipt,
}));
vi.mock('../models/repositories/pipeline-run.repository', () => ({
  findPipelineRunById: vi.fn(), updatePipelineRun: mocks.update,
  CANCELLED_BY_USER: 'Cancelled by user',
}));
import { runPublishingStageWithStallGuard } from './pipeline-runner';

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.publish.mockReturnValue(new Promise(() => {}));
  mocks.update.mockImplementation(async (_id, value) => value);
});
afterEach(() => vi.useRealTimers());
describe('publishing stall status', () => {
  it.each([
    [null, 'may still be in progress'],
    [{ phase: 'uploading' }, 'may still be in progress'],
    [{ phase: 'uploaded', youtubeVideoId: 'known' }, 'video ID is recorded'],
    [{ phase: 'ambiguous' }, 'outcome is unresolved'],
  ])('describes the receipt state truthfully', async (receipt, phrase) => {
    mocks.receipt.mockResolvedValue(receipt);
    const pending = runPublishingStageWithStallGuard('run');
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    const result = await pending;
    expect(result.lastError).toContain(phrase);
    expect(result.lastError).not.toContain('Safe to retry');
  });
});
