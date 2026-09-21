import { router } from './trpc';
import { runsRouter } from './routers/runs';
import { channelsRouter } from './routers/channels';
import { dashboardRouter } from './routers/dashboard';
import { notificationsRouter } from './routers/notifications';

export const appRouter = router({
  runs: runsRouter,
  channels: channelsRouter,
  dashboard: dashboardRouter,
  notifications: notificationsRouter,
});

// Task 2's app imports this type directly (tRPC's whole point: no
// hand-written response types, no duplicated Zod schemas on the client).
export type AppRouter = typeof appRouter;
