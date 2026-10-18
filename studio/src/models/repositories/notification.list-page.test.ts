import { describe, it, expect, vi } from 'vitest';

// Sprint 5 Task 8 (R12, E11): the Inbox showed 7 or 8 runs because the list it is built from is the newest 50
// notification rows. listNotificationPageForUser returns all of them, in pages, with a total.
type Row = { id: string; userId: string; createdAt: Date; threadKey: string | null };
const store = vi.hoisted(() => ({ rows: [] as Row[] }));

vi.mock('../prisma-client', () => ({
  prisma: {
    notification: {
      findMany: async (args: { where: { userId: string }; take: number; cursor?: { id: string } }) => {
        const sorted = store.rows.filter((r) => r.userId === args.where.userId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1));
        const start = args.cursor ? sorted.findIndex((r) => r.id === args.cursor!.id) : 0;
        return sorted.slice(start, start + args.take).map((r) => ({ ...r, tenantId: 't', channelId: null, kind: 'approval_request', title: '', body: '', payload: null, resolvedAt: null, readAt: null }));
      },
      count: async (args: { where: { userId: string } }) => store.rows.filter((r) => r.userId === args.where.userId).length,
    },
  },
}));

import { listNotificationPageForUser, NOTIFICATIONS_PAGE_DEFAULT, NOTIFICATIONS_PAGE_MAX } from './notification.repository';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('listNotificationPageForUser', () => {
  // 40 runs, each with 4 notification rows (request, two re-sends, result) = 160 rows, more than the old 50.
  const seed = () => {
    store.rows = Array.from({ length: 160 }, (_, n) => ({
      id: id(n), userId: n % 20 === 19 ? 'someone-else' : 'u1', createdAt: new Date(Date.UTC(2026, 9, 1, 0, n)), threadKey: `run-${Math.floor(n / 4)}`,
    }));
  };

  it('reaches every run, which the newest-50 list cannot', async () => {
    seed();
    const mine = store.rows.filter((r) => r.userId === 'u1');
    const old = new Set(mine.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 50).map((r) => r.threadKey));
    const seen: Array<{ id: string }> = [];
    let cursor: string | undefined;
    let total = 0;
    for (let i = 0; i < 20; i += 1) {
      const page = await listNotificationPageForUser('u1', { limit: 60, cursor });
      seen.push(...page.items);
      total = page.total;
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    expect(total).toBe(mine.length);
    expect(seen.map((n) => n.id)).toEqual(mine.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map((r) => r.id));
    const threadsNow = new Set(seen.map((n) => store.rows.find((r) => r.id === n.id)!.threadKey));
    expect(old.size).toBeLessThan(15);
    expect(threadsNow.size).toBeGreaterThan(30);
  });

  it('never returns another user\'s rows, and clamps the page size', async () => {
    seed();
    const page = await listNotificationPageForUser('u1', { limit: 100000 });
    expect(page.items.length).toBeLessThanOrEqual(NOTIFICATIONS_PAGE_MAX);
    expect(page.items.every((n) => store.rows.find((r) => r.id === n.id)!.userId === 'u1')).toBe(true);
    expect((await listNotificationPageForUser('u1')).items.length).toBe(NOTIFICATIONS_PAGE_DEFAULT);
    expect((await listNotificationPageForUser('nobody')).items).toEqual([]);
  });
});
