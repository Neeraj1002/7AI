// Manual dry-run harness for Task 4's resumability acceptance criterion:
// "create a PipelineRun, run it through a stub stage, kill the process
// mid-stage, restart, and confirm it resumes rather than duplicating or
// losing the run." Not part of src/ — this is a throwaway operator tool, run
// with INTAKE_STAGE_STUB=1 so the intake stage uses the fake, slow stub in
// parse-brief.ts instead of a real Anthropic call.
//
// Usage:
//   npx tsx scripts/dry-run.ts setup ["<brief text>"] ["<voice key>"] ["<stock-footage|ai-stills>"] ["<mood tag|none>"]
//                                                         -> prints a new runId; optional 3rd arg
//                                                            sets creationOptions.voice (Sprint 2
//                                                            Task 1, D2), optional 4th sets
//                                                            creationOptions.visualSource (Sprint 2
//                                                            Task 2, E2), optional 5th sets
//                                                            creationOptions.audioLayer (Sprint 2
//                                                            Task 3, F1)
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
//   npx tsx scripts/dry-run.ts gate1-live <runId>        -> real gate1: sends a real Telegram message
//                                                            and genuinely blocks for a real human reply
//   npx tsx scripts/dry-run.ts gate2-live <runId>        -> same, for gate2 (Week 5 Task 1)
//   npx tsx scripts/dry-run.ts video-gen <runId>         -> runs video_generation (Week 3/4)
//   npx tsx scripts/dry-run.ts video-review <runId>      -> runs video_review
//   npx tsx scripts/dry-run.ts publish <runId>           -> runs publishing (Week 4 Task 2)
//   npx tsx scripts/dry-run.ts analytics <runId>         -> runs the initial analytics snapshot (Week 4 Task 3)
//   npx tsx scripts/dry-run.ts poll                      -> runs one Performance Analytics poll tick
//   npx tsx scripts/dry-run.ts resume                    -> resumes any running PipelineRuns
//   npx tsx scripts/dry-run.ts status <runId>             -> prints run + stage + usage_event + review_log rows
//   npx tsx scripts/dry-run.ts digest                    -> Sprint 2 Task 6 (I1): runs one founder-digest
//                                                            check for real (sends a real Telegram message
//                                                            if a digest is actually due)
//   npx tsx scripts/dry-run.ts tag <runId> <tagWord> ["<notes>"]
//                                                         -> Sprint 2 Task 6 (I2): simulates the founder
//                                                            sending "tag <runId> <tagWord> <notes>" over
//                                                            Telegram (no live human round-trip needed)

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
  runGate2Stage,
  runPublishingStage,
  runAnalyticsStage,
} from '../src/run-pipeline/state-machine';
import { runPeriodicPoll } from '../src/agents/performance-analytics';
import type { ProductionPlan } from '../src/agents/video-generation/plan';
import { simulateIncomingTelegramMessage, peekPendingMessageId } from '../src/notify-founder';
import { resumeOnStartup } from '../src/run-pipeline/resume-on-startup';
import { runFounderDigestCheck } from '../src/run-pipeline/founder-digest';

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

