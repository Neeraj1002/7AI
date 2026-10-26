// Sprint 6 Task 1 (PR A): the end-to-end check of packaging at Gate 2 against a SCRATCH database, with a real approved
// script, the real LLM Registry and the real image model, and YouTube stubbed (YOUTUBE_STUB=1; nothing leaves the
// machine except the model calls). It walks the whole path: Gate 2 opens and makes the packages, the app's API shows
// them, the founder's choice (and a refused edit) is saved, a restart finds the same packages without paying again, Gate
// 2 is approved, and publishing uses the chosen title and file.
//
//   1. npx tsx scripts/packaging-gate2-check.ts --create-db sevenai_task1a_20261026_test      (creates the empty database)
//   2. set DATABASE_URL to that database, then: npx prisma migrate deploy
//   3. npx tsx scripts/packaging-gate2-check.ts --live                                         (DATABASE_URL must end _test or _sandbox)
//   4. npx tsx scripts/packaging-gate2-check.ts --drop-db sevenai_task1a_20261026_test       (removes it; names must end _test)
//
// Spends about $0.10 of the task's $2.00 live-check ceiling; this script's own cap is below. Never touches sevenai_dev or
// sevenai_preview: it refuses any database whose name does not end in _test or _sandbox.
process.env.YOUTUBE_STUB = '1';
process.env.PREFLIGHT_DISABLED = '1';

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const MAX_SPEND_USD = 0.4;
const FIXED = {
  tenant: '6a000000-0000-4000-8000-000000000001',
  tenantOther: '6a000000-0000-4000-8000-000000000002',
  user: '6a000000-0000-4000-8000-000000000011',
  userOther: '6a000000-0000-4000-8000-000000000012',
  channel: '6a000000-0000-4000-8000-000000000021',
  run: '6a000000-0000-4000-8000-000000000031',
  profile: '6a000000-0000-4000-8000-000000000041',
};

