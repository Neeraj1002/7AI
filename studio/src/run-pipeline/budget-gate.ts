import { findAgentQuota } from '../models/repositories/agent-quota.repository';
import { listActiveChannelsByTenantAndPlatform } from '../models/repositories/channel.repository';
import { listChannelIdsWithCredential } from '../models/repositories/agent-credential.repository';
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
  // Bugs Closure R1 (F9) — overrides that *equal* the pool leave remainingPool
  // at exactly 0, which the exceeds-pool warning never fires for, yet every
  // default-share channel still gets a $0 ceiling and is refused on every run.
  onPoolFullyReserved?: (details: {
    reservedByOverrides: number;
    poolCeilingUsd: number;
    starvedChannelIds: string[];
  }) => void;
}): Map<string, number> {
  const overridden = params.channels.filter((c) => c.budgetOverrideUsd !== null);
  const defaultShare = params.channels.filter((c) => c.budgetOverrideUsd === null);

  const reservedByOverrides = overridden.reduce((sum, c) => sum + (c.budgetOverrideUsd as number), 0);
  let remainingPool = params.poolCeilingUsd - reservedByOverrides;
  if (remainingPool < 0) {
    params.onOverrideExceedsPool?.({ reservedByOverrides, poolCeilingUsd: params.poolCeilingUsd });
    remainingPool = 0;
  } else if (remainingPool === 0 && defaultShare.length > 0) {
    params.onPoolFullyReserved?.({
      reservedByOverrides,
      poolCeilingUsd: params.poolCeilingUsd,
      starvedChannelIds: defaultShare.map((c) => c.channelId),
    });
  }

  const equalShare = defaultShare.length > 0 ? remainingPool / defaultShare.length : 0;

  const ceilings = new Map<string, number>();
  for (const channel of params.channels) {
    ceilings.set(channel.channelId, channel.budgetOverrideUsd !== null ? channel.budgetOverrideUsd : equalShare);
  }
  return ceilings;
}


// Bugs Closure R1 (D1) — the budget is a WEEKLY one: spend since Monday 00:00
// UTC (05:30 IST), not lifetime spend. One helper, used by the gate and by the
// Dashboard's cost query, so the two can never disagree about the window.
export function currentBudgetWindowStart(now: Date = new Date()): Date {
  const daysSinceMonday = (now.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday));
}

export function nextBudgetWindowStart(now: Date = new Date()): Date {
  const start = currentBudgetWindowStart(now);
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 7));
}

export const BUDGET_RESETS_TEXT = 'Resets Monday 00:00 UTC.';

export type BudgetRefusal = {
  ok: false;
  scope: 'pool' | 'channel';
  spentUsd: number;
  ceilingUsd: number;
  channelId: string;
  channelName: string;
  // True when this default-share channel's ceiling is $0 only because other
  // channels' overrides reserve the whole pool (F9) — spend is irrelevant.
  shareReservedByOverrides: boolean;
  resetsAt: Date;
};

export type BudgetCheck = { ok: true } | BudgetRefusal;

// The exact text a person sees. Numbers come from the same query results that
// made the decision, never from a second lookup.
export function describeBudgetRefusal(check: BudgetRefusal): string {
  const usd = (n: number) => `$${n.toFixed(2)}`;
  if (check.scope === 'pool') {
    return `Account spend limit reached: ${usd(check.spentUsd)} used of ${usd(check.ceilingUsd)} this week. ${BUDGET_RESETS_TEXT}`;
  }
  if (check.shareReservedByOverrides) {
    return `Channel "${check.channelName}" has a ${usd(0)} share because another channel's override reserves the whole account limit. Lower that override or raise the account limit.`;
  }
  return `Limit for channel "${check.channelName}" reached: ${usd(check.spentUsd)} used of ${usd(check.ceilingUsd)} this week. ${BUDGET_RESETS_TEXT}`;
}

export type ChannelBudgetView = {
  poolCeilingUsd: number;
  ceilings: Map<string, number>;
  // Bugs Task 12 (R7): only active channels WITH a connected YouTube account. These alone share the
  // pool; a channel with no connection cannot run (assertChannelCanRun), so it takes no share.
  channels: { id: string; name: string; budgetOverrideUsd: number | null }[];
  // Every active channel, connected or not (name lookup for a run already in flight).
  allActiveChannels?: { id: string; name: string; budgetOverrideUsd: number | null }[];
};