// Sprint 2 Task 1 (D2): optional third arg lets a dry run set an explicit
// per-run voice override, exercising the real creationOptions column and
// the real API-shaped input (not a synthetic test-only field) end-to-end.
// Sprint 2 Task 2 (E2): optional fourth arg does the same for visualSource.
// Sprint 2 Task 3 (F1): optional fifth arg does the same for audioLayer.
async function setup(briefText?: string, voice?: string, visualSource?: string, audioLayer?: string): Promise<void> {
  const channelId = await ensureTestChannel();
  const run = await createRun({
    tenantId: MVP_TENANT_ID,
    channelId,
    briefText: briefText ?? 'A short video about why octopuses have three hearts.',
    creationOptions:
      voice || visualSource || audioLayer
        ? { ...(voice && { voice }), ...(visualSource && { visualSource }), ...(audioLayer && { audioLayer }) }
        : undefined,
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
async function gate1(runId: string, outcomeArg: string, editText?: string): Promise<void> {
  const replyText =
    outcomeArg === 'approve'
      ? 'approve'
      : outcomeArg === 'reject'
        ? 'reject dry-run test rejection reason'
        : (editText ?? 'This is a dry-run edited script, replacing the original AI draft.');

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

// Week 2 Task 6's still-open criterion, closed for real here: sends the real
// Telegram message and then genuinely blocks on requestApproval's real
// pending-reply promise — no simulateIncomingTelegramMessage call at all.
// Resolves only when an actual human reply arrives via the bot's real
// long-polling handleUpdate path.
async function gate1Live(runId: string): Promise<void> {
  console.log(
    `[dry-run] starting REAL gate1 round trip for ${runId} — sending a real Telegram message and waiting for an actual human reply (no simulation)`,
  );
  const run = await runGate1Stage(runId);
  console.log(`[dry-run] gate1 resolved via a REAL human reply — PipelineRun.status=${run.status}, currentStage=${run.currentStage}`);
}

// Same no-live-round-trip convention as gate1: sends one real Telegram
// message (with the video attached, or a too-large notice), then targets a
// simulated reply at that exact message id.
async function gate2(runId: string, outcomeArg: string): Promise<void> {
  const replyText =
    outcomeArg === 'approve'
      ? 'approve'
      : outcomeArg === 'reject'
        ? 'reject dry-run test rejection reason'
        : 'Please brighten the background and re-render.';

  if (!env.TELEGRAM_FOUNDER_CHAT_ID) {
    throw new Error('TELEGRAM_FOUNDER_CHAT_ID not set in .env.local');
  }
  const chatId = Number(env.TELEGRAM_FOUNDER_CHAT_ID);

  console.log(
    `[dry-run] starting gate2 for ${runId} — sending a real Telegram message, then simulating a '${outcomeArg}' reply (no live human round-trip)`,
  );

  const gate2Promise = runGate2Stage(runId);

  // Gate 2's requestApproval uploads the actual video file via sendVideo
  // (not a lightweight sendMessage like Gate 1) — a real multi-MB upload
  // takes longer than gate1's 10s polling window, so this waits up to 60s.
  let sentMessageId: number | undefined;
  for (let i = 0; i < 120 && sentMessageId === undefined; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    sentMessageId = peekPendingMessageId(runId);
  }
  if (sentMessageId === undefined) {
    throw new Error('Timed out waiting for the real gate2 message to send');
  }

  await simulateIncomingTelegramMessage({ chatId, text: replyText, replyToMessageId: sentMessageId });

  await gate2Promise;
  console.log(`[dry-run] gate2 completed via simulated '${outcomeArg}' reply`);
}

// Week 5 Task 1's real end-to-end run: same no-simulation convention as
// gate1Live — sends the real Telegram message (with the real video
// attached) and genuinely blocks on requestApproval's real pending-reply
// promise. Resolves only when an actual human reply arrives via the bot's
// real long-polling handleUpdate path.
async function gate2Live(runId: string): Promise<void> {
  console.log(
    `[dry-run] starting REAL gate2 round trip for ${runId} — sending a real Telegram message (with video) and waiting for an actual human reply (no simulation)`,
  );
  const run = await runGate2Stage(runId);
  console.log(`[dry-run] gate2 resolved via a REAL human reply — PipelineRun.status=${run.status}, currentStage=${run.currentStage}`);
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

// Week 4 Task 1's actual regression test: deliberately reproduces Week 3
// Task 3's real failure (word-flash captions + midpoint-frame sampling
// reading as a partial word), by forcing attempt 1's production plan rather
// than hoping a real, unbiased planning call happens to reproduce it (the
// new planning prompt actively steers away from word-flash by default, which
// is the fix — so it shouldn't be relied on to fail organically anymore).
// Attempt 2, by contrast, is NOT forced — it's a fully real planning call
// driven by real fixNotes from the real video_review failure this produces,
// which is what actually proves the loop closes.
async function videoGenRegression(runId: string): Promise<void> {
  const run = await prisma.pipelineRun.findUnique({ where: { id: runId } });
  if (!run) throw new Error(`PipelineRun ${runId} not found`);
  const topic = (run.intakeParsed as { topic?: string } | null)?.topic ?? 'abstract background';

  const forcedPlan: ProductionPlan = {
    visualSource: 'stock-footage',
    stockFootageQuery: topic.split(/\s+/).slice(0, 4).join(' ') || 'abstract background',
    captionStyle: 'word-flash',
    audioLayer: 'none',
    pacingNotes: 'flash each word individually for punchy pacing',
    rationale:
      "Regression-test forced plan (dry-run.ts video-gen-regression) — deterministically reproduces Week 3 Task 3's flashing-caption/partial-word review failure so the real regen loop can be exercised against it.",
  };

  console.log('[dry-run] video-gen-regression: forcing attempt 1 to word-flash captions (test override, not a real planning call)');
  await runVideoGenerationStage(runId, { forcedPlan });
  console.log('[dry-run] attempt 1 (forced word-flash) rendered — running video_review');
  const run1 = await runVideoReviewStage(runId);
  console.log(`[dry-run] attempt 1 review verdict -> PipelineRun.status=${run1.status}, currentStage=${run1.currentStage}`);

  if (run1.status !== 'running' || run1.currentStage !== 'video_generation') {
    console.log(
      '[dry-run] attempt 1 did NOT fail review (or the regen cap was already exhausted) — no regen to observe on this run. Reporting the actual outcome rather than forcing a narrative.',
    );
    return;
  }

  console.log('[dry-run] attempt 1 failed review as expected — running a REAL attempt 2 (no override), driven by real fixNotes');
  await runVideoGenerationStage(runId);
  const run2 = await runVideoReviewStage(runId);
  console.log(`[dry-run] attempt 2 review verdict -> PipelineRun.status=${run2.status}, currentStage=${run2.currentStage}`);

  const attempts = await prisma.pipelineStage.findMany({
    where: { pipelineRunId: runId, stageName: 'video_generation' },
    orderBy: { attemptNumber: 'asc' },
  });
  for (const attempt of attempts) {
    const output = attempt.output as { plan?: ProductionPlan; videoPath?: string } | null;
    console.log(
      `[dry-run] video_generation attempt ${attempt.attemptNumber}: captionStyle=${output?.plan?.captionStyle}, stockFootageQuery="${output?.plan?.stockFootageQuery}", videoPath=${output?.videoPath}`,
    );
  }
}

async function publish(runId: string): Promise<void> {
  console.log(`[dry-run] starting publishing for ${runId}`);
  await runPublishingStage(runId);
  console.log('[dry-run] publishing completed without interruption');
}

async function analytics(runId: string): Promise<void> {
  console.log(`[dry-run] starting analytics for ${runId}`);
  await runAnalyticsStage(runId);
  console.log('[dry-run] analytics completed without interruption');
}

async function poll(): Promise<void> {
  const result = await runPeriodicPoll();
  console.log(`[dry-run] periodic poll: polled=${result.polled}, skipped=${result.skipped}`);
}

async function resume(): Promise<void> {
  await resumeOnStartup();
  console.log('[dry-run] resume pass complete');
}

async function digest(): Promise<void> {
  console.log('[dry-run] running one real founder-digest check');
  const result = await runFounderDigestCheck();
  console.log(`[dry-run] digest check complete — sent=${result.sent}`);
}

// Sprint 2 Task 6 (I2) — same no-live-round-trip convention gate1/gate2
// already use: simulates the founder sending the real "tag ..." command
// text over Telegram, targeted at no specific pending message (a post-hoc
// tag is never a reply to something we sent), so it goes through
// telegram-channel.ts's real message:text handler exactly as a live message
// would.
async function tag(runId: string, tagWord: string, notes?: string): Promise<void> {
  if (!env.TELEGRAM_FOUNDER_CHAT_ID) {
    throw new Error('TELEGRAM_FOUNDER_CHAT_ID not set in .env.local');
  }
  const chatId = Number(env.TELEGRAM_FOUNDER_CHAT_ID);
  const text = notes ? `tag ${runId} ${tagWord} ${notes}` : `tag ${runId} ${tagWord}`;
  console.log(`[dry-run] simulating a real incoming Telegram tag command: "${text}"`);
  await simulateIncomingTelegramMessage({ chatId, text });
  console.log('[dry-run] tag command dispatched — check the bot reply and review_logs table');
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
      await setup(arg, process.argv[4], process.argv[5], process.argv[6]);
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
      const editText = process.argv[5];
      if (!arg || !outcomeArg) throw new Error('usage: dry-run.ts gate1 <runId> <approve|reject|edit> ["<edit text>"]');
      await gate1(arg, outcomeArg, editText);
      break;
    }
    case 'gate1-live':
      if (!arg) throw new Error('usage: dry-run.ts gate1-live <runId>');
      await gate1Live(arg);
      break;
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
    case 'video-gen-regression':
      if (!arg) throw new Error('usage: dry-run.ts video-gen-regression <runId>');
      await videoGenRegression(arg);
      break;
    case 'gate2': {
      const outcomeArg = process.argv[4];
      if (!arg || !outcomeArg) throw new Error('usage: dry-run.ts gate2 <runId> <approve|reject|revise>');
      await gate2(arg, outcomeArg);
      break;
    }
    case 'gate2-live':
      if (!arg) throw new Error('usage: dry-run.ts gate2-live <runId>');
      await gate2Live(arg);
      break;
    case 'publish':
      if (!arg) throw new Error('usage: dry-run.ts publish <runId>');
      await publish(arg);
      break;
    case 'analytics':
      if (!arg) throw new Error('usage: dry-run.ts analytics <runId>');
      await analytics(arg);
      break;
    case 'poll':
      await poll();
      break;
    case 'resume':
      await resume();
      break;
    case 'status':
      if (!arg) throw new Error('usage: dry-run.ts status <runId>');
      await status(arg);
      break;
    case 'digest':
      await digest();
      break;
    case 'tag': {
      const tagWord = process.argv[4];
      const notes = process.argv[5];
      if (!arg || !tagWord) throw new Error('usage: dry-run.ts tag <runId> <tagWord> ["<notes>"]');
      await tag(arg, tagWord, notes);
      break;
    }
    default:
      throw new Error(
        `unknown command '${cmd}' — expected setup|start|script-gen|script-review|gate1|gate1-live|full|video-gen|video-review|video-gen-regression|gate2|gate2-live|publish|analytics|poll|resume|status|digest|tag`,
      );
  }
}

const startedLongPollingBot =
  process.argv[2] === 'gate1' ||
  process.argv[2] === 'gate1-live' ||
  process.argv[2] === 'gate2' ||
  process.argv[2] === 'gate2-live' ||
  // Sprint 2 Task 6: 'digest' calls founderChannel.notify (via
  // runFounderDigestCheck) and 'tag' calls simulateIncomingTelegramMessage —
  // both start the same real long-polling loop notify/requestApproval
  // already do.
  process.argv[2] === 'digest' ||
  process.argv[2] === 'tag';

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
