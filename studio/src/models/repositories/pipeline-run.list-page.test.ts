import { describe, it, expect, vi, beforeEach } from 'vitest';

// Sprint 5 Task 8 (R12, R11.7): listRunsPage over more than 30 runs. A small in-memory stand-in for the two
// Prisma calls it makes (findMany with where/orderBy/cursor/take, and count), honouring the same semantics.
type Row = { id: string; tenantId: string; channelId: string; status: string; currentStage: string | null; createdAt: Date; lastError: string | null };
const store = vi.hoisted(() => ({ rows: [] as Row[] }));

function select(where: { tenantId?: string; status?: { in: string[] }; currentStage?: string; channelId?: string }) {
  return store.rows.filter((r) =>
    (!where.tenantId || r.tenantId === where.tenantId) &&
    (!where.status || where.status.in.includes(r.status)) &&
    (!where.currentStage || r.currentStage === where.currentStage) &&
    (!where.channelId || r.channelId === where.channelId));
}

vi.mock('../prisma-client', () => ({
  prisma: {
    pipelineRun: {
      findMany: async (args: { where: Parameters<typeof select>[0]; take: number; cursor?: { id: string } }) => {
        const sorted = select(args.where).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1));
        const start = args.cursor ? sorted.findIndex((r) => r.id === args.cursor!.id) : 0;
        return sorted.slice(start, start + args.take);
      },
      count: async (args: { where: Parameters<typeof select>[0] }) => select(args.where).length,
    },
  },
}));
vi.mock('../../ai-visuals/cache', () => ({ removeRunWorkFiles: vi.fn() }));
vi.mock('./notification.repository', () => ({ markNotificationsResolvedByThreadKey: vi.fn() }));

import { listRunsPage, RUNS_PAGE_MAX } from './pipeline-run.repository';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
beforeEach(() => {
  const statuses = ['completed', 'failed', 'needs_attention', 'paused_gate1', 'running'];
  store.rows = Array.from({ length: 75 }, (_, n) => ({
    id: id(n), tenantId: n % 10 === 9 ? 'other-tenant' : 't1', channelId: n % 2 ? 'chan-a' : 'chan-b',
    status: statuses[n % statuses.length], currentStage: null, createdAt: new Date(Date.UTC(2026, 9, 1, 0, n)), lastError: null,
  }));
});

async function readAll(params: Omit<Parameters<typeof listRunsPage>[0], 'cursor'>) {
  const seen: string[] = [];
  let cursor: string | undefined;
  let pages = 0;
  const totals: number[] = [];
  do {
    const page = await listRunsPage({ ...params, cursor });
    seen.push(...page.items.map((r) => r.id));
    totals.push(page.total);
    cursor = page.nextCursor ?? undefined;
    pages += 1;
  } while (cursor && pages < 50);
  return { seen, pages, total: totals[totals.length - 1] };
}

describe('listRunsPage', () => {
  it('returns every run of the tenant across pages: no run lost, none twice, newest first', async () => {
    const { seen, pages, total } = await readAll({ tenantId: 't1', limit: 30 });
    const expected = store.rows.filter((r) => r.tenantId === 't1').sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map((r) => r.id);
    expect(total).toBe(expected.length);
    expect(expected.length).toBeGreaterThan(60);
    expect(pages).toBe(Math.ceil(expected.length / 30));
    expect(seen).toEqual(expected);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('never leaks another tenant', async () => {
    const { seen } = await readAll({ tenantId: 't1', limit: 200 });
    expect(seen.some((s) => store.rows.find((r) => r.id === s)?.tenantId !== 't1')).toBe(false);
  });

  it('the Failed filter returns only failed runs, with and without a channel, with the right totals', async () => {
    const all = await readAll({ tenantId: 't1', statuses: ['failed'], limit: 10 });
    const failed = store.rows.filter((r) => r.tenantId === 't1' && r.status === 'failed');
    expect(all.total).toBe(failed.length);
    expect(all.seen.sort()).toEqual(failed.map((r) => r.id).sort());
    const onChannel = await readAll({ tenantId: 't1', statuses: ['failed'], channelId: 'chan-a', limit: 10 });
    const failedOnChannel = failed.filter((r) => r.channelId === 'chan-a');
    expect(onChannel.total).toBe(failedOnChannel.length);
    expect(onChannel.seen.sort()).toEqual(failedOnChannel.map((r) => r.id).sort());
    expect(onChannel.seen.every((s) => store.rows.find((r) => r.id === s)?.status === 'failed')).toBe(true);
  });

  it('a short list is one page with no cursor; the page size is clamped', async () => {
    const small = await listRunsPage({ tenantId: 't1', statuses: ['running'], channelId: 'chan-a', limit: 200 });
    expect(small.nextCursor).toBeNull();
    const huge = await listRunsPage({ tenantId: 't1', limit: 100000 });
    expect(huge.items.length).toBeLessThanOrEqual(RUNS_PAGE_MAX);
    const zero = await listRunsPage({ tenantId: 't1', limit: 0 });
    expect(zero.items).toHaveLength(1);
  });

  it('defaults to 50 per page', async () => {
    const first = await listRunsPage({ tenantId: 't1' });
    expect(first.items).toHaveLength(50);
    expect(first.nextCursor).not.toBeNull();
  });
});