// Shared by the gate and the Dashboard so both show the same effective ceiling.
export async function loadChannelBudgetView(tenantId: string, platform: ChannelPlatform): Promise<ChannelBudgetView> {
  const quota = await findAgentQuota(tenantId, platform);
  if (!quota) {
    throw new NoBudgetConfiguredError(tenantId, platform);
  }
  const poolCeilingUsd = Number(quota.budgetCeilingUsd);
  const allActiveChannels = (await listActiveChannelsByTenantAndPlatform(tenantId, platform)).map((c) => ({
    id: c.id,
    name: c.name,
    budgetOverrideUsd: c.budgetOverrideUsd !== null ? Number(c.budgetOverrideUsd) : null,
  }));
  // Nothing is stored per channel, so connecting or disconnecting changes everyone's share at once.
  const connected = await listChannelIdsWithCredential(allActiveChannels.map((c) => c.id));
  const channels = allActiveChannels.filter((c) => connected.has(c.id));
  const ceilings = computeChannelBudgetCeilings({
    poolCeilingUsd,
    channels: channels.map((c) => ({ channelId: c.id, budgetOverrideUsd: c.budgetOverrideUsd })),
    onOverrideExceedsPool: ({ reservedByOverrides, poolCeilingUsd: pool }) => {
      console.warn(
        `[budget-gate] tenant ${tenantId} platform ${platform}: channel budgetOverrideUsd sum ($${reservedByOverrides.toFixed(2)}) exceeds the pooled AgentQuota.budgetCeilingUsd ($${pool.toFixed(2)}) by $${(reservedByOverrides - pool).toFixed(2)} — every default-share channel gets $0 until the founder fixes the overrides or raises the pool`,
      );
    },
    onPoolFullyReserved: ({ reservedByOverrides, poolCeilingUsd: pool, starvedChannelIds }) => {
      const names = channels.filter((c) => starvedChannelIds.includes(c.id)).map((c) => c.name);
      // D4 — a $0 share for a default-share channel is a configuration error, never a silent state.
      console.error(
        `[budget-gate] tenant ${tenantId} platform ${platform}: channel budgetOverrideUsd sum ($${reservedByOverrides.toFixed(2)}) equals the pooled ceiling ($${pool.toFixed(2)}) — default-share channel(s) ${names.join(', ')} get a $0 ceiling and every run on them will be refused`,
      );
    },
  });
  return { poolCeilingUsd, ceilings, channels, allActiveChannels };
}

export async function checkBudget(
  tenantId: string,
  channelId: string,
  platform: ChannelPlatform,
  now: Date = new Date(),
): Promise<BudgetCheck> {
  const view = await loadChannelBudgetView(tenantId, platform);
  const since = currentBudgetWindowStart(now);
  const resetsAt = nextBudgetWindowStart(now);

  const connectedChannel = view.channels.find((c) => c.id === channelId);
  const channel = connectedChannel ?? view.allActiveChannels?.find((c) => c.id === channelId);
  if (!channel) {
    throw new Error(
      `Channel ${channelId} is not an active channel for tenant ${tenantId}/platform ${platform} — cannot compute its budget ceiling`,
    );
  }

  const spentSoFar = await sumUsageCostForTenantPlatform(tenantId, platform, since);
  if (spentSoFar >= view.poolCeilingUsd) {
    return {
      ok: false,
      scope: 'pool',
      spentUsd: spentSoFar,
      ceilingUsd: view.poolCeilingUsd,
      channelId,
      channelName: channel.name,
      shareReservedByOverrides: false,
      resetsAt,
    };
  }

  // A channel with no YouTube connection has no share; it can't start a run, so for one already in
  // flight only the pool ceiling (checked above) applies.
  const channelCeiling = connectedChannel ? (view.ceilings.get(channelId) as number) : view.poolCeilingUsd;
  const channelSpent = await sumUsageCostForTenantChannelPlatform(tenantId, channelId, platform, since);
  if (channelSpent >= channelCeiling) {
    return {
      ok: false,
      scope: 'channel',
      spentUsd: channelSpent,
      ceilingUsd: channelCeiling,
      channelId,
      channelName: channel.name,
      shareReservedByOverrides: channel.budgetOverrideUsd === null && channelCeiling <= 0,
      resetsAt,
    };
  }
  return { ok: true };
}

