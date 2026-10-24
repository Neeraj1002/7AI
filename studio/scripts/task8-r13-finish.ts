// Sprint 5 Task 8 (R13 item 8), continuation: finishes the run that scripts/task8-r13-verify.ts left stopped on the
// scratch database, with the founder's raised ceiling of $0.75 total. The throwaway channel is un-archived for the
// call and archived again afterwards.
//   DATABASE_URL=<scratch> npx tsx scripts/task8-r13-finish.ts <runId>
process.env.YOUTUBE_STUB = '1';
process.env.YOUTUBE_ANALYTICS_STUB = '1';
process.env.TELEGRAM_BOT_TOKEN = '';
process.env.PREFLIGHT_DISABLED = '';

import fs from 'node:fs/promises';
import path from 'node:path';

const CEILING_USD = 0.75;

async function main() {
  const runId = process.argv[2];
  if (!runId) throw new Error('usage: task8-r13-finish.ts <runId>');
  const { prisma } = await import('../src/models/prisma-client');
  const { runsRouter } = await import('../src/api/routers/runs');
  const { sumUsageCostForRun } = await import('../src/models/repositories/usage-event.repository');
  const { removeRunWorkFiles } = await import('../src/ai-visuals/cache');
  const { upsertForChannel, deleteForChannel } = await import('../src/models/repositories/agent-credential.repository');

  const run = await prisma.pipelineRun.findUniqueOrThrow({ where: { id: runId } });
  if (!new URL(process.env.DATABASE_URL ?? 'x://y/z').pathname.includes('scratch')) throw new Error('Refusing to run outside the scratch database');
  const channel = await prisma.channel.findUniqueOrThrow({ where: { id: run.channelId } });
  const caller = runsRouter.createCaller({ tenantId: run.tenantId, userId: null, role: 'owner', identityKind: 'session' } as never);
  const spentBefore = await sumUsageCostForRun(runId);
  console.log(`[r13-finish] ${run.status}/${run.currentStage}, spent so far $${spentBefore.toFixed(4)}, ceiling $${CEILING_USD}`);

  await prisma.channel.update({ where: { id: channel.id }, data: { isActive: true } });
  const evidence: Record<string, unknown> = { spentBeforeUsd: Number(spentBefore.toFixed(4)), ceilingUsd: CEILING_USD };
  try {
    // The first script removed the throwaway credential when it cleaned up, which is why publishing's preflight stopped the
    // run ("not connected to YouTube"). Put it back, then Retry with no settings change (retry-only is allowed).
    await upsertForChannel(channel.id, 'youtube', 'throwaway-token-never-used');
    const wantLimit = run.creationOptions && (run.creationOptions as { maxCostUsd?: number }).maxCostUsd !== CEILING_USD;
    const result = await caller.updateSettings({ runId, retry: true, ...(wantLimit && { maxCostUsd: CEILING_USD }) });
    evidence.call = { changes: result.changes, statusReturned: result.run.status };
    console.log('[r13-finish] updateSettings ->', JSON.stringify(result.changes), result.run.status);

    const deadline = Date.now() + 35 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 15000));
      const live = await prisma.pipelineRun.findUniqueOrThrow({ where: { id: runId } });
      const spent = await sumUsageCostForRun(runId);
      if (spent > CEILING_USD) throw new Error(`Spend $${spent.toFixed(3)} passed the $${CEILING_USD} ceiling`);
      console.log(`[r13-finish] ${live.status}/${live.currentStage} spent $${spent.toFixed(4)}`);
      if (['completed', 'failed', 'needs_attention'].includes(live.status)) break;
    }
    const detail = await caller.get({ id: runId });
    const publishing = detail.stages.filter((s) => s.stageName === 'publishing').at(-1);
    evidence.final = {
      status: detail.run.status, stage: detail.run.currentStage, lastError: detail.run.lastError,
      spentUsd: detail.spentUsd, maxCostUsd: detail.maxCostUsd, settingsChanges: detail.settingsChanges,
      videoAttempts: detail.videoAttempts.map((a) => ({ attempt: a.attempt, outcome: a.outcome, reasonCode: a.reasonCode, costUsd: a.costUsd })),
      cost: detail.cost, publishingPrivacy: (publishing?.output as { privacyStatus?: string } | null)?.privacyStatus ?? null,
      stageOutcomes: detail.stageSummaries.map((s) => `${s.stageName}#${s.attemptNumber}:${s.outcome}`),
      longestShotInReview: (detail.qualityMetrics as { longestShotSeconds?: number } | null)?.longestShotSeconds ?? null,
    };
    console.log('[r13-finish] final', JSON.stringify(evidence.final));
  } finally {
    const row = await prisma.pipelineRun.findUnique({ where: { id: runId }, select: { status: true } });
    if (row && ['completed', 'failed'].includes(row.status)) await removeRunWorkFiles(runId);
    await deleteForChannel(channel.id).catch(() => undefined);
    await prisma.channel.update({ where: { id: channel.id }, data: { isActive: false } });
    const out = path.resolve(__dirname, '..', '..', 'docs', 'execution', 'sprint5', 'reports', 'task8-assets', 'r13-dev-verification.json');
    const existing = JSON.parse(await fs.readFile(out, 'utf8')) as Record<string, unknown>;
    existing[existing.A_continuation ? 'A_continuation_2' : 'A_continuation'] = evidence;
    await fs.writeFile(out, JSON.stringify(existing, null, 2));
    console.log(`[r13-finish] evidence added to ${out}`);
    await prisma.$disconnect();
  }
}

main().then(() => process.exit(0), (error) => {
  console.error(error);
  process.exit(1);
});
