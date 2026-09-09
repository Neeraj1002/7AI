// One-off test-fixture helper for Task 4's revise-over-cap verification —
// resets a run that already has a completed, forced-pass video_review at
// attempt 3 back to paused_gate2 so gate2 can be re-run against it without
// spending more real API budget. Throwaway, not part of src/.
import { prisma } from '../src/models/prisma-client';

async function main(): Promise<void> {
  const runId = process.argv[2];
  if (!runId) throw new Error('usage: fixture-reset-gate2.ts <runId>');
  await prisma.pipelineRun.update({
    where: { id: runId },
    data: { status: 'paused_gate2', currentStage: 'gate2', lastError: null },
  });
  console.log(`[fixture] reset ${runId} to paused_gate2/gate2`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