function argAfter(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function adminSql(statement: string): Promise<void> {
  const { PrismaClient } = await import('@prisma/client');
  const client = new PrismaClient();
  try {
    await client.$executeRawUnsafe(statement);
  } finally {
    await client.$disconnect();
  }
}

async function main() {
  const createDb = argAfter('--create-db');
  const dropDb = argAfter('--drop-db');
  if (createDb || dropDb) {
    const name = (createDb ?? dropDb)!;
    if (!/^sevenai_[a-z0-9_]+_test$/.test(name)) throw new Error('database names must look like sevenai_..._test');
    await import('../src/config/env');
    await adminSql(createDb ? `CREATE DATABASE "${name}"` : `DROP DATABASE IF EXISTS "${name}"`);
    console.log(`${createDb ? 'created' : 'dropped'} database ${name}`);
    return;
  }
  if (!process.argv.includes('--live')) {
    console.log('dry run: pass --live to run the check (see the header for the steps).');
    return;
  }

  await import('../src/config/env');
  const { prisma } = await import('../src/models/prisma-client');
  const { isSandboxDatabase, databaseName } = await import('../src/test-support/sandbox');
  if (!isSandboxDatabase()) throw new Error(`Refusing: DATABASE_URL names "${databaseName() || '(none)'}", which does not end in _test or _sandbox.`);
  const { DATA_DIR } = await import('../src/config/paths');
  const { runsRouter } = await import('../src/api/routers/runs');
  const { ensurePackagingForGate2, packagingFieldOf, readPackaging } = await import('../src/run-pipeline/packaging-stage');
  const { runPublishingStage } = await import('../src/run-pipeline/state-machine');
  const { completeStage, listStagesForRun } = await import('../src/models/repositories/pipeline-stage.repository');
  const { findPipelineRunById, updatePipelineRun } = await import('../src/models/repositories/pipeline-run.repository');
  const { findChannelById } = await import('../src/models/repositories/channel.repository');
  const { thumbnailsDir } = await import('../src/packaging/build');
  const script = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'packaging', 'fixtures', 'eiffel-script.json'), 'utf8')) as {
    scriptText: string;
    chapters: Array<{ title: string; text: string }>;
  };

  // ---- seed (clean re-seed of this script's own rows) ----
  const { tenant, tenantOther, user, userOther, channel, run, profile } = FIXED;
  await prisma.usageEvent.deleteMany({ where: { pipelineRunId: run } });
  await prisma.reviewLog.deleteMany({ where: { pipelineRunId: run } });
  await prisma.pipelineStage.deleteMany({ where: { pipelineRunId: run } });
  await prisma.pipelineRun.deleteMany({ where: { id: run } });
  await prisma.channel.deleteMany({ where: { id: channel } });
  await prisma.channelProfileVersion.deleteMany({ where: { id: profile } });
  await prisma.agentQuota.deleteMany({ where: { tenantId: { in: [tenant, tenantOther] } } });
  await prisma.user.deleteMany({ where: { id: { in: [user, userOther] } } });
  await prisma.tenant.deleteMany({ where: { id: { in: [tenant, tenantOther] } } });
  await prisma.tenant.createMany({ data: [{ id: tenant, name: 'Task1A check tenant' }, { id: tenantOther, name: 'Task1A other tenant' }] });
  await prisma.user.createMany({
    data: [
      { id: user, tenantId: tenant, email: 'owner@task1a.test', name: 'Task1A Owner', role: 'owner' },
      { id: userOther, tenantId: tenantOther, email: 'other@task1a.test', name: 'Task1A Other', role: 'owner' },
    ],
  });
  await prisma.agentQuota.create({ data: { tenantId: tenant, platform: 'youtube', budgetCeilingUsd: 20 } });
  await prisma.channel.create({ data: { id: channel, tenantId: tenant, name: 'Task1A check channel', nicheDescription: 'check', ownerUserId: user } });
  await prisma.channelProfileVersion.create({
    data: {
      id: profile,
      channelId: channel,
      version: 1,
      data: {
        visual: { stylePrompt: 'Cinematic documentary still, 35mm look, soft natural light, muted natural colours, never glossy.' },
        packaging: { titleGuidance: 'Plain, specific and honest. One question the video answers. At most 60 characters, sentence case, no emoji.' },
      },
    },
  });
  fs.rmSync(thumbnailsDir(run), { recursive: true, force: true });
  const videoDir = path.join(DATA_DIR, 'videos', run);
  fs.mkdirSync(videoDir, { recursive: true });
  const videoPath = path.join(videoDir, 'check.mp4');
  execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=24', '-t', '3', '-pix_fmt', 'yuv420p', videoPath], { stdio: 'ignore' });
  await prisma.pipelineRun.create({
    data: {
      id: run, tenantId: tenant, channelId: channel, profileVersionId: profile, status: 'paused_gate2', currentStage: 'gate2',
      briefText: 'The Eiffel Tower, 1889: why it was nearly torn down.',
      creationOptions: { videoKind: 'long', maxCostUsd: 2, visualSource: 'ai-stills' },
    },
  });
  const mk = (stageName: string, output: object, status = 'completed', input: object = {}) =>
    prisma.pipelineStage.create({ data: { pipelineRunId: run, stageName, status, attemptNumber: 1, input, output, startedAt: new Date(), ...(status === 'completed' && { completedAt: new Date() }) } });
  await mk('intake', { topic: 'Eiffel' });
  await mk('script_generation', { scriptText: script.scriptText, hashtags: ['eiffeltower'] });
  await mk('gate1', { outcome: 'approve', sanctionedScriptText: script.scriptText, chapters: script.chapters });
  await mk('video_generation', {
    videoPath, durationSeconds: 125, plan: { visualSource: 'ai-stills' },
    chapterTimings: script.chapters.map((c, i) => ({ title: c.title, startSec: i * 31, endSec: (i + 1) * 31 })),
  });
  await mk('video_review', { verdict: 'pass', rationale: 'check' });
  const gate = await mk('gate2', {}, 'running', { videoPath });
  const spent = async () => Number((await prisma.usageEvent.aggregate({ where: { pipelineRunId: run }, _sum: { costUsd: true } }))._sum.costUsd ?? 0);
  const usageRows = () => prisma.usageEvent.count({ where: { pipelineRunId: run } });

  // ---- 1. Gate 2 opens: packaging is made ----
  const runRow = (await findPipelineRunById(run))!;
  const channelRow = (await findChannelById(channel))!;
  const gateRow = { id: gate.id, output: null as unknown };
  const made = await ensurePackagingForGate2({
    run: runRow, channel: channelRow, gateRow, scriptText: script.scriptText, chapters: script.chapters,
    videoGenOutput: (await listStagesForRun(run)).find((s) => s.stageName === 'video_generation')!.output,
  });
  console.log(`1. packaging: ${made?.status}, ${made?.packages.length} packages, text $${made?.textCostUsd.toFixed(4)}, images $${made?.imageCostUsd.toFixed(4)}, ledger $${(await spent()).toFixed(4)} in ${await usageRows()} usage rows`);
  if ((await spent()) > MAX_SPEND_USD) throw new Error(`spend cap $${MAX_SPEND_USD} passed`);
  for (const p of made?.packages ?? []) console.log(`   ${p.id} [${p.device}] "${p.title}" | ${p.lettering.words} | answered: ${p.answeredAt.label}`);
  if (!made || made.status !== 'ready') throw new Error('packaging was not ready');

  // ---- 2. The app's API shows them (owner), and another tenant is refused ----
  const owner = runsRouter.createCaller({ tenantId: tenant, userId: user, role: 'owner' } as never);
  const view = await owner.packaging({ runId: run });
  console.log(`2. runs.packaging: pending=${view.pending}, ${view.view?.packages.length} packages, first url ${view.view?.packages[0].imageUrls.full.slice(0, 60)}…`);
  const other = runsRouter.createCaller({ tenantId: tenantOther, userId: userOther, role: 'owner' } as never);
  await other.packaging({ runId: run }).then(() => { throw new Error('another tenant could read the packaging'); }, (e: { code?: string }) => console.log(`   another tenant: ${e.code}`));

  // ---- 3. The choice: a refused edit, then a saved one ----
  const first = view.view!.packages[0];
  await owner.choosePackage({ runId: run, packageId: first.id, editedTitle: 'Why did 99 engineers nearly lose the tower?' }).then(
    () => { throw new Error('an unsupported edited title was accepted'); },
    (e: { code?: string; message?: string }) => console.log(`3a. unsupported edit refused (${e.code}): ${e.message?.slice(0, 110)}`),
  );
  const chosenTitle = 'Why was the Eiffel Tower nearly torn down?';
  const saved = await owner.choosePackage({ runId: run, packageId: first.id, editedTitle: chosenTitle });
  console.log(`3b. choice saved: ${JSON.stringify(saved.choice)}`);

  // ---- 4. Restart: the same gate row, no new spend ----
  const before = { rows: await usageRows(), spent: await spent() };
  const reopened = await ensurePackagingForGate2({
    run: (await findPipelineRunById(run))!, channel: channelRow,
    gateRow: (await listStagesForRun(run)).find((s) => s.id === gate.id)! as never,
    scriptText: script.scriptText, chapters: script.chapters, videoGenOutput: null,
  });
  const after = { rows: await usageRows(), spent: await spent() };
  console.log(`4. after a restart: same packages=${reopened?.packages.length === made.packages.length}, choice kept=${reopened?.choice?.packageId === first.id && reopened?.choice?.title === chosenTitle}, new usage rows=${after.rows - before.rows}`);
  if (after.rows !== before.rows) throw new Error('a restart paid again');

  // ---- 5. Gate 2 is approved; publishing uses the chosen title and file ----
  await completeStage(gate.id, { outcome: 'approve', privacyStatus: 'private', ...(await packagingFieldOf(run, gate.id)) });
  await updatePipelineRun(run, { status: 'running', currentStage: 'publishing' });
  const published = await runPublishingStage(run);
  const pub = (await listStagesForRun(run)).filter((s) => s.stageName === 'publishing').at(-1);
  const out = pub?.output as { metadata?: { title?: string }; coverFrameSet?: boolean; coverFrameMessage?: string; thumbnail?: unknown; youtubeVideoId?: string } | null;
  console.log(`5. publishing: run ${published.status}/${published.currentStage}, title "${out?.metadata?.title}", titleIsTheChosenOne=${out?.metadata?.title === chosenTitle}`);
  console.log(`   coverFrameSet=${out?.coverFrameSet}, thumbnail=${JSON.stringify(out?.thumbnail)}, message=${out?.coverFrameMessage ?? '(none)'}`);
  const file = path.join(thumbnailsDir(run), `${first.id}-full.jpg`);
  console.log(`   chosen file on disk: ${fs.existsSync(file)} (${fs.existsSync(file) ? fs.statSync(file).size : 0} bytes)`);
  console.log(`total spent on this run: $${(await spent()).toFixed(4)} (cap $${MAX_SPEND_USD})`);
  void readPackaging;
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
