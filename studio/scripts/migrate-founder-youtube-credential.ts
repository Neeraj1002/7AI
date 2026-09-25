// Sprint 3 Task 5 (M3) — one-off: migrates the founder's existing real
// env.YOUTUBE_REFRESH_TOKEN into a real AgentCredential row for their own
// channel, so their channel keeps working without re-consenting through
// the new browser OAuth flow once this task's client modules stop reading
// the env var at all. Run once, by the founder (or on their behalf, with
// their real env var already in .env.local). Same shape/convention as
// scripts/set-channel-default-voice.ts.
//
// Usage:
//   npx tsx scripts/migrate-founder-youtube-credential.ts <channelId>

import { prisma } from '../src/models/prisma-client';
import { env } from '../src/config/env';
import { upsertForChannel, findByChannel } from '../src/models/repositories/agent-credential.repository';

async function main(): Promise<void> {
  const channelId = process.argv[2];
  if (!channelId) {
    throw new Error('usage: migrate-founder-youtube-credential.ts <channelId>');
  }

  if (!env.YOUTUBE_REFRESH_TOKEN) {
    throw new Error('YOUTUBE_REFRESH_TOKEN is not set in .env.local — nothing to migrate.');
  }
  if (!env.CREDENTIAL_ENCRYPTION_KEY) {
    throw new Error(
      'CREDENTIAL_ENCRYPTION_KEY is not set — set it before migrating a real credential (see .env.example).',
    );
  }

  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) {
    throw new Error(`no channel found with id ${channelId}`);
  }

  const existing = await findByChannel(channelId);
  if (existing) {
    console.log(
      `[migrate-founder-youtube-credential] channel ${channelId} (${channel.name}) already has an AgentCredential row — overwriting with the current YOUTUBE_REFRESH_TOKEN value.`,
    );
  }

  await upsertForChannel(channelId, 'youtube', env.YOUTUBE_REFRESH_TOKEN);

  console.log(
    `[migrate-founder-youtube-credential] channel ${channelId} (${channel.name}) now has a real, encrypted AgentCredential row. YOUTUBE_REFRESH_TOKEN can be removed from .env.local once you've confirmed a real publish/stats-poll works with it unset (Task 5's own M3 regression check).`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
