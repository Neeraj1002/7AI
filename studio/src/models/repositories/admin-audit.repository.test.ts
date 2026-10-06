import { describe, it, expect, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../prisma-client';
import { SANDBOX } from '../../test-support/sandbox';
import { redact, listAdminAudit } from './admin-audit.repository';

describe('redact', () => {
  it('drops secret-looking keys at every depth, keeps the rest', () => {
    const out = redact({
      status: 'open',
      refreshToken: 'x',
      apiKey: 'y',
      nested: { password: 'p', Authorization: 'a', ok: 1, deeper: [{ clientSecret: 's', keep: true }] },
      list: [{ token: 't', name: 'n' }],
    });
    expect(out).toEqual({ status: 'open', nested: { ok: 1, deeper: [{ keep: true }] }, list: [{ name: 'n' }] });
  });

  it('passes primitives, null and dates through', () => {
    const d = new Date();
    expect(redact(null)).toBeNull();
    expect(redact(5)).toBe(5);
    expect(redact(d)).toBe(d);
  });
});

describe.skipIf(!SANDBOX)('listAdminAudit (sandbox database)', () => {
  const tenantA = randomUUID();
  const tenantB = randomUUID();

  afterAll(async () => {
    await prisma.adminAuditLog.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
    await prisma.$disconnect();
  });

  it('pages 120 rows newest-first with a stable cursor, ties included', async () => {
    const base = Date.now() - 10_000_000;
    const data = Array.from({ length: 120 }, (_, i) => ({
      actorKind: 'script',
      action: 'test.audit_paging',
      targetType: 'test',
      targetId: String(i),
      tenantId: i < 100 ? tenantA : tenantB,
      // every 3 rows share a timestamp so the id tiebreak is exercised
      createdAt: new Date(base + Math.floor(i / 3) * 1000),
    }));
    await prisma.adminAuditLog.createMany({ data });

    const seen: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 10; page++) {
      const res = await listAdminAudit({ limit: 50, cursor, action: 'test.audit_paging' });
      const mine = res.items.filter((r) => r.tenantId === tenantA || r.tenantId === tenantB);
      seen.push(...mine.map((r) => r.id));
      for (let i = 1; i < res.items.length; i++) {
        expect(res.items[i - 1].createdAt.getTime()).toBeGreaterThanOrEqual(res.items[i].createdAt.getTime());
      }
      if (!res.nextCursor) break;
      cursor = res.nextCursor;
    }
    expect(seen).toHaveLength(120);
    expect(new Set(seen).size).toBe(120);
  });

  it('filters by tenantId and resolves tenantName / actorEmail to null for unknown ids', async () => {
    const res = await listAdminAudit({ limit: 200, tenantId: tenantB, action: 'test.audit_paging' });
    expect(res.items).toHaveLength(20);
    expect(res.items.every((r) => r.tenantId === tenantB && r.tenantName === null && r.actorEmail === null)).toBe(true);
    expect(res.nextCursor).toBeNull();
  });

  it('ignores a garbage cursor instead of throwing', async () => {
    const res = await listAdminAudit({ limit: 5, cursor: 'not-a-cursor', tenantId: tenantB });
    expect(res.items).toHaveLength(5);
  });
});
