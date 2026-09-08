// One-off cleanup for Week 3 Task 5 — closes out leftover 'running' test
// fixture runs from earlier tasks' manual testing (Week 2 Task 7's known
// finding: resumeOnStartup sweeps ALL stale running runs, not just a target
// one — leaving these as 'running' would re-trigger real Anthropic calls on
// already-settled test data the next time resume() is invoked for anything).
// Marks each explicitly given run id as 'needs_attention' with a note, rather
// than deleting rows — preserves history, excludes them from future sweeps.
// Throwaway, not part of src/.
import { prisma } from '../src/models/prisma-client';

async function main(): Promise<void> {
  const runIds = process.argv.slice(2);
  if (runIds.length === 0) throw new Error('usage: close-stale-test-runs.ts <runId> [runId...]');

  for (const runId of runIds) {
    await prisma.pipelineRun.update({
      where: { id: runId },
      data: {
        status: 'needs_attention',
        lastError: 'Closed out as a stale test fixture during Week 3 Task 5 resumability testing cleanup',
      },
    });
    console.log(`[cleanup] closed out ${runId}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
