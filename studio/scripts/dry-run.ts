// Manual dry-run harness for Task 4's resumability acceptance criterion:
// "create a PipelineRun, run it through a stub stage, kill the process
// mid-stage, restart, and confirm it resumes rather than duplicating or
// losing the run." Not part of src/ — this is a throwaway operator tool, run
// with INTAKE_STAGE_STUB=1 so the intake stage uses the fake, slow stub in
// parse-brief.ts instead of a real Anthropic call.
//
// Usage:
//   npx tsx scripts/dry-run.ts setup                    -> prints a new runId
//   npx tsx scripts/dry-run.ts start <runId>             -> runs intake (kill me mid-flight)
//   npx tsx scripts/dry-run.ts script-gen <runId>        -> runs script_generation (Week 2 Task 4)
//   npx tsx scripts/dry-run.ts script-review <runId>     -> runs script_review (Week 2 Task 5)
//   npx tsx scripts/dry-run.ts gate1 <runId> <approve|reject|edit>
//                                                         -> runs gate1 (Week 2 Task 6): sends a
//                                                            REAL Telegram message, then simulates
//                                                            the given reply type (no live human
//                                                            round-trip needed/expected)
//   npx tsx scripts/dry-run.ts full "<brief text>"       -> Week 2 Task 7: chains setup -> intake ->
//                                                            script_generation -> script_review in one
//                                                            process invocation, no manual step between
//                                                            stages (only gate1 needs a human/simulated
//                                                            decision) — prints the runId at the end
//   npx tsx scripts/dry-run.ts resume                    -> resumes any running PipelineRuns
//   npx tsx scripts/dry-run.ts status <runId>             -> prints run + stage + usage_event + review_log rows

import { prisma } from '../src/models/prisma-client';
import { MVP_TENANT_ID } from '../src/types';
import { env } from '../src/config/env';
import {
  createRun,
  runIntakeStage,
  runScriptGenerationStage,
  runScriptReviewStage,
  runGate1Stage,
  runVideoGenerationStage,
  runVideoReviewStage,
} from '../src/run-pipeline/state-machine';
import { simulateIncomingTelegramMessage, peekPendingMessageId } from '../src/notify-founder';
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

async function scriptGen(runId: string): Promise<void> {
  console.log(`[dry-run] starting script_generation for ${runId}`);
  await runScriptGenerationStage(runId);
  console.log('[dry-run] script_generation completed without interruption');
}

async function scriptReview(runId: string): Promise<void> {
  console.log(`[dry-run] starting script_review for ${runId}`);
  await runScriptReviewStage(runId);
  console.log('[dry-run] script_review completed without interruption');
}

// Per Task 6's founder-availability note: this does NOT wait on a live human
// reply. It sends one real message (proving the "send" half works), then
// feeds a simulated incoming update through the real handleUpdate path
// (proving the parsing/resume logic works) — never both halves faked.
async function gate1(runId: string, outcomeArg: string): Promise<void> {
  const replyText =
    outcomeArg === 'approve'
      ? 'approve'
      : outcomeArg === 'reject'
        ? 'reject dry-run test rejection reason'
        : 'This is a dry-run edited script, replacing the original AI draft.';

  if (!env.TELEGRAM_FOUNDER_CHAT_ID) {
    throw new Error('TELEGRAM_FOUNDER_CHAT_ID not set in .env.local');
  }
  const chatId = Number(env.TELEGRAM_FOUNDER_CHAT_ID);

  console.log(
    `[dry-run] starting gate1 for ${runId} — sending a real Telegram message, then simulating a '${outcomeArg}' reply (no live human round-trip)`,
  );

  const gate1Promise = runGate1Stage(runId);

  // Poll for the real sent message's id (registered once requestApproval's
  // sendMessage call completes), then target it explicitly via
  // reply_to_message — deterministic and immune to any unrelated real
  // message arriving in the meantime (e.g. the founder's own prior chat
  // history with the bot), unlike relying on the "single pending" fallback.
  let sentMessageId: number | undefined;
  for (let i = 0; i < 20 && sentMessageId === undefined; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    sentMessageId = peekPendingMessageId(runId);
  }
  if (sentMessageId === undefined) {
    throw new Error('Timed out waiting for the real gate1 message to send');
  }

  await simulateIncomingTelegramMessage({ chatId, text: replyText, replyToMessageId: sentMessageId });

  await gate1Promise;
  console.log(`[dry-run] gate1 completed via simulated '${outcomeArg}' reply`);
}

