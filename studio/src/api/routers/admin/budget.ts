import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, adminProcedure } from '../../trpc';
import { prisma } from '../../../models/prisma-client';
import { analyzeTenantBudget } from '../../../models/repositories/admin.repository';
import { CHANNEL_PLATFORMS } from '../../../types';
import { currentBudgetWindowStart, nextBudgetWindowStart } from '../../../run-pipeline/budget-gate';

export const adminBudgetRouter = router({
  // Read-only: effective ceilings and warnings for one tenant. Changes nothing
  // and writes no audit row.
  get: adminProcedure
    .input(z.object({ tenantId: z.string().uuid(), platform: z.enum(CHANNEL_PLATFORMS).default('youtube') }))
    .query(async ({ input }) => {
      const tenant = await prisma.tenant.findUnique({ where: { id: input.tenantId }, select: { id: true } });
      if (!tenant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: `Tenant ${input.tenantId} not found` });
      }
      const a = await analyzeTenantBudget(input.tenantId, input.platform);
      return {
        tenantId: input.tenantId,
        platform: input.platform,
        // The gate enforces a weekly window (closure R1); a constant, not a switch.
        windowKind: 'weekly' as const,
        weekStartUtc: currentBudgetWindowStart().toISOString(),
        resetsAtUtc: nextBudgetWindowStart().toISOString(),
        // The tenant's stored weekly budget (D4): channels split it; it is never derived from them.
        poolCeilingUsd: a.poolCeilingUsd,
        gateSpentUsd: a.gateSpentUsd,
        spentThisWeekUsd: a.spentThisWeekUsd,
        reservedByOverridesUsd: a.reservedByOverridesUsd,
        remainingPoolUsd: a.remainingPoolUsd,
        channels: a.channels,
        warnings: a.warnings,
      };
    }),
});
