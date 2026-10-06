import { router, publicProcedure } from '../../trpc';
import { resolveAdminActor } from '../../admin-auth';
import { adminAuditRouter } from './audit';
import { adminBugsRouter } from './bugs';
import { adminBudgetRouter } from './budget';
import { adminOverviewProcedure } from './overview';
import { adminTenantsRouter } from './tenants';
import { adminUsageRouter } from './usage';
import { adminRunsRouter } from './runs';

// Admin Sprint 1 — the admin router. One file per group (filled in by R2-R7,
// R9, R10); this file only composes them.
export const adminRouter = router({
  audit: adminAuditRouter,
  bugs: adminBugsRouter,
  budget: adminBudgetRouter,
  overview: adminOverviewProcedure,
  tenants: adminTenantsRouter,
  usage: adminUsageRouter,
  runs: adminRunsRouter,
  // Any signed-in session may ask "am I an Admin?" (the app uses it to decide
  // whether to show the Admin section). Computed with the same fresh database
  // read adminProcedure uses; true for the ops token, whose userId is null.
  whoami: publicProcedure.query(async ({ ctx }) => {
    const actor = await resolveAdminActor(ctx);
    return { platformAdmin: actor !== null, userId: ctx.userId };
  }),
});
