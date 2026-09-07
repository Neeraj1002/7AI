// Manual dry-run harness for Task 4's resumability acceptance criterion:
// "create a PipelineRun, run it through a stub stage, kill the process
// mid-stage, restart, and confirm it resumes rather than duplicating or
// losing the run." Not part of src/ — this is a throwaway operator tool, run
// with INTAKE_STAGE_STUB=1 so the intake stage uses the fake, slow stub in
// parse-brief.ts instead of a real Anthropic call.
//
// Usage:
//   npx tsx scripts/dry-run.ts setup                 -> prints a new runId
//   npx tsx scripts/dry-run.ts start <runId>          -> runs intake (kill me mid-flight)
//   npx tsx scripts/dry-run.ts resume                 -> resumes any running PipelineRuns
//   npx tsx scripts/dry-run.ts status <runId>          -> prints run + stage rows

import { prisma } from '../src/models/prisma-client';
import { MVP_TENANT_ID } from '../src/types';
import { createRun, runIntakeStage } from '../src/run-pipeline/state-machine';
import { resumeOnStartup } from '../src/run-pipeline/resume-on-startup';

async function ensureTestChannel(): Promise<string> {
  const existing = await prisma.channel.findFirst({ where: { tenantId: MVP_TENANT_ID } });
  if (existing) return existing.id;
  const created = await prisma.channel.create({
    data: {
      tenantId: MVP_TENANT_ID,
      platform: 'youtube',
      name: 'Dry-run test channel',
      nicheDescription: 'Week 1 dry-run fixture',
    },
  });
  return created.id;
}

async function setup(briefText?: string): Promise<void> {
  const channelId = await ensureTestChannel();
  const run = await createRun({
    tenantId: MVP_TENANT_ID,
    channelId,
    briefText: briefText ?? 'A short video about why octopuses have three hearts.',
  });
  console.log(`runId=${run.id}`);
}

async function start(runId: string): Promise<void> {
  console.log(`[dry-run] starting intake for ${runId} — kill this process now to test resumability`);
  await runIntakeStage(runId);
  console.log('[dry-run] intake completed without interruption');
}

async function resume(): Promise<void> {
  await resumeOnStartup();
  console.log('[dry-run] resume pass complete');
}

async function status(runId: string): Promise<void> {
  const run = await prisma.pipelineRun.findUnique({ where: { id: runId } });
  const stages = await prisma.pipelineStage.findMany({
    where: { pipelineRunId: runId },
    orderBy: { attemptNumber: 'asc' },
  });
  console.log(JSON.stringify({ run, stages }, null, 2));
}

async function main(): Promise<void> {
  const [cmd, arg] = process.argv.slice(2);
  switch (cmd) {
    case 'setup':
      await setup(arg);
      break;
    case 'start':
      if (!arg) throw new Error('usage: dry-run.ts start <runId>');
      await start(arg);
      break;
    case 'resume':
      await resume();
      break;
    case 'status':
      if (!arg) throw new Error('usage: dry-run.ts status <runId>');
      await status(arg);
      break;
    default:
      throw new Error(`unknown command '${cmd}' — expected setup|start|resume|status`);
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
