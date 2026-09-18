// One-off founder-operator helper for Sprint 2 Task 1's voice selection
// (D2) — sets or clears a single channel's defaultVoice. Same shape and
// same throwaway/one-off convention as the existing
// scripts/set-channel-budget-override.ts. No in-app settings UI exists yet
// for this (channel config is still founder-edited directly for the MVP) —
// a real settings screen is Part 2 UI work, not this task's scope.
//
// Usage:
//   npx tsx scripts/set-channel-default-voice.ts <channelId> <voiceKey>
//   npx tsx scripts/set-channel-default-voice.ts <channelId> clear
import { prisma } from '../src/models/prisma-client';
import { TTS_VOICES } from '../src/media';

async function main(): Promise<void> {
  const channelId = process.argv[2];
  const voiceArg = process.argv[3];
  if (!channelId || !voiceArg) {
    throw new Error('usage: set-channel-default-voice.ts <channelId> <voiceKey|clear>');
  }

  const existing = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!existing) {
    throw new Error(`no channel found with id ${channelId}`);
  }

  if (voiceArg !== 'clear' && !(voiceArg in TTS_VOICES)) {
    throw new Error(`unknown voice '${voiceArg}' — known voices: ${Object.keys(TTS_VOICES).join(', ')}`);
  }

  const value = voiceArg === 'clear' ? null : voiceArg;
  const updated = await prisma.channel.update({
    where: { id: channelId },
    data: { defaultVoice: value },
  });

  console.log(
    `[voice] channel ${channelId} (${existing.name}) defaultVoice set to ${
      updated.defaultVoice ?? 'null (media/registry.ts DEFAULT_TTS_VOICE fallback)'
    }`,
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
