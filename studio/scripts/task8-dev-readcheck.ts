// Sprint 5 Task 8: no-spend check on the local dev database (sevenai_dev), after main's migrations were applied.
//   npx tsx scripts/task8-dev-readcheck.ts
// 1. runs.listPage and notifications.listPage: totals and nextCursor.
// 2. runs.updateSettings on a stopped run of a throwaway channel (created and archived here; visibility only, so the
//    preflight touches no provider): the history line shown by runs.get.
// It refuses to run against any database other than sevenai_dev, never starts the server, spends nothing.
process.env.YOUTUBE_STUB = '1';
process.env.TELEGRAM_BOT_TOKEN = '';
process.env.PREFLIGHT_DISABLED = '';

import fs from 'node:fs/promises';
import path from 'node:path';

async function main() {
  const dbName = new URL(process.env.DATABASE_URL ?? 'x://y/z').pathname.slice(1);
  const { prisma } = await import('../src/models/prisma-client');
  const { MVP_TENANT_ID } = await import('../src/types');
  const { runsRouter } = await import('../src/api/routers/runs');
  const { notificationsRouter } = await import('../src/api/routers/notifications');
  const { createRun } = await import('../src/run-pipeline/state-machine');
  const { upsertForChannel, deleteForChannel } = await import('../src/models/repositories/agent-credential.repository');
  const { sumUsageCostForRun } = await import('../src/models/repositories/usage-event.repository');
  const actual = (await prisma.$queryRaw<{ current_database: string }[]>`SELECT current_database()`)[0].current_database;
  if (actual !== 'sevenai_dev') throw new Error(`Refusing to run on database '${actual}' (expected sevenai_dev)`);

  const evidence: Record<string, unknown> = { database: actual, at: new Date().toISOString() };
  const ctx = { tenantId: MVP_TENANT_ID, userId: null, role: 'owner', identityKind: 'session' } as never;
  const runs = runsRouter.createCaller(ctx);

  // ---- 1. list pages
  const totalRuns = await prisma.pipelineRun.count({ where: { tenantId: MVP_TENANT_ID } });
  const first = await runs.listPage({});
  const small = await runs.listPage({ limit: 30 });
  const failed = await runs.listPage({ statuses: ['failed'], limit: 10 });
  let walked = 0;
  let pages = 0;
  let cursor: string | undefined;
  do {
    const page = await runs.listPage({ limit: 25, cursor });
    walked += page.items.length;
    pages += 1;
    cursor = page.nextCursor ?? undefined;
  } while (cursor && pages < 100);
  evidence.runsListPage = {
    tenantRunsInDatabase: totalRuns,
    default: { items: first.items.length, total: first.total, nextCursor: first.nextCursor },
    limit30: { items: small.items.length, total: small.total, nextCursor: small.nextCursor },
    failedLimit10: { items: failed.items.length, total: failed.total, nextCursor: failed.nextCursor, endReasons: [...new Set(failed.items.map((r) => r.endReason))] },
    walkedWithLimit25: { pages, runsSeen: walked },
  };
  const user = await prisma.notification
    .groupBy({ by: ['userId'], _count: { _all: true }, orderBy: { _count: { userId: 'desc' } }, take: 1 })
    .then((rows) => rows[0]);
  if (user) {
    const n = notificationsRouter.createCaller({ tenantId: MVP_TENANT_ID, userId: user.userId, role: 'owner', identityKind: 'session' } as never);
    const oldList = await n.list();
    const np = await n.listPage({});
    const np20 = await n.listPage({ limit: 20 });
    let nWalked = 0;
    let nPages = 0;
    let nCursor: string | undefined;
    do {
      const page = await n.listPage({ limit: 40, cursor: nCursor });
      nWalked += page.items.length;
      nPages += 1;
      nCursor = page.nextCursor ?? undefined;
    } while (nCursor && nPages < 100);
    evidence.notificationsListPage = {
      userWithMostRows: 'one user (id withheld)', rowsForUser: user._count._all,
      oldListReturned: oldList.length,
      default: { items: np.items.length, total: np.total, nextCursor: np.nextCursor },
      limit20: { items: np20.items.length, total: np20.total, nextCursor: np20.nextCursor },
      walkedWithLimit40: { pages: nPages, rowsSeen: nWalked },
    };
  } else {
    evidence.notificationsListPage = 'no notification rows in the database';
  }
  console.log(JSON.stringify({ runsListPage: evidence.runsListPage, notificationsListPage: evidence.notificationsListPage }));

  // ---- 2. updateSettings on a stopped run (throwaway channel, nothing spent)
  const channel = await prisma.channel.create({
    data: { tenantId: MVP_TENANT_ID, platform: 'youtube', name: 'Task8 settings check throwaway', nicheDescription: 'Sprint 5 Task 8 dev check; archived after the check' },
  });
  await upsertForChannel(channel.id, 'youtube', 'throwaway-token-never-used');
  let runId: string | undefined;
  try {
    const run = await createRun({ tenantId: MVP_TENANT_ID, channelId: channel.id, briefText: 'Settings check only; never run.', creationOptions: { videoKind: 'long', targetDurationSec: 120 } });
    runId = run.id;
    await prisma.pipelineRun.update({ where: { id: runId }, data: { status: 'needs_attention', currentStage: 'publishing', lastError: 'Stopped for the settings check (no stage was run)' } });
    const before = await runs.get({ id: runId });
    const result = await runs.updateSettings({ runId, privacyStatus: 'unlisted' });
    const after = await runs.get({ id: runId });
    evidence.updateSettings = {
      stoppedStatus: before.run.status, stoppedStage: before.run.currentStage, settingsChangesBefore: before.settingsChanges.length,
      returnedChanges: result.changes, statusAfter: after.run.status, settingsChangesAfter: after.settingsChanges,
      storedPrivacyStatus: after.run.creationOptions?.privacyStatus ?? null, spentUsd: Number((await sumUsageCostForRun(runId)).toFixed(4)),
    };
    console.log(JSON.stringify(evidence.updateSettings));
  } finally {
    if (runId) await runs.cancel({ runId }).catch(() => undefined);
    await deleteForChannel(channel.id).catch(() => undefined);
    await prisma.channel.update({ where: { id: channel.id }, data: { isActive: false } });
    const out = path.resolve(__dirname, '..', '..', 'docs', 'execution', 'sprint5', 'reports', 'task8-assets', 'dev-readcheck.json');
    await fs.writeFile(out, JSON.stringify(evidence, null, 2));
    await prisma.$disconnect();
    console.log(`evidence written to ${out}`);
  }
  void dbName;
}

main().then(() => process.exit(0), (error) => {
  console.error(error);
  process.exit(1);
});
