import { prisma } from '../prisma-client';

// Testing-phase utility — see api/bug-report-page.ts and api/server.ts's
// /bugs routes. No tenancy/user scoping by design: a tester submitting this
// may not be signed in (the bug might be that they can't sign in at all).
// Deliberately minimal, matching the table's own purpose — remove or
// formalize this alongside the schema comment once real testing winds down.

export type BugReportStatus = 'open' | 'fixed' | 'wontfix';

export interface BugReport {
  id: string;
  description: string;
  status: BugReportStatus;
  runId: string | null;
  screenContext: string | null;
  userAgent: string | null;
  createdAt: Date;
}

function toDomainBugReport(row: {
  id: string;
  description: string;
  status: string;
  runId: string | null;
  screenContext: string | null;
  userAgent: string | null;
  createdAt: Date;
}): BugReport {
  return {
    id: row.id,
    description: row.description,
    status: row.status as BugReportStatus,
    runId: row.runId,
    screenContext: row.screenContext,
    userAgent: row.userAgent,
    createdAt: row.createdAt,
  };
}

// Run/screen context (runId, screenContext) and userAgent are all optional —
// a tester reporting "I can't sign in at all" may have no run/screen to
// attach, and an old client (or a manual curl) may send neither.
export async function insertBugReport(params: {
  description: string;
  runId?: string | null;
  screenContext?: string | null;
  userAgent?: string | null;
}): Promise<BugReport> {
  const row = await prisma.bugReport.create({
    data: {
      description: params.description,
      runId: params.runId ?? undefined,
      screenContext: params.screenContext ?? undefined,
      userAgent: params.userAgent ?? undefined,
    },
  });
  return toDomainBugReport(row);
}

// Not wired to any route yet (no list endpoint — see api/server.ts's own
// comment on why this stays out of scope for now) but here so a future
// pass (an agent working through the table, or a formalized version of
// this feature) doesn't have to reinvent the query.
export async function listBugReports(status?: BugReportStatus): Promise<BugReport[]> {
  const rows = await prisma.bugReport.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(toDomainBugReport);
}

export async function updateBugReportStatus(id: string, status: BugReportStatus): Promise<void> {
  await prisma.bugReport.update({ where: { id }, data: { status } });
}
