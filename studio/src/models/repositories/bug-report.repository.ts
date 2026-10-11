import { prisma } from '../prisma-client';
import type { DbClient } from './pipeline-stage.repository';
import { writeAdminAudit, type AdminActor } from './admin-audit.repository';

// Testing-phase utility — see api/bug-report-page.ts and api/server.ts's
// /bugs routes. No tenancy/user scoping by design: a tester submitting this
// may not be signed in (the bug might be that they can't sign in at all).
// Deliberately minimal, matching the table's own purpose — remove or
// formalize this alongside the schema comment once real testing winds down.

// Admin Sprint 1 (R3) - 'awaiting_verification' = fixed in code, not yet verified on the
// deployed build (a hot-fixer sets it with the PR number in the note).
export const BUG_REPORT_STATUSES = ['open', 'fixed', 'wontfix', 'awaiting_verification'] as const;
export const BUG_TRIAGE_NOTE_MAX = 500;
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
  triageNote: string | null;
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
  triageNote: string | null;
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
    triageNote: row.triageNote,
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
  return listBugReportsFiltered({ status });
}

// Admin Sprint 1 (R3) - the filtered list behind admin.bugs.list; listBugReports above keeps
// its original signature for bugs.list.
export async function listBugReportsFiltered(filter: {
  status?: BugReportStatus;
  reportType?: BugReportType;
  area?: BugReportArea;
  priority?: BugReportPriority;
  limit?: number;
}): Promise<BugReport[]> {
  const rows = await prisma.bugReport.findMany({
    where: {
      ...(filter.status && { status: filter.status }),
      ...(filter.reportType && { reportType: filter.reportType }),
      ...(filter.area && { area: filter.area }),
      ...(filter.priority && { priority: filter.priority }),
    },
    ...(filter.limit && { take: filter.limit }),
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(toDomainBugReport);
}

// Kept as-is (Bugs Tasks 8/9's hot-fixer sessions already call this
// directly to mark reports 'fixed') — updateBugReportTriage below extends
// it with area/priority rather than replacing it.
export async function findBugReportById(id: string, client: DbClient = prisma): Promise<BugReport | null> {
  const row = await client.bugReport.findUnique({ where: { id } });
  return row ? toDomainBugReport(row) : null;
}

export async function updateBugReportStatus(id: string, status: BugReportStatus): Promise<void> {
  await prisma.bugReport.update({ where: { id }, data: { status } });
}

// Bugs Task 7 (R1) — the triage-update path: any of status/area/priority
// may be set independently (all optional). `null` explicitly clears a
// field (e.g. un-setting a priority); `undefined`/omitted leaves it
// unchanged — Prisma's own update semantics, not a bespoke convention.
//
// Admin Sprint 1 (R3) - `note` is trimmed; an empty string clears it; it replaces the previous
// note. `client` lets the admin router run this inside the same transaction as its audit row.
export async function updateBugReportTriage(
  id: string,
  patch: { status?: BugReportStatus; area?: BugReportArea | null; priority?: BugReportPriority | null; note?: string | null },
  client: DbClient = prisma,
): Promise<BugReport> {
  const note = patch.note === undefined ? undefined : (patch.note?.trim() || null);
  if (note && note.length > BUG_TRIAGE_NOTE_MAX) {
    throw new Error(`note must be at most ${BUG_TRIAGE_NOTE_MAX} characters`);
  }
  const row = await client.bugReport.update({
    where: { id },
    data: {
      ...(patch.status !== undefined && { status: patch.status }),
      ...(patch.area !== undefined && { area: patch.area }),
      ...(patch.priority !== undefined && { priority: patch.priority }),
      ...(note !== undefined && { triageNote: note }),
    },
  });
  return toDomainBugReport(row);
}

const triageSnapshot = (b: BugReport) => ({ status: b.status, area: b.area, priority: b.priority, note: b.triageNote });

// Admin Sprint 1 (R3) - the triage write shared by admin.bugs.updateTriage and the legacy
// bugs.updateTriage (hot-fixer, ops token): the change and its admin_audit_log row commit in
// one transaction, or neither does. Returns null for an unknown id (nothing written, no audit).
export async function triageBugReportWithAudit(
  actor: AdminActor,
  id: string,
  patch: Parameters<typeof updateBugReportTriage>[1],
): Promise<BugReport | null> {
  return prisma.$transaction(async (tx) => {
    const before = await findBugReportById(id, tx);
    if (!before) return null;
    const after = await updateBugReportTriage(id, patch, tx);
    await writeAdminAudit(tx, {
      actor,
      action: 'bug.triage',
      targetType: 'bug_report',
      targetId: id,
      before: triageSnapshot(before),
      after: triageSnapshot(after),
    });
    return after;
  });
}
