import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, adminProcedure } from '../../trpc';
import { findRunSummariesByIds } from '../../../models/repositories/admin.repository';
import {
  BUG_REPORT_AREAS,
  BUG_REPORT_PRIORITIES,
  BUG_REPORT_STATUSES,
  BUG_REPORT_TYPES,
  BUG_TRIAGE_NOTE_MAX,
  listBugReportsFiltered,
  triageBugReportWithAudit,
} from '../../../models/repositories/bug-report.repository';
import { extractRunId } from '../../../util/run-id';

export const adminBugsRouter = router({
  // The enums the app renders its filters and pickers from, so the app never
  // keeps its own copy.
  options: adminProcedure.query(() => ({
    statuses: [...BUG_REPORT_STATUSES],
    reportTypes: [...BUG_REPORT_TYPES],
    areas: [...BUG_REPORT_AREAS],
    priorities: [...BUG_REPORT_PRIORITIES],
  })),

  // Same data as bugs.list plus filters, the triage note and the run behind
  // each report (resolved with a single findMany). `runId` with `run: null`
  // means the run no longer exists.
  list: adminProcedure
    .input(
      z
        .object({
          status: z.enum(BUG_REPORT_STATUSES).optional(),
          reportType: z.enum(BUG_REPORT_TYPES).optional(),
          area: z.enum(BUG_REPORT_AREAS).optional(),
          priority: z.enum(BUG_REPORT_PRIORITIES).optional(),
          limit: z.number().int().min(1).max(500).optional(),
        })
        .default({}),
    )
    .query(async ({ input }) => {
      const reports = await listBugReportsFiltered(input);
      const runIds = reports.map((r) => extractRunId(r));
      const runs = await findRunSummariesByIds(runIds.filter((id): id is string => id !== null));
      return reports.map((report, i) => {
        const runId = runIds[i];
        return { ...report, runId, run: runId ? (runs.get(runId) ?? null) : null };
      });
    }),

  // The one write of this sprint besides the platform-admin script: the change
  // and its audit row commit in one transaction. An unknown id throws before
  // anything is written, so nothing is audited.
  updateTriage: adminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        status: z.enum(BUG_REPORT_STATUSES).optional(),
        area: z.enum(BUG_REPORT_AREAS).nullable().optional(),
        priority: z.enum(BUG_REPORT_PRIORITIES).nullable().optional(),
        // Trimmed; an empty string clears the note; replaces the previous one.
        note: z.string().trim().max(BUG_TRIAGE_NOTE_MAX).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...patch } = input;
      const after = await triageBugReportWithAudit(ctx.admin, id, patch);
      if (!after) {
        throw new TRPCError({ code: 'NOT_FOUND', message: `Bug report ${id} not found` });
      }
      return after;
    }),
});
