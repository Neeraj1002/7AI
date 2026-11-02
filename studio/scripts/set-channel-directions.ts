// Founder-operated one-off. Dry run by default. --live creates new immutable
// profile versions after every channel and existing profile has been checked.
// Usage: npx tsx scripts/set-channel-directions.ts --tenant <tenant-uuid>
//   --channel "channel name=history" --channel "other name=story-first"
//   --channel "third name=explainer" [--live]
import { prisma } from '../src/models/prisma-client';
import { findActiveProfileForChannel, insertProfileVersion } from '../src/models/repositories/channel-profile-version.repository';
import { parseAssignments } from '../src/channel-direction/admin-plan';
import { setChannelDirections } from '../src/channel-direction/admin-run';

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
  await setChannelDirections({
    tenantId,
    assignments,
    live,
    repository: {
      findChannels: (id, name) => prisma.channel.findMany({ where: { tenantId: id, name, isActive: true } }),
      findActiveProfile: findActiveProfileForChannel,
      insertProfileVersion,
    },
    log: console.log,
  });
}

main().catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
