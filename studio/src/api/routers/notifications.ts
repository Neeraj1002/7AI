import { router, publicProcedure } from '../trpc';
import { listNotificationsForUser } from '../../models/repositories/notification.repository';
import { createTelegramLinkCode, unlinkTelegram } from '../../notify-founder';

// Sprint 3 Task 3 (K2) — the real in-app notification inbox
// MVP_PART2 §1 asked for, plus the Telegram link/unlink flow. Same "poll,
// don't push" pattern api/routers/dashboard.ts's existing queries already
// established — no websocket/SSE infrastructure exists in this project, and
// building one wasn't asked for.
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

  // POST /notifications/telegram/link-code — issues a real, short-lived
  // code the user sends to the bot as "/link <code>" (telegram-channel.ts).
  createTelegramLinkCode: publicProcedure.mutation(async ({ ctx }) => {
    if (!ctx.userId) {
      throw new Error('Telegram linking requires a real signed-in session, not the ops/script fallback');
    }
    return createTelegramLinkCode(ctx.userId);
  }),

  // POST /notifications/telegram/unlink — the design doc's own "a clear
  // disconnect path in the app" requirement.
  unlinkTelegram: publicProcedure.mutation(async ({ ctx }) => {
    if (!ctx.userId) {
      throw new Error('Telegram unlinking requires a real signed-in session, not the ops/script fallback');
    }
    await unlinkTelegram(ctx.userId);
    return { unlinked: true };
  }),
});
