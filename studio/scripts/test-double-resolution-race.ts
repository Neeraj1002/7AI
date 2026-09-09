// Frontend track Task 1 — explicit, repeatable proof for BUSINESS_LOGIC.md
// Section 1's design fork: whichever of the API or Telegram resolves a
// pending gate first wins; the other gets a clean "already resolved"
// response rather than a silent no-op or a double-resolve.
//
// Real DB, real Telegram bot (no mocks) — same "one real message, one
// simulated reply" convention scripts/dry-run.ts already uses for gate1/
// gate2, extended here to a *second*, conflicting resolution attempt.
//
// Usage: npx tsx scripts/test-double-resolution-race.ts

import { prisma } from '../src/models/prisma-client';
import { MVP_TENANT_ID } from '../src/types';
import { env } from '../src/config/env';
import {
  createRun,
  runIntakeStage,
  runScriptGenerationStage,
  runScriptReviewStage,
  runGate1Stage,
} from '../src/run-pipeline/state-machine';
import { founderChannel, simulateIncomingTelegramMessage, peekPendingMessageId } from '../src/notify-founder';

async function ensureTestChannel(): Promise<string> {
  const existing = await prisma.channel.findFirst({ where: { tenantId: MVP_TENANT_ID } });
  if (existing) return existing.id;
  const created = await prisma.channel.create({
    data: {
      tenantId: MVP_TENANT_ID,
      platform: 'youtube',
      name: 'Race-test channel',
      nicheDescription: 'Frontend track Task 1 double-resolution race fixture',
    },
  });
  return created.id;
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
  console.log(`  OK: ${message}`);
}

async function main(): Promise<void> {
  if (!env.TELEGRAM_FOUNDER_CHAT_ID) {
    throw new Error('TELEGRAM_FOUNDER_CHAT_ID not set in .env.local');
  }
  const chatId = Number(env.TELEGRAM_FOUNDER_CHAT_ID);

  const channelId = await ensureTestChannel();
  const run = await createRun({
    tenantId: MVP_TENANT_ID,
    channelId,
    briefText: 'A short video about why octopuses have three hearts (double-resolution race fixture).',
  });
  console.log(`[race-test] runId=${run.id} — driving to Gate 1`);

  await runIntakeStage(run.id);
  await runScriptGenerationStage(run.id);
  await runScriptReviewStage(run.id);

  // Opens the real gate (sends a real Telegram message, blocks on a reply) —
  // deliberately not awaited yet, mirroring dry-run.ts's own gate1 command.
  const gate1Promise = runGate1Stage(run.id);

  let sentMessageId: number | undefined;
  for (let i = 0; i < 20 && sentMessageId === undefined; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    sentMessageId = peekPendingMessageId(run.id);
  }
  assert(sentMessageId !== undefined, 'Gate 1 opened and sent a real Telegram message');

  // --- First resolution: the API's path (founderChannel.resolvePendingApproval directly). ---
  const first = founderChannel.resolvePendingApproval(run.id, 'approve');
  assert(first.resolved === true, 'first resolution (API) succeeds: resolved=true');

  // --- Second resolution attempt, same primitive, simulating a second API call arriving late. ---
  const second = founderChannel.resolvePendingApproval(run.id, 'approve');
  assert(second.resolved === false, 'second resolution (API, late) is cleanly rejected: resolved=false');

  // --- Third: an actual Telegram reply arriving after the gate is already resolved. ---
  // Must not throw, and must not be treated as a decision (pendingByThreadKey
  // no longer has this run's entry at all, so the real handleUpdate path can
  // only log it, never resolve anything with it).
  await simulateIncomingTelegramMessage({
    chatId,
    text: 'reject a late telegram reply that must be ignored',
    replyToMessageId: sentMessageId,
  });
  console.log('  OK: a Telegram reply to the already-resolved gate did not throw');

  assert(peekPendingMessageId(run.id) === undefined, 'no pending entry remains for this run after resolution');

  const finalRun = await gate1Promise;
  assert(
    finalRun.status === 'running' && finalRun.currentStage === 'video_generation',
    `Gate 1 actually resolved with the FIRST decision (approve): status=${finalRun.status} currentStage=${finalRun.currentStage}`,
  );

  console.log(`[race-test] PASS — run ${run.id} advanced exactly once, from the first (API) resolution only`);
}

main()
  .catch((error) => {
    console.error('[race-test] FAIL:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(process.exitCode ?? 0);
  });
