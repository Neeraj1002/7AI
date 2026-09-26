import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure } from '../trpc';
import { listActiveChannelsByTenant, findChannelById, updateChannel } from '../../models/repositories/channel.repository';
import type { Context } from '../trpc';
import { PrivacyStatusSchema } from '../../agents/publishing';
import { deleteForChannel, findByChannel } from '../../models/repositories/agent-credential.repository';
import { buildYoutubeConnectUrl } from '../../manage-channels/youtube-oauth-connect';
import { canResolveGate } from '../../run-pipeline/gate-ownership';
import { createChannelWithCapCheck, ChannelCapExceededError } from '../../manage-channels/channel-cap';
import { CreateChannelInputSchema } from '../../types';
import type { Channel } from '../../types';

// Sprint 3 Task 6 (N2) — a plain existence check against Task 5's
// agent_credentials table, not a validity check (a revoked-but-still-present
// token is Task 5's own failure-handling concern, surfaced at publish/poll
// time, not here). Shared by list/get/create so all three report the exact
// same derived field the same way.
async function withHasYoutubeCredential(channel: Channel): Promise<Channel & { hasYoutubeCredential: boolean }> {
  const credential = await findByChannel(channel.id);
  return { ...channel, hasYoutubeCredential: credential !== null };
}

// Sprint 3 Task 8 — shared by update/archive: NOT_FOUND for a missing channel
// or one on another tenant (never leak existence), FORBIDDEN unless the caller
// passes canResolveGate. Archived-channel handling stays with each caller.
async function loadManageableChannel(
  channelId: string,
  ctx: Context,
  options: { allowArchived?: boolean } = {},
): Promise<Channel> {
  const channel = await findChannelById(channelId);
  if (!channel || channel.tenantId !== ctx.tenantId) {
    throw new TRPCError({ code: 'NOT_FOUND', message: `Channel ${channelId} not found` });
  }
  if (!canResolveGate(ctx, channel)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: `You are not allowed to manage channel ${channelId}` });
  }
  if (!channel.isActive && !options.allowArchived) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: `Channel ${channelId} is archived` });
  }
  return channel;
}

export const channelsRouter = router({
  // GET /channels — Channel switcher (Task 2), wired from day one even with
  // a single channel active (MOBILE_APP_DESIGN.md Section 4).
  // Sprint 3 Task 1 (J3) — the real signed-in session's tenant, never
  // MVP_TENANT_ID.
  list: publicProcedure.query(async ({ ctx }) => {
    const channels = await listActiveChannelsByTenant(ctx.tenantId);
    return Promise.all(channels.map(withHasYoutubeCredential));
  }),

  // GET /channels/:id — Sprint 3 Task 6 (N2). Same tenant-scoping as list —
  // a channel belonging to a different tenant reports NOT_FOUND, never leaks
  // its existence. Read access is tenant-wide (any signed-in member of the
  // tenant), not owner-only — matches list's existing behavior; ownership
  // only gates *mutating* a channel (create/connect/disconnect/gates).
  get: publicProcedure
    .input(z.object({ channelId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const channel = await findChannelById(input.channelId);
      if (!channel || channel.tenantId !== ctx.tenantId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: `Channel ${input.channelId} not found` });
      }
      return withHasYoutubeCredential(channel);
    }),

  // POST /channels — Sprint 3 Task 6 (N1). tenantId is never client-supplied
  // (taken from ctx.tenantId, same "never trust a client-supplied tenant id"
  // posture this sprint's auth work establishes everywhere else — J3,
  // runs.ts's ownership checks). ownerUserId defaults to the creating user
  // (ctx.userId) — the creating user owns what they create, per Task 2's own
  // "owner at creation time" note; the ops/script fallback (ctx.userId ===
  // null) leaves it unset, correctly degrading to "any owner-role user on
  // the tenant" per Channel's own documented null-owner behavior.
  create: publicProcedure
    .input(CreateChannelInputSchema.omit({ tenantId: true, ownerUserId: true }))
    .mutation(async ({ input, ctx }) => {
      try {
        const channel = await createChannelWithCapCheck({
          ...input,
          tenantId: ctx.tenantId,
          ownerUserId: ctx.userId ?? undefined,
        });
        return withHasYoutubeCredential(channel);
      } catch (error) {
        if (error instanceof ChannelCapExceededError) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: error.message, cause: error });
        }
        throw error;
      }
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

  // POST /channels.update — Sprint 3 Task 8 (R2). Same ownership check as
  // disconnectYoutube/getYoutubeConnectUrl; a channel on another tenant reads
  // as NOT_FOUND. Archived channels are rejected (R3 makes archiving
  // one-way). NOTE (product question, not decided here): every pipeline stage
  // re-reads the channel at execution time, so a niche edit affects the
  // not-yet-executed stages of runs already in progress.
  update: publicProcedure
    .input(
      z.object({
        channelId: z.string().uuid(),
        name: z.string().min(1).optional(),
        nicheDescription: z.string().min(1).optional(),
        defaultPrivacyStatus: PrivacyStatusSchema.optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const channel = await loadManageableChannel(input.channelId, ctx);
      const updated = await updateChannel(channel.id, {
        name: input.name,
        nicheDescription: input.nicheDescription,
        defaultPrivacyStatus: input.defaultPrivacyStatus,
      });
      return withHasYoutubeCredential(updated);
    }),
});
