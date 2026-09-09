// One-off test-fixture helper for Task 4 verification — forces a passing
// video_review verdict for a run's latest video_generation attempt, without
// spending real multimodal-LLM budget re-triggering Task 3's known
// flashing-caption/frame-extraction finding on every fixture. Throwaway, not
// part of src/.
import { prisma } from '../src/models/prisma-client';

async function main(): Promise<void> {
  const runId = process.argv[2];
  if (!runId) throw new Error('usage: fixture-force-video-review-pass.ts <runId>');

  const videoGenStage = await prisma.pipelineStage.findFirst({
    where: { pipelineRunId: runId, stageName: 'video_generation', status: 'completed' },
    orderBy: { attemptNumber: 'desc' },
  });
  if (!videoGenStage) throw new Error(`no completed video_generation stage found for ${runId}`);
  const videoPath = (videoGenStage.output as { videoPath?: string } | null)?.videoPath;

  const previousReview = await prisma.pipelineStage.findFirst({
    where: { pipelineRunId: runId, stageName: 'video_review' },
    orderBy: { attemptNumber: 'desc' },
  });
  const attemptNumber = previousReview ? previousReview.attemptNumber + 1 : 1;

  await prisma.pipelineStage.create({
    data: {
      pipelineRunId: runId,
      stageName: 'video_review',
      attemptNumber,
      status: 'completed',
      input: { videoPath, topic: 'fixture' },
      output: { verdict: 'pass', rationale: 'test fixture: forced pass to test Gate 2 without more real API spend' },
      completedAt: new Date(),
    },
  });

  await prisma.pipelineRun.update({
    where: { id: runId },
    data: { status: 'paused_gate2', currentStage: 'gate2', lastError: null },
  });

  console.log(`[fixture] forced video_review attempt ${attemptNumber} to pass for ${runId}, run set to paused_gate2`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
