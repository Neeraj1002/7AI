import { findAgentQuota } from '../models/repositories/agent-quota.repository';
import { sumUsageCostForTenantPlatform } from '../models/repositories/usage-event.repository';
import type { ChannelPlatform } from '../types';

// Cost enforcement (AGENT_FLEET_DESIGN.md 4.10, responsibility 6) — a
// soft/manual ceiling check before an expensive step, per
// docs/execution/week2/BUSINESS_LOGIC.md Section 2's "Cost gate." Application
// logic, not a DB constraint — mirrors the 7-channel-cap pattern in
// manage-channels/channel-cap.ts.

export class NoBudgetConfiguredError extends Error {
  constructor(tenantId: string, platform: string) {
    super(
      `No AgentQuota configured for tenant ${tenantId}, platform ${platform} — cannot enforce a cost gate without one.`,
    );
    this.name = 'NoBudgetConfiguredError';
  }
}

export async function isBudgetAvailable(tenantId: string, platform: ChannelPlatform): Promise<boolean> {
  const quota = await findAgentQuota(tenantId, platform);
  if (!quota) {
    throw new NoBudgetConfiguredError(tenantId, platform);
  }
  const spentSoFar = await sumUsageCostForTenantPlatform(tenantId, platform);
  return spentSoFar < Number(quota.budgetCeilingUsd);
}
