import { router } from './trpc';
import { runsRouter } from './routers/runs';
import { channelsRouter } from './routers/channels';
import { dashboardRouter } from './routers/dashboard';

export const appRouter = router({
  runs: runsRouter,
  channels: channelsRouter,
  dashboard: dashboardRouter,
});

// Task 2's app imports this type directly (tRPC's whole point: no
// hand-written response types, no duplicated Zod schemas on the client).
export type AppRouter = typeof appRouter;
