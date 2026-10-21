// Sprint 5 Task 8 (R13 item 8): the real check on the dev database, with a hard ceiling of $0.50 of model spend.
//   npx tsx scripts/task8-r13-verify.ts
// A throwaway channel ("Task8 R13 throwaway", both gates off, YouTube and analytics stubbed, no notification
// transport) and two runs:
//   A. a long video stopped by preflight because its spend limit is below the next step; changed through
//      runs.updateSettings with retry:true (max spend and music), run to completion by the normal runner; a change
//      that would be refused (visibility other than private with Gate 2 off) and a call from another tenant are
//      tried first and must save nothing.
//   B. a run with a stale, invalid voice, stopped before spending anything; fixed through runs.updateSettings
//      without retry, then cancelled.
// It never starts the server, so resume-on-startup does not touch other runs. Afterwards the channel is archived
// and the run's work files are removed; the run rows stay as the evidence.
process.env.YOUTUBE_STUB = '1';
process.env.YOUTUBE_ANALYTICS_STUB = '1';
process.env.TELEGRAM_BOT_TOKEN = '';
process.env.PREFLIGHT_DISABLED = '';

import fs from 'node:fs/promises';
import path from 'node:path';

const CEILING_USD = 0.5;
const BRIEF = `A 2-minute explainer: how the Eiffel Tower was built, and why it was not torn down.
Use only these facts:
- The tower was built for the 1889 World's Fair in Paris, which marked 100 years since the French Revolution.
- It was designed at the engineering company of Gustave Eiffel; the first sketch came from Maurice Koechlin and Emile Nouguier.
- Construction took 2 years, 2 months and 5 days, from 1887 to 1889, and the tower opened on 31 March 1889.
- It is made of 18,038 pieces of wrought iron held together by 2.5 million rivets.
- At 300 metres it was the tallest man-made structure in the world until the Chrysler Building passed it in 1930.
- Its permit was for 20 years, after which the city could have dismantled it.
- Eiffel saved it by turning it into a scientific tool: he used it for meteorological and aerodynamic experiments and a radio antenna, so the city kept it.
Chapters should follow: why build it, how it went up, why it was almost lost, why it stayed.`;

