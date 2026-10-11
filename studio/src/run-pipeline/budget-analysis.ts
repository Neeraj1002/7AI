import {
  MIN_CHANNEL_SHARE_USD,
  budgetDilutionWarning,
  computeChannelBudgetCeilings,
  type ChannelBudgetView,
} from './budget-gate';

// Admin Sprint 1 (R6) - read-only analysis of a tenant's weekly budget for the
// admin screens. Pure (no database) so it is unit-testable. It never
// reimplements the allocation: ceilings come from computeChannelBudgetCeilings
// (the gate's own function), and the dilution wording from
// budgetDilutionWarning, so the admin screen can never disagree with the gate
// or the app.

export type BudgetWarningCode =
  | 'no_quota'
  | 'override_exceeds_pool'
  | 'override_reserves_whole_pool'
  | 'zero_share'
  | 'pool_exhausted'
  | 'below_guide'
  | 'override_starves_others';

export type BudgetWarning = { code: BudgetWarningCode; channelId?: string; message: string };

export type ChannelBudgetStatus = 'ok' | 'at_limit' | 'zero_share' | 'inactive';

export type AnalyzeBudgetChannelInput = {
  channelId: string;
  name: string;
  isActive: boolean;
  overrideUsd: number | null;
  // The figure the gate compares to this channel's ceiling: its spend in the
  // current weekly window.
  gateSpentUsd: number;
};

export type AnalyzeBudgetChannel = {
  channelId: string;
  name: string;
  isActive: boolean;
  overrideUsd: number | null;
  effectiveCeilingUsd: number | null;
  gateSpentUsd: number;
  spentThisWeekUsd: number;
  status: ChannelBudgetStatus;
};

export type BudgetAnalysis = {
  poolCeilingUsd: number | null;
  reservedByOverridesUsd: number;
  remainingPoolUsd: number;
  channels: AnalyzeBudgetChannel[];
  warnings: BudgetWarning[];
};

const usd = (n: number) => `$${n.toFixed(2)}`;

export function analyzeBudget(params: {
  poolCeilingUsd: number | null;
  channels: AnalyzeBudgetChannelInput[];
  // Tenant-wide spend in the current window, the figure the gate compares to the pool.
  gateSpent: number;
  weekSpent: number;
}): BudgetAnalysis {
  const { poolCeilingUsd, gateSpent } = params;
  const warnings: BudgetWarning[] = [];

  if (poolCeilingUsd === null) {
    warnings.push({
      code: 'no_quota',
      message: 'This tenant has no weekly budget configured for this platform, so every run is refused until one is set.',
    });
    return {
      poolCeilingUsd: null,
      reservedByOverridesUsd: 0,
      remainingPoolUsd: 0,
      channels: params.channels.map((c) => ({
        channelId: c.channelId,
        name: c.name,
        isActive: c.isActive,
        overrideUsd: c.overrideUsd,
        effectiveCeilingUsd: null,
        gateSpentUsd: c.gateSpentUsd,
        spentThisWeekUsd: c.gateSpentUsd,
        status: c.isActive ? 'ok' : 'inactive',
      })),
      warnings,
    };
  }

  // Only ACTIVE channels take part in the allocation, exactly as in the gate.
  const active = params.channels.filter((c) => c.isActive);
  const reservedByOverridesUsd = active.reduce((sum, c) => sum + (c.overrideUsd ?? 0), 0);
  const remainingPoolUsd = Math.max(0, poolCeilingUsd - reservedByOverridesUsd);

  let fullyReservedStarved: string[] = [];
  const ceilings = computeChannelBudgetCeilings({
    poolCeilingUsd,
    channels: active.map((c) => ({ channelId: c.channelId, budgetOverrideUsd: c.overrideUsd })),
    onPoolFullyReserved: ({ starvedChannelIds }) => {
      fullyReservedStarved = starvedChannelIds;
    },
  });

  if (reservedByOverridesUsd > poolCeilingUsd) {
    warnings.push({
      code: 'override_exceeds_pool',
      message: `Channel limits add up to ${usd(reservedByOverridesUsd)}, more than the ${usd(poolCeilingUsd)} weekly budget; every channel without its own limit gets ${usd(0)}.`,
    });
  }
  if (fullyReservedStarved.length > 0) {
    // Equal to the pool, not above it: the case the gate's own exceeds-pool warning never covered.
    warnings.push({
      code: 'override_reserves_whole_pool',
      message: `Channel limits use the whole ${usd(poolCeilingUsd)} weekly budget, leaving ${fullyReservedStarved.length} channel(s) without their own limit at ${usd(0)}; every run on them is refused.`,
    });
  }

  const channels: AnalyzeBudgetChannel[] = params.channels.map((c) => {
    const ceiling = c.isActive ? (ceilings.get(c.channelId) ?? 0) : null;
    let status: ChannelBudgetStatus;
    if (!c.isActive || ceiling === null) status = 'inactive';
    else if (ceiling === 0) status = 'zero_share';
    else if (c.gateSpentUsd >= ceiling) status = 'at_limit';
    else status = 'ok';
    return {
      channelId: c.channelId,
      name: c.name,
      isActive: c.isActive,
      overrideUsd: c.overrideUsd,
      effectiveCeilingUsd: ceiling,
      gateSpentUsd: c.gateSpentUsd,
      spentThisWeekUsd: c.gateSpentUsd,
      status,
    };
  });

  for (const c of channels) {
    if (c.isActive && c.overrideUsd === null && c.effectiveCeilingUsd === 0) {
      warnings.push({
        code: 'zero_share',
        channelId: c.channelId,
        message: `Channel "${c.name}" has a ${usd(0)} weekly share, so every run on it is refused.`,
      });
    }
  }

  if (gateSpent >= poolCeilingUsd) {
    warnings.push({
      code: 'pool_exhausted',
      message: `${usd(gateSpent)} spent this week of the ${usd(poolCeilingUsd)} weekly budget; the gate refuses every run until Monday 00:00 UTC.`,
    });
  }

  // Informational: the budget is below the $20-per-channel guide (which is how a newly added
  // channel diluting the others shows up). Wording is the gate module's own.
  const view: ChannelBudgetView = {
    poolCeilingUsd,
    ceilings,
    channels: active.map((c) => ({ id: c.channelId, name: c.name, budgetOverrideUsd: c.overrideUsd })),
  };
  const dilution = budgetDilutionWarning(view);
  if (dilution) warnings.push({ code: 'below_guide', message: dilution });

  // An override that leaves another default-share channel a positive but too-small share.
  // (A share of exactly zero is already covered by the warnings above.)
  if (reservedByOverridesUsd > 0) {
    for (const c of channels) {
      const ceiling = c.effectiveCeilingUsd;
      if (c.isActive && c.overrideUsd === null && ceiling !== null && ceiling > 0 && ceiling < MIN_CHANNEL_SHARE_USD) {
        warnings.push({
          code: 'override_starves_others',
          channelId: c.channelId,
          message: `Channel "${c.name}" is left with ${usd(ceiling)} a week by other channels' limits (minimum ${usd(MIN_CHANNEL_SHARE_USD)}).`,
        });
      }
    }
  }

  return { poolCeilingUsd, reservedByOverridesUsd, remainingPoolUsd, channels, warnings };
}
