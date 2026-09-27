import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure } from '../trpc';
import {
  listBugReports,
  updateBugReportTriage,
  BUG_REPORT_STATUSES,
  BUG_REPORT_PRIORITIES,
  BUG_REPORT_AREAS,
} from '../../models/repositories/bug-report.repository';

// Bugs Task 7 (R1) — the real list/triage-update endpoint listBugReports()
// has needed since it was added (its own comment: "not wired to any route
// yet"). tRPC, not a third REST route under /bugs: api/server.ts's auth
// hook exempts every /bugs* path entirely (deliberate — a tester reporting
// "I can't sign in" must still be able to submit), so a REST list route
// under that same prefix would have inherited that exemption and leaked
// every report to anyone. Routing through tRPC instead reuses the same
// real session/ops-token auth every other founder-only surface already
// goes through (createContext), no hand-rolled auth needed.
function assertOwner(role: string): void {
  // The API_AUTH_TOKEN ops fallback already resolves to role 'owner'
  // (api/trpc.ts's createContext) — one check covers both a real
  // owner-role session and a script/curl caller using the ops token.
  if (role !== 'owner') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Only an owner-role session (or the ops token) can view/triage bug reports' });
  }
}

export const bugsRouter = router({
  // GET /bugs — the actual list, gated (not to be confused with the
  // existing, deliberately-unauthenticated GET /bugs REST route that
  // serves the submission page HTML — same path prefix, different
  // transport, no collision since tRPC lives under /trpc).
  list: publicProcedure
    .input(
      z.object({
        status: z.enum(BUG_REPORT_STATUSES).optional(),
        // Postgres UUID columns don't support prefix matching (a `LIKE
        // 'abc%'` query against a `uuid` column doesn't work) — confirmed
        // the hard way during Bugs Task 9. Filtered in JS after a full
        // fetch instead of a dedicated short-id column: fine at this
        // table's current size, and avoids a schema change for a
        // lookup convenience.
        idPrefix: z.string().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      assertOwner(ctx.role);
      const reports = await listBugReports(input.status);
      if (!input.idPrefix) return reports;
      const prefix = input.idPrefix.toLowerCase();
      return reports.filter((r) => r.id.toLowerCase().startsWith(prefix));
    }),

  // POST /bugs/update-triage — extends updateBugReportStatus (already
  // called directly by Bugs Tasks 8/9's hot-fixer sessions to mark reports
  // 'fixed') rather than replacing it; status/area/priority are all
  // optional so a caller can set just one field at a time.
  updateTriage: publicProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        status: z.enum(BUG_REPORT_STATUSES).optional(),
        area: z.enum(BUG_REPORT_AREAS).nullable().optional(),
        priority: z.enum(BUG_REPORT_PRIORITIES).nullable().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      assertOwner(ctx.role);
      await updateBugReportTriage(input.id, {
        status: input.status,
        area: input.area,
        priority: input.priority,
      });
      return { updated: true };
    }),
});
