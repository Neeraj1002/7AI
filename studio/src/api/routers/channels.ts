import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure } from '../trpc';
import {
  listActiveChannelsByTenant,
  findChannelById,
  updateChannel,
  updateChannelBrandAssets,
  updateChannelApprovalGateConfig,
  archiveChannel,
} from '../../models/repositories/channel.repository';
import { listRuns, updatePipelineRun } from '../../models/repositories/pipeline-run.repository';
import { hasPendingApproval, resolvePendingApproval } from '../../notifications';
import type { Context } from '../trpc';
import { PrivacyStatusSchema } from '../../agents/publishing';
import { TTS_VOICE_KEYS } from '../../media';
import { deleteForChannel, findByChannel } from '../../models/repositories/agent-credential.repository';
import { buildYoutubeConnectUrl } from '../../manage-channels/youtube-oauth-connect';
import { canResolveGate } from '../../run-pipeline/gate-ownership';
import { createChannelWithCapCheck, ChannelCapExceededError } from '../../manage-channels/channel-cap';
import { CreateChannelInputSchema } from '../../types';
import type { Channel } from '../../types';
import { ChannelProfileDataSchema } from '../../channel-profile';
import { CONTENT_FORMATS } from '../../formats/manifest';
import {
  insertProfileVersion,
  findActiveProfileForChannel,
  listProfileVersionsForChannel,
} from '../../models/repositories/channel-profile-version.repository';

