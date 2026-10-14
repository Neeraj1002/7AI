import { describe, it, expect, vi } from 'vitest';
vi.mock('../prisma-client', () => ({ prisma: {} }));
import { failStage, type DbClient } from './pipeline-stage.repository';
describe('failure checkpoints', () => {
  it('retains paid progress and replaces recovery for each failure', async () => {
    const checkpoint = { recoveryPlan: { inputHash: 'hash', plan: {} }, stillsProgress: { done: 2, total: 4 }, recovery: { kind: 'spend_limit' } };
    const findUnique = vi.fn().mockResolvedValue({ output: checkpoint });
    const update = vi.fn().mockImplementation(async ({ data }) => ({ id: 's', ...data }));
    const client = { pipelineStage: { findUnique, update } } as unknown as DbClient;
    await failStage('s', 'capacity', client, { recovery: { kind: 'provider_capacity' } });
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ output: { ...checkpoint, recovery: { kind: 'provider_capacity' } } }) }));
    await failStage('s', 'render failed', client);
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ output: { ...checkpoint, recovery: null } }) }));
  });
});
