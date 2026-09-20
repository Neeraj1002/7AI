import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure } from '../trpc';
import { listActiveChannelsByTenant, findChannelById } from '../../models/repositories/channel.repository';
import { deleteForChannel } from '../../models/repositories/agent-credential.repository';
import { buildYoutubeConnectUrl } from '../../manage-channels/youtube-oauth-connect';
import { canResolveGate } from '../../run-pipeline/gate-ownership';

export const channelsRouter = router({
  // GET /channels — Channel switcher (Task 2), wired from day one even with
  // a single channel active (MOBILE_APP_DESIGN.md Section 4).
  // Sprint 3 Task 1 (J3) — the real signed-in session's tenant, never
  // MVP_TENANT_ID.
  list: publicProcedure.query(async ({ ctx }) => {
    return listActiveChannelsByTenant(ctx.tenantId);
  }),

  // GET /channels/:id/youtube/connect — Sprint 3 Task 5 (M2). Returns the
  // real Google consent URL for the app to open; the app itself calls this
  // as a normal authenticated request (this endpoint's own auth header),
  // then navigates the browser/webview to the *returned* Google URL, which
  // needs no header of ours at all. Ownership-checked via canResolveGate —
  // the exact same rule Task 2 (K1) established for gate resolution:
  // connecting a credential is at least as sensitive an action on a
  // channel as resolving one of its gates.
  getYoutubeConnectUrl: publicProcedure
    .input(z.object({ channelId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const channel = await findChannelById(input.channelId);
      if (!channel) {
        throw new TRPCError({ code: 'NOT_FOUND', message: `Channel ${input.channelId} not found` });
      }
      if (!canResolveGate(ctx, channel)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: `You are not allowed to manage channel ${input.channelId}` });
      }
      if (!ctx.userId) {
        // The ops/script fallback has no real userId to bind the OAuth
        // state to — connecting a channel's real YouTube credential is a
        // real-user action, not something the ops token should trigger.
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Connecting a YouTube channel requires a real signed-in session' });
      }
      const authUrl = buildYoutubeConnectUrl({ channelId: channel.id, userId: ctx.userId });
      return { authUrl };
    }),

  // DELETE /channels/:id/youtube/connection — the design doc's own "a
  // clear disconnect path in the app" requirement, which did not exist in
  // any form before this task. Same ownership check as connecting.
  disconnectYoutube: publicProcedure
    .input(z.object({ channelId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const channel = await findChannelById(input.channelId);
      if (!channel) {
        throw new TRPCError({ code: 'NOT_FOUND', message: `Channel ${input.channelId} not found` });
      }
      if (!canResolveGate(ctx, channel)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: `You are not allowed to manage channel ${input.channelId}` });
      }
      await deleteForChannel(channel.id);
      return { disconnected: true };
    }),
});
