import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, adminProcedure } from '../../trpc';
import { getTenantForAdmin, listTenantsForAdmin } from '../../../models/repositories/admin-tenants.repository';

// Read-only. Tenant is an explicit input; ctx.tenantId is never read.
export const adminTenantsRouter = router({
  list: adminProcedure.query(() => listTenantsForAdmin()),

  get: adminProcedure.input(z.object({ tenantId: z.string().uuid() })).query(async ({ input }) => {
    const tenant = await getTenantForAdmin(input.tenantId);
    if (!tenant) {
      throw new TRPCError({ code: 'NOT_FOUND', message: `Tenant ${input.tenantId} not found` });
    }
    return tenant;
  }),
});
