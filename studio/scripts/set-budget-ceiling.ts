// One-off helper for Task 5's budget-gate demonstration — temporarily
// sets AgentQuota.budgetCeilingUsd for the MVP tenant/platform so the
// video-side budget-gate path (Task 2's isBudgetAvailable check, now also
// guarding video_generation) can be exercised deliberately, then restored.
// Throwaway, not part of src/.
import { prisma } from '../src/models/prisma-client';
import { MVP_TENANT_ID } from '../src/types';

async function main(): Promise<void> {
  const ceiling = process.argv[2];
  if (!ceiling) throw new Error('usage: set-budget-ceiling.ts <ceilingUsd>');
  const channel = await prisma.channel.findFirst({ where: { tenantId: MVP_TENANT_ID } });
  if (!channel) throw new Error('no channel found for MVP tenant');
  const updated = await prisma.agentQuota.updateMany({
    where: { tenantId: MVP_TENANT_ID, platform: channel.platform },
    data: { budgetCeilingUsd: ceiling },
  });
  console.log(`[budget] set budgetCeilingUsd=${ceiling} for platform=${channel.platform} (${updated.count} row(s))`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
