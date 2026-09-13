import { findAgentQuota } from '../models/repositories/agent-quota.repository';
import { listActiveChannelsByTenantAndPlatform } from '../models/repositories/channel.repository';
import {
  sumUsageCostForTenantChannelPlatform,
  sumUsageCostForTenantPlatform,
} from '../models/repositories/usage-event.repository';
import type { ChannelPlatform } from '../types';

// Cost enforcement (AGENT_FLEET_DESIGN.md 4.10, responsibility 6) — a
// soft/manual ceiling check before an expensive step, per
// docs/execution/week2/BUSINESS_LOGIC.md Section 2's "Cost gate." Application
// logic, not a DB constraint — mirrors the 7-channel-cap pattern in
// manage-channels/channel-cap.ts.
//
// Week 5 Task 4 (C2, KNOWN_ISSUES_AND_BLOCKERS.md "no fair-access policy
// across channels") — the pooled AgentQuota.budgetCeilingUsd guards total
// platform spend, but on its own says nothing about which channel gets to
// spend it: one channel's runs processing first each day could exhaust the
// whole pool before any other channel is ever scheduled. Every channel now
// also has its own effective ceiling, computed below, and must stay under
// *both* its own ceiling and the pool's.

export class NoBudgetConfiguredError extends Error {
  constructor(tenantId: string, platform: string) {
    super(
      `No AgentQuota configured for tenant ${tenantId}, platform ${platform} — cannot enforce a cost gate without one.`,
    );
    this.name = 'NoBudgetConfiguredError';
  }
}

export type ChannelBudgetOverride = {
  channelId: string;
  budgetOverrideUsd: number | null;
};

// Pure allocation math — deliberately isolated from any DB query so it can
// be unit-tested directly (Week 5 Task 4, C4) without a live database.
// Founder-directed algorithm (2026-09-13): equal split by default, a
// per-channel override always wins over the split.
//
//   1. reservedByOverrides = sum of every overridden channel's own ceiling.
//   2. remainingPool = poolCeilingUsd - reservedByOverrides.
//   3. If remainingPool goes negative (overrides alone exceed the pool),
//      that's a real misconfiguration, not something to silently absorb by
//      dividing by a negative number — `onOverrideExceedsPool` fires (the
//      caller decides how loudly to surface it; budget-gate.ts logs a
//      warning) and remainingPool floors at 0 — every default-share channel
//      gets $0 until the founder fixes the overrides or raises the pool.
//   4. equalShare = remainingPool / count(default-share channels), 0 if
//      there are none (guards the divide-by-zero).
//   5. Each channel's ceiling = its own override if set, else equalShare.
export function computeChannelBudgetCeilings(params: {
  poolCeilingUsd: number;
  channels: ChannelBudgetOverride[];
  onOverrideExceedsPool?: (details: { reservedByOverrides: number; poolCeilingUsd: number }) => void;
}): Map<string, number> {
  const overridden = params.channels.filter((c) => c.budgetOverrideUsd !== null);
  const defaultShare = params.channels.filter((c) => c.budgetOverrideUsd === null);

  const reservedByOverrides = overridden.reduce((sum, c) => sum + (c.budgetOverrideUsd as number), 0);
  let remainingPool = params.poolCeilingUsd - reservedByOverrides;
  if (remainingPool < 0) {
    params.onOverrideExceedsPool?.({ reservedByOverrides, poolCeilingUsd: params.poolCeilingUsd });
    remainingPool = 0;
  }

  const equalShare = defaultShare.length > 0 ? remainingPool / defaultShare.length : 0;

  const ceilings = new Map<string, number>();
  for (const channel of params.channels) {
    ceilings.set(channel.channelId, channel.budgetOverrideUsd !== null ? channel.budgetOverrideUsd : equalShare);
  }
  return ceilings;
}

export async function isBudgetAvailable(
  tenantId: string,
  channelId: string,
  platform: ChannelPlatform,
): Promise<boolean> {
  const quota = await findAgentQuota(tenantId, platform);
  if (!quota) {
    throw new NoBudgetConfiguredError(tenantId, platform);
  }
  const poolCeilingUsd = Number(quota.budgetCeilingUsd);

  const spentSoFar = await sumUsageCostForTenantPlatform(tenantId, platform);
  if (spentSoFar >= poolCeilingUsd) {
    return false;
  }

  const channels = await listActiveChannelsByTenantAndPlatform(tenantId, platform);
  const ceilings = computeChannelBudgetCeilings({
    poolCeilingUsd,
    channels: channels.map((c) => ({
      channelId: c.id,
      budgetOverrideUsd: c.budgetOverrideUsd !== null ? Number(c.budgetOverrideUsd) : null,
    })),
    onOverrideExceedsPool: ({ reservedByOverrides, poolCeilingUsd: pool }) => {
      console.warn(
        `[budget-gate] tenant ${tenantId} platform ${platform}: channel budgetOverrideUsd sum ($${reservedByOverrides.toFixed(2)}) exceeds the pooled AgentQuota.budgetCeilingUsd ($${pool.toFixed(2)}) by $${(reservedByOverrides - pool).toFixed(2)} — every default-share channel gets $0 until the founder fixes the overrides or raises the pool`,
      );
    },
  });

  const channelCeiling = ceilings.get(channelId);
  if (channelCeiling === undefined) {
    throw new Error(
      `Channel ${channelId} is not an active channel for tenant ${tenantId}/platform ${platform} — cannot compute its budget ceiling`,
    );
  }

  const channelSpent = await sumUsageCostForTenantChannelPlatform(tenantId, channelId, platform);
  return channelSpent < channelCeiling;
}
