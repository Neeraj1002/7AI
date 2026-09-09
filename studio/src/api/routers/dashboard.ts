import { router, publicProcedure } from '../trpc';
import {
  getOperationalDashboard,
  getCostDashboard,
  getContentPerformanceDashboard,
  getQualityDashboard,
} from '../../models/repositories/dashboard.repository';

// GET /dashboard/operational, /cost, /content, /quality — BUSINESS_LOGIC.md
// Section 3, MOBILE_APP_DESIGN.md Section 4's four groups. Response shapes
// are documented in src/types/dashboard.types.ts for Task 3 to build against.
export const dashboardRouter = router({
  operational: publicProcedure.query(async () => getOperationalDashboard()),
  cost: publicProcedure.query(async () => getCostDashboard()),
  content: publicProcedure.query(async () => getContentPerformanceDashboard()),
  quality: publicProcedure.query(async () => getQualityDashboard()),
});