export async function isBudgetAvailable(
  tenantId: string,
  channelId: string,
  platform: ChannelPlatform,
): Promise<boolean> {
  return (await checkBudget(tenantId, channelId, platform)).ok;
}

// Bugs Closure R1 (D4) — the smallest weekly share a default-share channel may be left with
// by another channel's override. PROPOSED value; the founder confirms the number.
export const MIN_CHANNEL_SHARE_USD = 5;
// Bugs Task 12 (R7) - the weekly budget a new tenant gets from scripts/invite-tenant.ts (existing
// tenants are untouched). Weekly, like every AgentQuota ceiling (window resets Monday 00:00 UTC).
export const DEFAULT_WEEKLY_BUDGET_USD = 10;
// Guidance for what to grant a tenant per active channel per week — never applied by code.
export const WEEKLY_BUDGET_GUIDE_PER_CHANNEL_USD = 20;

// Write-time guard for every writer of Channel.budgetOverrideUsd. The tenant's weekly budget is
// a stored number (never derived from the channel count); an override is refused when it exceeds
// that budget or leaves any other active default-share channel below MIN_CHANNEL_SHARE_USD.
export function validateBudgetOverride(params: {
  poolCeilingUsd: number;
  channelId: string;
  newOverrideUsd: number;
  channels: { id: string; name: string; budgetOverrideUsd: number | null }[];
}): { ok: true } | { ok: false; message: string } {
  const { poolCeilingUsd, channelId, newOverrideUsd } = params;
  const usd = (n: number) => `$${n.toFixed(2)}`;
  if (newOverrideUsd > poolCeilingUsd) {
    return {
      ok: false,
      message: `A channel limit of ${usd(newOverrideUsd)} is more than the whole weekly account limit of ${usd(poolCeilingUsd)}.`,
    };
  }
  const others = params.channels.filter((c) => c.id !== channelId);
  const reserved = newOverrideUsd + others.reduce((sum, c) => sum + (c.budgetOverrideUsd ?? 0), 0);
  const starved = others.filter((c) => c.budgetOverrideUsd === null);
  if (starved.length > 0) {
    const share = Math.max(0, poolCeilingUsd - reserved) / starved.length;
    if (share < MIN_CHANNEL_SHARE_USD) {
      const names = starved.map((c) => `"${c.name}"`).join(', ');
      return {
        ok: false,
        message: `A channel limit of ${usd(newOverrideUsd)} would leave ${usd(share)} a week of the ${usd(poolCeilingUsd)} weekly account limit for ${names} (minimum ${usd(MIN_CHANNEL_SHARE_USD)} each), so runs on ${starved.length === 1 ? 'it' : 'them'} would be refused. Lower this limit or raise the account limit first.`,
      };
    }
  }
  return { ok: true };
}

// Visible dilution: adding or activating a channel lowers the others' effective ceilings. Returns
// a human-readable warning when any default-share channel is below the $20-per-channel guide (or
// below the floor), else null. Used on channel creation and available to the app/admin screens.
export function budgetDilutionWarning(view: ChannelBudgetView): string | null {
  const shared = view.channels.filter((c) => c.budgetOverrideUsd === null);
  if (shared.length === 0) return null;
  const lowest = Math.min(...shared.map((c) => view.ceilings.get(c.id) ?? 0));
  if (lowest >= WEEKLY_BUDGET_GUIDE_PER_CHANNEL_USD) return null;
  const usd = (n: number) => `$${n.toFixed(2)}`;
  const floorNote = lowest < MIN_CHANNEL_SHARE_USD ? ` — below the ${usd(MIN_CHANNEL_SHARE_USD)} minimum, runs will be refused` : '';
  return `The ${usd(view.poolCeilingUsd)} weekly budget is now split over ${view.channels.length} active channel(s): about ${usd(lowest)} a week each for channels without their own limit (guide: ${usd(WEEKLY_BUDGET_GUIDE_PER_CHANNEL_USD)} per channel)${floorNote}.`;
}
