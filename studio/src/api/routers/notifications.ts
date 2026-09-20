import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { listNotificationsForUser } from '../../models/repositories/notification.repository';
import { updateUserExpoPushToken } from '../../models/repositories/user.repository';

// Sprint 3 Task 3 (K2) — the real in-app notification inbox
// MVP_PART2 §1 asked for. Same "poll, don't push" pattern api/routers/dashboard.ts's
// existing queries already established — no websocket/SSE infrastructure
// exists in this project.
export const notificationsRouter = router({
  // GET /notifications — scoped to ctx.userId, never a channel/tenant-wide
  // list: a Notification row's whole point is "the real per-user inbox,"
  // not a shared feed.
  list: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.userId) {
      // The ops/script fallback (API_AUTH_TOKEN) has no real userId to
      // scope an inbox to — a real, honest empty list, not a crash or a
      // silently-wrong "someone's" inbox.
      return [];
    }
    return listNotificationsForUser(ctx.userId);
  }),

  // POST /notifications/register-push-token — Sprint 3 Task 7 (O1). The app
  // calls this once it has a real Expo push token from
  // expo-notifications' getExpoPushTokenAsync(). ctx.userId-scoped — no
  // other user's row is reachable through this mutation.
  registerPushToken: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.userId) {
        throw new Error('Registering a push token requires a real signed-in session, not the ops/script fallback');
      }
      await updateUserExpoPushToken(ctx.userId, input.token);
      return { registered: true };
    }),
});