// Week 2 Task 7 — proves the sequence composes with no manual step between
// automated stages (the acceptance criterion's "without manual intervention
// between stages"). gate1 is deliberately not chained in here: it's the one
// point that's supposed to require an outside decision.
async function full(briefText: string): Promise<void> {
  const channelId = await ensureTestChannel();
  const run = await createRun({ tenantId: MVP_TENANT_ID, channelId, briefText });
  console.log(`[dry-run] full sequence starting for runId=${run.id}`);

  await runIntakeStage(run.id);
  console.log('[dry-run] intake -> script_generation');
  await runScriptGenerationStage(run.id);
  console.log('[dry-run] script_generation -> script_review');
  await runScriptReviewStage(run.id);
  console.log('[dry-run] script_review -> paused_gate1');

  console.log(`runId=${run.id}`);
}

async function videoGen(runId: string): Promise<void> {
  console.log(`[dry-run] starting video_generation for ${runId}`);
  await runVideoGenerationStage(runId);
  console.log('[dry-run] video_generation completed without interruption');
}

async function videoReview(runId: string): Promise<void> {
  console.log(`[dry-run] starting video_review for ${runId}`);
  await runVideoReviewStage(runId);
  console.log('[dry-run] video_review completed without interruption');
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
  const usageEvents = await prisma.usageEvent.findMany({
    where: { pipelineRunId: runId },
    orderBy: { createdAt: 'asc' },
  });
  const reviewLogs = await prisma.reviewLog.findMany({
    where: { pipelineRunId: runId },
    orderBy: { timestamp: 'asc' },
  });
  console.log(JSON.stringify({ run, stages, usageEvents, reviewLogs }, null, 2));
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
    case 'script-gen':
      if (!arg) throw new Error('usage: dry-run.ts script-gen <runId>');
      await scriptGen(arg);
      break;
    case 'script-review':
      if (!arg) throw new Error('usage: dry-run.ts script-review <runId>');
      await scriptReview(arg);
      break;
    case 'gate1': {
      const outcomeArg = process.argv[4];
      if (!arg || !outcomeArg) throw new Error('usage: dry-run.ts gate1 <runId> <approve|reject|edit>');
      await gate1(arg, outcomeArg);
      break;
    }
    case 'full':
      if (!arg) throw new Error('usage: dry-run.ts full "<brief text>"');
      await full(arg);
      break;
    case 'video-gen':
      if (!arg) throw new Error('usage: dry-run.ts video-gen <runId>');
      await videoGen(arg);
      break;
    case 'video-review':
      if (!arg) throw new Error('usage: dry-run.ts video-review <runId>');
      await videoReview(arg);
      break;
    case 'resume':
      await resume();
      break;
    case 'status':
      if (!arg) throw new Error('usage: dry-run.ts status <runId>');
      await status(arg);
      break;
    default:
      throw new Error(
        `unknown command '${cmd}' — expected setup|start|script-gen|script-review|gate1|full|video-gen|video-review|resume|status`,
      );
  }
}

const startedLongPollingBot = process.argv[2] === 'gate1';

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    // Only 'gate1' starts grammy's long-polling loop, which otherwise keeps
    // the process alive forever — force-exit just for that command. Every
    // other command exits naturally; forcing exit unconditionally here
    // trips a libuv assertion on a still-closing handle.
    if (startedLongPollingBot) {
      process.exit(process.exitCode ?? 0);
    }
  });
