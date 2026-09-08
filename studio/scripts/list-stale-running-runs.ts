// One-off inspection helper for Task 5's resumability test — lists every
// PipelineRun currently at status='running' along with its latest stage, so
// the blast radius of resumeOnStartup's global sweep (Week 2 Task 7's known
// finding: it resumes ALL stale running runs, not just a target one) can be
// seen before invoking it. Throwaway, not part of src/.
import { prisma } from '../src/models/prisma-client';

async function main(): Promise<void> {
  const runs = await prisma.pipelineRun.findMany({ where: { status: 'running' } });
  for (const run of runs) {
    const latest = await prisma.pipelineStage.findFirst({
      where: { pipelineRunId: run.id },
      orderBy: [{ attemptNumber: 'desc' }, { createdAt: 'desc' }],
    });
    console.log(`${run.id}  currentStage=${run.currentStage}  latestStage=${latest?.stageName}/${latest?.status}`);
  }
  console.log(`total: ${runs.length}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
