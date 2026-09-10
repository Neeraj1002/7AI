import { router, publicProcedure } from '../trpc';
import { listActiveChannelsByTenant } from '../../models/repositories/channel.repository';
import { MVP_TENANT_ID } from '../../types';

export const channelsRouter = router({
  // GET /channels — Channel switcher (Task 2), wired from day one even with
  // a single channel active (MOBILE_APP_DESIGN.md Section 4).
  list: publicProcedure.query(async () => {
    return listActiveChannelsByTenant(MVP_TENANT_ID);
  }),
});
