import { describe, it, expect, vi } from 'vitest';
import { Prisma } from '@prisma/client';
const cleanup = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('../../ai-visuals/cache', () => ({ removeRunWorkFiles: cleanup }));

import { updatePipelineRun, CANCELLED_BY_USER } from './pipeline-run.repository';

// Bugs Task 10 (R1, step 7) — a late stage must not resurrect a cancelled run.
function fakeRow(over: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    id: 'r1', tenantId: 't', channelId: 'c', status: 'failed', currentStage: 'video_generation',
    briefText: 'b', intakeParsed: null, creationOptions: null, retryCount: 0, lastError: CANCELLED_BY_USER,
    startedAt: null, completedAt: null, createdAt: now, updatedAt: now, ...over,
  };
}

describe('updatePipelineRun cancelled-run guard', () => {
  it('excludes a cancelled row from ordinary writes and returns the stored row when the write is refused', async () => {
    const update = vi.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('not found', { code: 'P2025', clientVersion: 'x' }),
    );
    const findUnique = vi.fn().mockResolvedValue(fakeRow());
    const result = await updatePipelineRun('r1', { status: 'running', currentStage: 'video_review' }, { pipelineRun: { update, findUnique } } as never);
    expect(update.mock.calls[0][0].where).toEqual({ id: 'r1', NOT: { status: 'failed', lastError: CANCELLED_BY_USER } });
    expect(result.status).toBe('failed');
    expect(result.lastError).toBe(CANCELLED_BY_USER);
  });

  it('lets the cancel write itself through (idempotent re-cancel)', async () => {
    const update = vi.fn().mockResolvedValue(fakeRow());
    await updatePipelineRun('r1', { status: 'failed', lastError: CANCELLED_BY_USER }, { pipelineRun: { update, findUnique: vi.fn() } } as never);
    expect(update.mock.calls[0][0].where).toEqual({ id: 'r1' });
    expect(cleanup).toHaveBeenCalledWith('r1');
  });

  it('rethrows other errors', async () => {
    const update = vi.fn().mockRejectedValue(new Error('db down'));
    await expect(updatePipelineRun('r1', { status: 'running' }, { pipelineRun: { update, findUnique: vi.fn() } } as never)).rejects.toThrow('db down');
  });
});
