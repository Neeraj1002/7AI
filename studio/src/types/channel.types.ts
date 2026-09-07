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
  voiceProfileId?: string;
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
});
export type CreateChannelInput = z.infer<typeof CreateChannelInputSchema>;
