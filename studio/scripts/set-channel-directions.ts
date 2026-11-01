// Founder-operated one-off. Dry run by default. --live creates new immutable
// profile versions after every channel and existing profile has been checked.
// Usage: npx tsx scripts/set-channel-directions.ts --tenant <tenant-uuid>
//   --channel "channel name=history" --channel "other name=story-first"
//   --channel "third name=explainer" [--live]
import { prisma } from '../src/models/prisma-client';
import { findActiveProfileForChannel, insertProfileVersion } from '../src/models/repositories/channel-profile-version.repository';
import { parseAssignments, withDirection, onlyDirectionChanged } from '../src/channel-direction/admin-plan';
import { ChannelProfileDataSchema } from '../src/channel-profile/schema';
import { isDeepStrictEqual } from 'node:util';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const tenantAt = args.indexOf('--tenant');
  const tenantId = tenantAt >= 0 ? args[tenantAt + 1] : undefined;
  const names = args.flatMap((arg, index) => arg === '--channel' ? [args[index + 1] ?? ''] : []);
  const live = args.includes('--live');
  if (!tenantId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId) ||
      args.length !== 8 + Number(live) || args.some((arg) => arg.startsWith('--') && !['--tenant', '--channel', '--live'].includes(arg))) {
    throw new Error('Usage: set-channel-directions.ts --tenant <uuid> --channel "name=history" --channel "name=story-first" --channel "name=explainer" [--live]');
  }
  const assignments = parseAssignments(names);
  const planned = [];
  for (const assignment of assignments) {
    const rows = await prisma.channel.findMany({ where: { tenantId, name: assignment.channelName, isActive: true } });
    if (rows.length !== 1) throw new Error(`Expected exactly one active channel named "${assignment.channelName}" in tenant ${tenantId}; found ${rows.length}. Nothing was written.`);
    const old = await findActiveProfileForChannel(rows[0]!.id);
    if (!old) throw new Error(`Channel "${assignment.channelName}" has no content profile. Create it in the app first. Nothing was written.`);
    const before = ChannelProfileDataSchema.parse(old.data);
    const after = withDirection(before, assignment.preset);
    if (!onlyDirectionChanged(before, after)) throw new Error(`Non-direction field changed for "${assignment.channelName}". Nothing was written.`);
    planned.push({ channel: rows[0]!, old, before, after, preset: assignment.preset });
  }
  for (const item of planned) {
    if (item.before.direction?.preset === item.preset) {
      console.log(`[direction] ${item.channel.name}: already ${item.preset}; no version created`);
      continue;
    }
    if (!live) {
      console.log(`[direction] DRY RUN ${item.channel.name}: version ${item.old.version} -> ${item.old.version + 1}, preset ${item.preset}`);
      continue;
    }
    const current = await findActiveProfileForChannel(item.channel.id);
    if (current?.id !== item.old.id) throw new Error(`Profile changed during this operation for ${item.channel.name}; stop and review. Nothing was written for this channel.`);
    const saved = await insertProfileVersion({ channelId: item.channel.id, data: item.after, createdByUserId: null });
    const reopened = await findActiveProfileForChannel(item.channel.id);
    if (!reopened || reopened.id !== saved.id || !onlyDirectionChanged(item.before, reopened.data) ||
        !isDeepStrictEqual(reopened.data, item.after)) {
      throw new Error(`Verification failed for ${item.channel.name}; inspect the saved profile before retrying.`);
    }
    console.log(`[direction] SAVED ${item.channel.name}: version ${saved.version}, preset ${item.preset}; other fields verified unchanged`);
  }
  if (!live) console.log('[direction] Dry run only. Repeat with --live after reviewing the three lines above.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
