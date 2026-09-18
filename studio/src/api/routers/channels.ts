import { router, publicProcedure } from '../trpc';
import { listActiveChannelsByTenant } from '../../models/repositories/channel.repository';

export const channelsRouter = router({
  // GET /channels — Channel switcher (Task 2), wired from day one even with
  // a single channel active (MOBILE_APP_DESIGN.md Section 4).
  // Sprint 3 Task 1 (J3) — the real signed-in session's tenant, never
  // MVP_TENANT_ID.
  list: publicProcedure.query(async ({ ctx }) => {
    return listActiveChannelsByTenant(ctx.tenantId);
  }),
});
