import { isDeepStrictEqual } from 'node:util';
import { ChannelProfileDataSchema } from '../channel-profile/schema';
import type { ChannelProfileVersion } from '../models/repositories/channel-profile-version.repository';
import type { Assignment } from './admin-plan';
import { onlyDirectionChanged, withDirection } from './admin-plan';

type ChannelRow = { id: string; name: string };

export type DirectionAdminRepository = {
  findChannels(tenantId: string, name: string): Promise<ChannelRow[]>;
  findActiveProfile(channelId: string): Promise<ChannelProfileVersion | null>;
  insertProfileVersion(input: {
    channelId: string;
    data: ChannelProfileVersion['data'];
    createdByUserId: null;
  }): Promise<ChannelProfileVersion>;
};

export async function setChannelDirections(params: {
  tenantId: string;
  assignments: Assignment[];
  live: boolean;
  repository: DirectionAdminRepository;
  log: (message: string) => void;
}): Promise<void> {
  const { tenantId, assignments, live, repository, log } = params;
  const planned = [];
  for (const assignment of assignments) {
    const rows = await repository.findChannels(tenantId, assignment.channelName);
    if (rows.length !== 1) throw new Error(`Expected exactly one active channel named "${assignment.channelName}" in tenant ${tenantId}; found ${rows.length}. Nothing was written.`);
    const old = await repository.findActiveProfile(rows[0]!.id);
    if (!old) throw new Error(`Channel "${assignment.channelName}" has no content profile. Create it in the app first. Nothing was written.`);
    const before = ChannelProfileDataSchema.parse(old.data);
    const after = withDirection(before, assignment.preset);
    if (!onlyDirectionChanged(before, after)) throw new Error(`Non-direction field changed for "${assignment.channelName}". Nothing was written.`);
    planned.push({ channel: rows[0]!, old, before, after, preset: assignment.preset });
  }
  for (const item of planned) {
    if (item.before.direction?.preset === item.preset) {
      log(`[direction] ${item.channel.name}: already ${item.preset}; no version created`);
      continue;
    }
    if (!live) {
      log(`[direction] DRY RUN ${item.channel.name}: version ${item.old.version} -> ${item.old.version + 1}, preset ${item.preset}`);
      continue;
    }
    const current = await repository.findActiveProfile(item.channel.id);
    if (current?.id !== item.old.id) throw new Error(`Profile changed during this operation for ${item.channel.name}; stop and review. Nothing was written for this channel.`);
    const saved = await repository.insertProfileVersion({ channelId: item.channel.id, data: item.after, createdByUserId: null });
    const reopened = await repository.findActiveProfile(item.channel.id);
    if (!reopened || reopened.id !== saved.id || !onlyDirectionChanged(item.before, reopened.data) ||
        !isDeepStrictEqual(reopened.data, item.after)) {
      throw new Error(`Verification failed for ${item.channel.name}; inspect the saved profile before retrying.`);
    }
    log(`[direction] SAVED ${item.channel.name}: version ${saved.version}, preset ${item.preset}; other fields verified unchanged`);
  }
  if (!live) log('[direction] Dry run only. Repeat with --live after reviewing the three lines above.');
}
