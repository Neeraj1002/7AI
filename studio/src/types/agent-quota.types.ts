import type { ChannelPlatform } from './channel.types';

// Pooled per (tenantId, platform) — one shared ceiling across all channels on
// a platform, not per-channel. See docs/execution/week2/SCHEMA.md Section 1.
export type AgentQuota = {
  id: string;
  tenantId: string;
  platform: ChannelPlatform;

  budgetCeilingUsd: string; // NUMERIC as string

  createdAt: Date;
  updatedAt: Date;
};
