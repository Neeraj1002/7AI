// One-off founder-operator helper for Week 5 Task 4's fair-access budget
// allocation (C2) — sets or clears a single channel's budgetOverrideUsd.
// Same shape and same throwaway/one-off convention as the existing
// scripts/set-budget-ceiling.ts. No in-app settings UI exists yet for this
// (channel config is still founder-edited directly for the MVP, same
// posture as everything else channel-level) — a real settings screen is
// Part 2 UI work, not this task's scope.
//
// Usage:
//   npx tsx scripts/set-channel-budget-override.ts <channelId> <usdAmount>
//   npx tsx scripts/set-channel-budget-override.ts <channelId> clear
import { prisma } from '../src/models/prisma-client';

async function main(): Promise<void> {
  const channelId = process.argv[2];
  const amountArg = process.argv[3];
  if (!channelId || !amountArg) {
    throw new Error('usage: set-channel-budget-override.ts <channelId> <usdAmount|clear>');
  }

  const existing = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!existing) {
    throw new Error(`no channel found with id ${channelId}`);
  }

  const value = amountArg === 'clear' ? null : amountArg;
  const updated = await prisma.channel.update({
    where: { id: channelId },
    data: { budgetOverrideUsd: value },
  });

  console.log(
    `[budget] channel ${channelId} (${existing.name}) budgetOverrideUsd set to ${
      updated.budgetOverrideUsd ? `$${updated.budgetOverrideUsd.toString()}` : 'null (equal-split default)'
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
