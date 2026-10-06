import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import {
  getOperationalDashboard,
  getCostDashboard,
  getContentPerformanceDashboard,
  getQualityDashboard,
  getGateAnalytics,
} from '../../models/repositories/dashboard.repository';

const dashboardInput = z.object({ channelId: z.string().uuid().optional() });

// GET /dashboard/operational, /cost, /content, /quality — BUSINESS_LOGIC.md
// Section 3, MOBILE_APP_DESIGN.md Section 4's four groups. Response shapes
// are documented in src/types/dashboard.types.ts for Task 3 to build
// against. Optional `channelId` (Task 3): every screen in the app is
// channel-scoped per the design doc, Dashboard included — omitted means "all
// channels for this tenant."
// Sprint 3 Task 1 (J3) — ctx.tenantId (the real signed-in session's tenant),
// never MVP_TENANT_ID.
export const dashboardRouter = router({
  operational: publicProcedure
    .input(dashboardInput)
    .query(async ({ input, ctx }) => getOperationalDashboard(ctx.tenantId, input.channelId)),
  cost: publicProcedure
    .input(dashboardInput)
    .query(async ({ input, ctx }) => getCostDashboard(ctx.tenantId, input.channelId)),
  content: publicProcedure
    .input(dashboardInput)
    .query(async ({ input, ctx }) => getContentPerformanceDashboard(ctx.tenantId, input.channelId)),
  // Bugs Closure R3 (D3) — per-gate approve/revise/reject counts and time to decision.
  gates: publicProcedure
    .input(dashboardInput)
    .query(async ({ input, ctx }) => getGateAnalytics(ctx.tenantId, input.channelId)),
  quality: publicProcedure
    .input(dashboardInput)
    .query(async ({ input, ctx }) => getQualityDashboard(ctx.tenantId, input.channelId)),
});