async function main() {
  const { prisma } = await import('../src/models/prisma-client');
  const { MVP_TENANT_ID } = await import('../src/types');
  const sm = await import('../src/run-pipeline/state-machine');
  const { runsRouter } = await import('../src/api/routers/runs');
  const { sumUsageCostForRun } = await import('../src/models/repositories/usage-event.repository');
  const { upsertForChannel, deleteForChannel } = await import('../src/models/repositories/agent-credential.repository');
  const { archiveChannel } = await import('../src/models/repositories/channel.repository');
  const { removeRunWorkFiles } = await import('../src/ai-visuals/cache');
  const { estimateRunCost } = await import('../src/run-pipeline/cost-estimate');
  const { getRemainingWeeklyUsd } = await import('../src/run-pipeline/budget-gate');

  const evidence: Record<string, unknown> = { startedAt: new Date().toISOString(), ceilingUsd: CEILING_USD };
  // A scratch database (empty) needs the tenant and its weekly budget; on the shared dev database these already exist.
  await prisma.tenant.upsert({ where: { id: MVP_TENANT_ID }, create: { id: MVP_TENANT_ID, name: 'Task8 R13 scratch tenant' }, update: {} });
  await prisma.agentQuota.upsert({ where: { tenantId_platform: { tenantId: MVP_TENANT_ID, platform: 'youtube' } }, create: { tenantId: MVP_TENANT_ID, platform: 'youtube', budgetCeilingUsd: 5 }, update: {} });
  evidence.database = new URL(process.env.DATABASE_URL ?? 'x://y/z').pathname.slice(1);
  const user = await prisma.user.findFirst({ where: { tenantId: MVP_TENANT_ID }, select: { id: true } });
  const ctx = { tenantId: MVP_TENANT_ID, userId: user?.id ?? null, role: 'owner', identityKind: 'session' } as never;
  const caller = runsRouter.createCaller(ctx);
  const otherTenant = runsRouter.createCaller({ tenantId: '99999999-9999-4999-8999-999999999999', userId: null, role: 'owner', identityKind: 'session' } as never);

  const channel = await prisma.channel.create({
    data: {
      tenantId: MVP_TENANT_ID, platform: 'youtube', name: 'Task8 R13 throwaway', nicheDescription: 'Sprint 5 Task 8 R13 verification; archived after the run',
      approvalGateConfig: { gate1Enabled: false, gate2Enabled: false },
    },
  });
  await upsertForChannel(channel.id, 'youtube', 'throwaway-token-never-used');
  evidence.channelId = channel.id;
  const created: string[] = [];
  try {
    const estimate = estimateRunCost({ videoKind: 'long', targetSeconds: 120 });
    const remaining = await getRemainingWeeklyUsd(channel.tenantId, channel.id, 'youtube');
    console.log(`[r13] estimate $${estimate.estimateUsd}, left this week for the channel $${remaining.toFixed(2)}`);
    if (estimate.estimateUsd > remaining) throw new Error('Not enough weekly budget for one attempt; stopping before spending anything.');

    // ---- Run A: stopped by preflight (limit below the next step), changed with retry:true, finished
    const run = await sm.createRun({
      tenantId: channel.tenantId, channelId: channel.id, briefText: BRIEF,
      creationOptions: { videoKind: 'long', targetDurationSec: 120, formatKey: 'chaptered-explainer', audioLayer: 'calm', maxCostUsd: 0.12 },
    });
    created.push(run.id);
    const runId = run.id;
    // Preflight stops the run at intake: the limit is below what the video is estimated to need.
    const stopped = await sm.runIntakeStage(runId);
    const spentBefore = await sumUsageCostForRun(runId);
    evidence.A_stopped = { status: stopped.status, stage: stopped.currentStage, lastError: stopped.lastError, preflightBlock: stopped.creationOptions?.preflightBlock ?? null, spentUsd: Number(spentBefore.toFixed(4)) };
    console.log(`[r13] A stopped: ${stopped.status}/${stopped.currentStage}: ${stopped.lastError}`);
    if (stopped.status !== 'needs_attention') throw new Error('Run A did not stop as planned');

    // refused changes save nothing
    const refusals: Record<string, string> = {};
    try { await caller.updateSettings({ runId, privacyStatus: 'unlisted' }); refusals.visibility = 'ACCEPTED (unexpected)'; } catch (e) { refusals.visibility = (e as Error).message; }
    try { await otherTenant.updateSettings({ runId, audioLayer: 'tense' }); refusals.otherTenant = 'ACCEPTED (unexpected)'; } catch (e) { refusals.otherTenant = (e as Error).message; }
    try { await caller.updateSettings({ runId, maxCostUsd: 100000 }); refusals.hugeLimit = 'ACCEPTED (unexpected)'; } catch (e) { refusals.hugeLimit = (e as Error).message; }
    const unchanged = await caller.get({ id: runId });
    evidence.A_refusals = { ...refusals, settingsChangesAfterRefusals: unchanged.settingsChanges.length, statusAfterRefusals: unchanged.run.status };
    console.log('[r13] refusals', JSON.stringify(evidence.A_refusals));

    // the real change, with the retry in the same call
    const result = await caller.updateSettings({ runId, maxCostUsd: CEILING_USD, audioLayer: 'inspirational', retry: true });
    evidence.A_call = { changes: result.changes, statusReturned: result.run.status };
    console.log('[r13] updateSettings ->', JSON.stringify(result.changes), result.run.status);

    // the normal runner (started by retry:true) finishes the run
    const deadline = Date.now() + 35 * 60 * 1000;
    let live = result.run;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 15000));
      live = (await prisma.pipelineRun.findUnique({ where: { id: runId } })) as never;
      const spent = await sumUsageCostForRun(runId);
      if (spent > CEILING_USD) throw new Error(`Spend $${spent.toFixed(3)} passed the $${CEILING_USD} ceiling`);
      console.log(`[r13] A ${live.status}/${live.currentStage} spent $${spent.toFixed(4)}`);
      if (['completed', 'failed', 'needs_attention'].includes(live.status)) break;
    }
    const detail = await caller.get({ id: runId });
    const publishing = detail.stages.filter((s) => s.stageName === 'publishing').at(-1);
    evidence.A_final = {
      status: detail.run.status, stage: detail.run.currentStage, lastError: detail.run.lastError,
      spentUsd: detail.spentUsd, maxCostUsd: detail.maxCostUsd, settingsChanges: detail.settingsChanges,
      music: detail.run.creationOptions?.audioLayer, resolvedOptionsMusic: detail.run.creationOptions?.resolvedOptions?.music,
      videoAttempts: detail.videoAttempts.map((a) => ({ attempt: a.attempt, outcome: a.outcome, costUsd: a.costUsd })),
      cost: detail.cost, publishingPrivacy: (publishing?.output as { privacyStatus?: string } | null)?.privacyStatus ?? null,
      stageOutcomes: detail.stageSummaries.map((s) => `${s.stageName}#${s.attemptNumber}:${s.outcome}`),
    };
    console.log('[r13] A final', JSON.stringify(evidence.A_final));

    // ---- Run B: a stale invalid voice stops the run before any spend; fixed without retry
    const stale = await sm.createRun({ tenantId: channel.tenantId, channelId: channel.id, briefText: BRIEF, creationOptions: { videoKind: 'long', targetDurationSec: 120, voice: 'robot', maxCostUsd: CEILING_USD } });
    created.push(stale.id);
    const blocked = await sm.runIntakeStage(stale.id);
    const fixed = await caller.updateSettings({ runId: stale.id, voice: 'coral' });
    const bDetail = await caller.get({ id: stale.id });
    evidence.B = {
      stoppedStatus: blocked.status, stoppedMessage: blocked.lastError, spentUsd: bDetail.spentUsd,
      changes: fixed.changes, settingsChanges: bDetail.settingsChanges, voiceNow: bDetail.run.creationOptions?.voice,
    };
    console.log('[r13] B', JSON.stringify(evidence.B));
    await caller.cancel({ runId: stale.id });
  } finally {
    // Work files (narration and picture caches) stay for a run that has not finished: removing them would make a
    // continuation pay for them again.
    for (const id of created) {
      const row = await prisma.pipelineRun.findUnique({ where: { id }, select: { status: true } });
      if (row && ['completed', 'failed'].includes(row.status)) await removeRunWorkFiles(id);
    }
    await deleteForChannel(channel.id).catch(() => undefined);
    await archiveChannel(channel.id).catch(() => undefined);
    evidence.finishedAt = new Date().toISOString();
    evidence.runIds = created;
    const out = path.resolve(__dirname, '..', '..', 'docs', 'execution', 'sprint5', 'reports', 'task8-assets', 'r13-dev-verification.json');
    await fs.writeFile(out, JSON.stringify(evidence, null, 2));
    console.log(`[r13] evidence written to ${out}`);
    await prisma.$disconnect();
  }
}

main().then(() => process.exit(0), (error) => {
  console.error(error);
  process.exit(1);
});
