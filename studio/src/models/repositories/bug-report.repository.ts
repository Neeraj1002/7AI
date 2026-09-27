import { prisma } from '../prisma-client';

// Testing-phase utility — see api/bug-report-page.ts and api/server.ts's
// /bugs routes. No tenancy/user scoping by design: a tester submitting this
// may not be signed in (the bug might be that they can't sign in at all).
// Deliberately minimal, matching the table's own purpose — remove or
// formalize this alongside the schema comment once real testing winds down.

export const BUG_REPORT_STATUSES = ['open', 'fixed', 'wontfix'] as const;
export type BugReportStatus = (typeof BUG_REPORT_STATUSES)[number];

// Bugs Task 7 (R2/R3) — the founder's own three deliberately minimal
// triage fields. reportType is tester-supplied and required; priority is
// tester-supplied and required only for reportType='bug' (validated in
// insertBugReport below, not at the DB level — a 'feedback' row is
// expected to leave it null); area is never tester-facing, set later via
// bugsRouter.updateTriage the same way a task doc tags an R# item's role.
export const BUG_REPORT_TYPES = ['bug', 'feedback'] as const;
export type BugReportType = (typeof BUG_REPORT_TYPES)[number];

export const BUG_REPORT_PRIORITIES = ['blocker', 'annoying', 'minor'] as const;
export type BugReportPriority = (typeof BUG_REPORT_PRIORITIES)[number];

// Bugs Task 7 (R3) — never tester-facing; the migration landed alongside
// R2's (one file for both, per that item's own instruction), but this is
// the commit that actually exposes it through the domain layer. `null`
// means "not yet triaged" — set only via bugsRouter.updateTriage (R1).
export const BUG_REPORT_AREAS = ['BE', 'FE', 'APP'] as const;
export type BugReportArea = (typeof BUG_REPORT_AREAS)[number];

export interface BugReport {
  id: string;
  description: string;
  status: BugReportStatus;
  reportType: BugReportType;
  priority: BugReportPriority | null;
  area: BugReportArea | null;
  runId: string | null;
  screenContext: string | null;
  userAgent: string | null;
  createdAt: Date;
}

function toDomainBugReport(row: {
  id: string;
  description: string;
  status: string;
  reportType: string;
  priority: string | null;
  area: string | null;
  runId: string | null;
  screenContext: string | null;
  userAgent: string | null;
  createdAt: Date;
}): BugReport {
  return {
    id: row.id,
    description: row.description,
    status: row.status as BugReportStatus,
    reportType: row.reportType as BugReportType,
    priority: row.priority as BugReportPriority | null,
    area: row.area as BugReportArea | null,
    runId: row.runId,
    screenContext: row.screenContext,
    userAgent: row.userAgent,
    createdAt: row.createdAt,
  };
}

// Run/screen context (runId, screenContext) and userAgent are all optional —
// a tester reporting "I can't sign in at all" may have no run/screen to
// attach, and an old client (or a manual curl) may send neither.
//
// Bugs Task 7 (R2) — reportType is required; priority is required iff
// reportType === 'bug'. Validated here, server-side, not trusted from the
// client alone — the same posture every edge-validated field in this
// codebase already takes (e.g. runs.ts's create.voice/visualSource).
export async function insertBugReport(params: {
  description: string;
  reportType: BugReportType;
  priority?: BugReportPriority | null;
  runId?: string | null;
  screenContext?: string | null;
  userAgent?: string | null;
}): Promise<BugReport> {
  if (params.reportType === 'bug' && !params.priority) {
    throw new Error('priority is required when reportType is "bug"');
  }
  const row = await prisma.bugReport.create({
    data: {
      description: params.description,
      reportType: params.reportType,
      priority: params.reportType === 'bug' ? params.priority : undefined,
      runId: params.runId ?? undefined,
      screenContext: params.screenContext ?? undefined,
      userAgent: params.userAgent ?? undefined,
    },
  });
  return toDomainBugReport(row);
}

// Bugs Task 7 (R1) — wired to a real, gated endpoint (bugsRouter.list) for
// the first time; this function itself is unchanged from when it was
// first added.
export async function listBugReports(status?: BugReportStatus): Promise<BugReport[]> {
  const rows = await prisma.bugReport.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(toDomainBugReport);
}

// Kept as-is (Bugs Tasks 8/9's hot-fixer sessions already call this
// directly to mark reports 'fixed') — updateBugReportTriage (Bugs Task 7
// R1) extends it with area/priority rather than replacing it.
export async function updateBugReportStatus(id: string, status: BugReportStatus): Promise<void> {
  await prisma.bugReport.update({ where: { id }, data: { status } });
}