// Sprint 4 Task 1: tenant-scoped read access (any member of the tenant), same
// rule as channels.get. Another tenant's channel reads as NOT_FOUND.
async function loadReadableChannel(channelId: string, ctx: Context): Promise<Channel> {
  const channel = await findChannelById(channelId);
  if (!channel || channel.tenantId !== ctx.tenantId) {
    throw new TRPCError({ code: 'NOT_FOUND', message: `Channel ${channelId} not found` });
  }
  return channel;
}

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

  // Sprint 4 Task 6: the static format list for the brief form's picker. Plain
  // reference data, so any valid session may read it.
  listFormats: publicProcedure.query(() => CONTENT_FORMATS),

  // Sprint 4 Task 1 (R2): channel profile versions. Creating one is a
  // channel-management action, so it is ownership-checked like connecting
  // YouTube (loadManageableChannel = canResolveGate). The new version becomes
  // the channel active one in the same transaction. Bad `data` is a
  // BAD_REQUEST with Zod's own message, before anything is written.
  createProfileVersion: publicProcedure
    .input(z.object({ channelId: z.string().uuid(), data: z.unknown() }))
    .mutation(async ({ input, ctx }) => {
      const channel = await loadManageableChannel(input.channelId, ctx);
      const parsed = ChannelProfileDataSchema.safeParse(input.data);
      if (!parsed.success) {
        const detail = parsed.error.issues
          .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
          .join('; ');
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Invalid channel profile: ${detail}` });
      }
      return insertProfileVersion({
        channelId: channel.id,
        data: parsed.data,
        createdByUserId: ctx.userId ?? null,
      });
    }),

  // null when the channel has never had a profile: a valid, expected state.
  getActiveProfile: publicProcedure
    .input(z.object({ channelId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const channel = await loadReadableChannel(input.channelId, ctx);
      return findActiveProfileForChannel(channel.id);
    }),

  // Newest first.
  listProfileVersions: publicProcedure
    .input(z.object({ channelId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const channel = await loadReadableChannel(input.channelId, ctx);
      return listProfileVersionsForChannel(channel.id);
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
      if (!channel.isActive) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Channel ${input.channelId} is archived` });
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
        // Sprint 3 Task 9 (R1) — null clears the override (falls back to the
        // channel's/pipeline's own existing default), omitted leaves it
        // unchanged; same optional-vs-null distinction Task 8/R2 already
        // established for this mutation.
        styleGuide: z.string().nullable().optional(),
        defaultVoice: z.enum(TTS_VOICE_KEYS).nullable().optional(),
        captionsEnabled: z.boolean().optional(),
        budgetOverrideUsd: z.number().positive().multipleOf(0.01).nullable().optional(),
        // Sprint 3 Task 9 (R2) — Gate 1/Gate 2 toggles. Gate 1 has no
        // constraint (a founder can always choose to skip Gate 1 review);
        // Gate 2 does — see the invariant check below.
        gate1Enabled: z.boolean().optional(),
        gate2Enabled: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const channel = await loadManageableChannel(input.channelId, ctx);
      // Sprint 3 Task 9 (R2) — the invariant "gate2Enabled:false requires
      // defaultPrivacyStatus 'private'" must hold at rest, not just at the
      // instant gate2Enabled is set: computed against whichever value(s) this
      // call actually changes, falling back to the channel's current value
      // for whichever one it doesn't — so this also catches a call that
      // changes defaultPrivacyStatus away from 'private' while gate2Enabled
      // is already false from an earlier call, not just a call that sets
      // gate2Enabled:false directly.
      const effectiveGate2Enabled = input.gate2Enabled ?? channel.approvalGateConfig.gate2Enabled;
      const effectivePrivacyStatus = input.defaultPrivacyStatus ?? channel.defaultPrivacyStatus;
      if ((input.gate2Enabled !== undefined || input.defaultPrivacyStatus !== undefined) &&
        !effectiveGate2Enabled && effectivePrivacyStatus !== 'private') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: "gate2Enabled can only be false when defaultPrivacyStatus is 'private'",
        });
      }
      let updated = await updateChannel(channel.id, {
        name: input.name,
        nicheDescription: input.nicheDescription,
        defaultPrivacyStatus: input.defaultPrivacyStatus,
        styleGuide: input.styleGuide,
        defaultVoice: input.defaultVoice,
        budgetOverrideUsd: input.budgetOverrideUsd !== undefined ? input.budgetOverrideUsd?.toString() ?? null : undefined,
      });
      // brandAssets is a shared JSON column (R3 also writes watermarkUrl into
      // it) — routed through the merge helper, never a direct column write,
      // so this can never clobber whatever the other feature stored there.
      if (input.captionsEnabled !== undefined) {
        updated = await updateChannelBrandAssets(channel.id, { captionsEnabled: input.captionsEnabled });
      }
      if (input.gate1Enabled !== undefined || input.gate2Enabled !== undefined) {
        const gatePatch: Partial<Channel['approvalGateConfig']> = {};
        if (input.gate1Enabled !== undefined) gatePatch.gate1Enabled = input.gate1Enabled;
        if (input.gate2Enabled !== undefined) gatePatch.gate2Enabled = input.gate2Enabled;
        updated = await updateChannelApprovalGateConfig(channel.id, gatePatch);
      }
      return withHasYoutubeCredential(updated);
    }),
  // POST /channels.archive — Sprint 3 Task 8 (R3). One-way soft delete: no
  // restore path by design. Steps run in order, each independently safe to
  // redo, so a crash midway is recovered by simply calling archive again
  // (already-archived channels skip straight to the sweep for that reason —
  // it only ever touches runs still in a non-terminal status).
  archive: publicProcedure
    .input(z.object({ channelId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const channel = await loadManageableChannel(input.channelId, ctx, { allowArchived: true });
      const alreadyArchived = !channel.isActive;

      if (!alreadyArchived) {
        await archiveChannel(channel.id);
      }
      await deleteForChannel(channel.id);

      // A run sitting at a gate right now is released through the existing
      // reject path (sets status 'failed', lastError "Rejected at Gate N:
      // Channel deleted" — that template is the reject handler's own, not
      // special-cased here). Anything else non-terminal (mid automated
      // stage) is failed directly with the literal 'Channel deleted'.
      const inFlight = await listRuns({
        channelId: channel.id,
        statuses: ['pending', 'running', 'paused_gate1', 'paused_gate2'],
      });
      let cancelled = 0;
      for (const run of inFlight) {
        if (hasPendingApproval(run.id)) {
          resolvePendingApproval(run.id, { reply: 'reject Channel deleted', userId: ctx.userId });
        } else {
          await updatePipelineRun(run.id, { status: 'failed', lastError: 'Channel deleted' });
        }
        cancelled += 1;
      }
      return { archived: true, alreadyArchived, cancelledRuns: cancelled };
    }),
});
