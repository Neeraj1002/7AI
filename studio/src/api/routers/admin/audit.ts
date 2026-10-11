import { z } from 'zod';
import { router, adminProcedure } from '../../trpc';
import { listAdminAudit } from '../../../models/repositories/admin-audit.repository';

export const adminAuditRouter = router({
  // Newest first. Read-only; reading the log writes no audit row.
  list: adminProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(200).default(50),
        cursor: z.string().optional(),
        tenantId: z.string().uuid().optional(),
        action: z.string().min(1).max(100).optional(),
      })
        .default({ limit: 50 }),
    )
    .query(({ input }) => listAdminAudit(input)),
});
