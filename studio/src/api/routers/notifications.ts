import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { listNotificationPageForUser, listNotificationsForUser } from '../../models/repositories/notification.repository';
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

  // Sprint 5 Task 8 (R12): list returns only the newest 50 rows, which is about 7 or 8 runs once each run has
  // its gate request, re-sends and result. listPage returns the same rows in pages: pass nextCursor back for
  // the next page; total counts all of this user's rows. list is unchanged for existing callers.
  listPage: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(500).optional(), cursor: z.string().uuid().optional() }).optional())
    .query(async ({ input, ctx }) => {
      if (!ctx.userId) return { items: [], nextCursor: null, total: 0 };
      return listNotificationPageForUser(ctx.userId, input ?? {});
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
