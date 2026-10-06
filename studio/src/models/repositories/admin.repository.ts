import { prisma } from '../prisma-client';

// Admin Sprint 1 - the only repository allowed to aggregate across tenants.
// Every function takes tenant as an explicit argument (or none, for a
// deliberately platform-wide view); nothing here reads a request context.
// Never select AgentCredential.refreshTokenEncrypted, a brief, or a stage
// input/output from this file except where a function's own comment says it
// is the audited content path.

export type RunSummary = { id: string; status: string; tenantId: string; tenantName: string | null };

// One findMany for the runs plus one for their tenants' names, however many
// ids are passed (no N+1). Ids that no longer exist are simply absent.
export async function findRunSummariesByIds(runIds: string[]): Promise<Map<string, RunSummary>> {
  const ids = [...new Set(runIds)];
  if (ids.length === 0) return new Map();
  const runs = await prisma.pipelineRun.findMany({
    where: { id: { in: ids } },
    select: { id: true, status: true, tenantId: true },
  });
  const tenantIds = [...new Set(runs.map((r) => r.tenantId))];
  const tenants = tenantIds.length
    ? await prisma.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(tenants.map((t) => [t.id, t.name]));
  return new Map(
    runs.map((r) => [r.id, { id: r.id, status: r.status, tenantId: r.tenantId, tenantName: nameById.get(r.tenantId) ?? null }]),
  );
}
