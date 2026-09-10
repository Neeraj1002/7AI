import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import {
  getOperationalDashboard,
  getCostDashboard,
  getContentPerformanceDashboard,
  getQualityDashboard,
} from '../../models/repositories/dashboard.repository';

const dashboardInput = z.object({ channelId: z.string().uuid().optional() });

// GET /dashboard/operational, /cost, /content, /quality — BUSINESS_LOGIC.md
// Section 3, MOBILE_APP_DESIGN.md Section 4's four groups. Response shapes
// are documented in src/types/dashboard.types.ts for Task 3 to build
// against. Optional `channelId` (Task 3): every screen in the app is
// channel-scoped per the design doc, Dashboard included — omitted means "all
// channels for this tenant."
export const dashboardRouter = router({
  operational: publicProcedure
    .input(dashboardInput)
    .query(async ({ input }) => getOperationalDashboard(input.channelId)),
  cost: publicProcedure.input(dashboardInput).query(async ({ input }) => getCostDashboard(input.channelId)),
  content: publicProcedure
    .input(dashboardInput)
    .query(async ({ input }) => getContentPerformanceDashboard(input.channelId)),
  quality: publicProcedure
    .input(dashboardInput)
    .query(async ({ input }) => getQualityDashboard(input.channelId)),
});
