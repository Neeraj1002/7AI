import {
  countActiveChannelsByTenantAndPlatform,
  insertChannel,
} from '../models/repositories/channel.repository';
import { MAX_CHANNELS_PER_PLATFORM } from '../types';
import type { Channel, CreateChannelInput } from '../types';

export class ChannelCapExceededError extends Error {
  constructor(tenantId: string, platform: string) {
    super(
      `Tenant ${tenantId} already has ${MAX_CHANNELS_PER_PLATFORM} active '${platform}' channels — this is a permanent product rule (AGENT_FLEET_DESIGN.md Section 6.2.1), not a soft MVP default.`,
    );
    this.name = 'ChannelCapExceededError';
  }
}

// Enforces the 7-channel-per-(tenant, platform) cap (BUSINESS_LOGIC.md Section 3).
// Application-level check, not a DB constraint — see SCHEMA.md Section 2 for why.
export async function createChannelWithCapCheck(input: CreateChannelInput): Promise<Channel> {
  const activeCount = await countActiveChannelsByTenantAndPlatform(input.tenantId, input.platform);
  if (activeCount >= MAX_CHANNELS_PER_PLATFORM) {
    throw new ChannelCapExceededError(input.tenantId, input.platform);
  }
  return insertChannel(input);
}
