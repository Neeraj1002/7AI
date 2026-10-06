import { z } from 'zod';
import { router, adminProcedure } from '../../trpc';
import { usageByAgent, usageByRun, usageByWeek, usageGaps } from '../../../models/repositories/admin-usage.repository';

const tenantId = z.string().uuid().optional();

// Read-only aggregates across tenants; every filter is an explicit input.
export const adminUsageRouter = router({
  byWeek: adminProcedure
    .input(z.object({ weeks: z.number().int().min(1).max(52).default(8), tenantId }).default({ weeks: 8 }))
    .query(({ input }) => usageByWeek(input)),

  byAgent: adminProcedure
    .input(z.object({ sinceDays: z.number().int().min(1).max(365).default(30), tenantId }).default({ sinceDays: 30 }))
    .query(({ input }) => usageByAgent(input)),

  byRun: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).default(20), tenantId }).default({ limit: 20 }))
    .query(({ input }) => usageByRun(input)),

  gaps: adminProcedure
    .input(z.object({ sinceDays: z.number().int().min(1).max(365).default(30) }).default({ sinceDays: 30 }))
    .query(({ input }) => usageGaps(input)),
});
