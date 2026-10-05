import { z } from 'zod';

export const CHANNEL_PLATFORMS = ['youtube'] as const;
export type ChannelPlatform = (typeof CHANNEL_PLATFORMS)[number];

export const PRIORS_SCOPES = ['isolated', 'shared'] as const;
export type PriorsScope = (typeof PRIORS_SCOPES)[number];

// Per-channel cap enforced in application logic, not a DB constraint — see
// SCHEMA.md Section 2 and BUSINESS_LOGIC.md Section 3.
export const MAX_CHANNELS_PER_PLATFORM = 7;

export type ApprovalGateConfig = {
  gate1Enabled: boolean;
  gate2Enabled: boolean;
};

export type BrandAssets = {
  introUrl?: string;
  outroUrl?: string;
  watermarkUrl?: string;
  // Sprint 3 Task 12 (R4) — the R2 object key mirroring watermarkUrl's local
  // file, best-effort (absent when R2 wasn't configured or the mirror
  // upload/delete failed — a valid, already-handled state, same posture
  // `r2DraftKey`/`r2FinalKey` establish on pipeline_stages.output).
  watermarkR2Key?: string;
  voiceProfileId?: string;
  // B5 fix (KNOWN_ISSUES_AND_BLOCKERS.md §2/§3) — default true, preserving
  // existing behavior: Video Generation burns captions unless a channel
  // explicitly opts out. No migration needed; brandAssets is an existing
  // Json column.
  captionsEnabled?: boolean;
};

export type Channel = {
  id: string;
  tenantId: string;
  platform: ChannelPlatform;
  name: string;
  externalChannelId: string | null;

  nicheDescription: string;
  styleGuide: string | null;

  brandAssets: BrandAssets;

  postingCadence: string | null;
  approvalGateConfig: ApprovalGateConfig;
  priorsScope: PriorsScope;

  // Week 5 Task 4 (C2) — NUMERIC as string, matching every other money field
  // in this project. null means "use the equal-split share of the pooled
  // AgentQuota.budgetCeilingUsd"; a set value overrides that entirely. See
  // studio/src/run-pipeline/budget-gate.ts.
  budgetOverrideUsd: string | null;

  // Sprint 2 Task 1 (D2) — one of media/registry.ts's TTS_VOICES keys, or
  // null to use its DEFAULT_TTS_VOICE fallback. See
  // studio/src/run-pipeline/state-machine.ts's voice-resolution order.
  defaultVoice: string | null;

  // Sprint 3 Task 8 (R1) — 'private' | 'unlisted' | 'public'; applied at Gate 2
  // approval when no explicit choice is made.
  defaultPrivacyStatus: 'private' | 'unlisted' | 'public';

  // Sprint 3 Task 2 (K1) — nullable FK to User. null degrades to "any
  // owner-role user on the tenant may resolve this channel's gates" rather
  // than becoming permanently unapprovable. See
  // api/routers/runs.ts's gate1/gate2 ownership check.
  ownerUserId: string | null;

  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export const CreateChannelInputSchema = z.object({
  tenantId: z.string().uuid(),
  platform: z.enum(CHANNEL_PLATFORMS).default('youtube'),
  name: z.string().min(1),
  nicheDescription: z.string().min(1),
  styleGuide: z.string().optional(),
  postingCadence: z.string().optional(),
  priorsScope: z.enum(PRIORS_SCOPES).default('isolated'),
  // Sprint 3 Task 2 (K1) — the creating user, set by the caller
  // (manage-channels/channel-cap.ts's createChannelWithCapCheck; Task 6's
  // future channels.create mutation). Optional so existing callers that
  // don't yet have a real ctx.userId (e.g. seed/dry-run fixtures) keep
  // working — an omitted value leaves the channel's ownerUserId null,
  // correctly degrading per the Channel type's own comment.
  ownerUserId: z.string().uuid().optional(),
});
export type CreateChannelInput = z.infer<typeof CreateChannelInputSchema>;
