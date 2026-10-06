// Admin Sprint 1 (R8) - the fixture itself (ids and seeding), shared by
// scripts/seed-admin-fixture.ts and the admin tests. It reproduces the tricky cases found on preview
// on 2026-10-05: an override equal to the pool (F9), a pool already spent, $0 cost rows, an old
// YouTube credential, stale gates, an untriaged bug backlog and a run with three attempts. Every
// value is an obvious fake; no real token or credential appears anywhere.
//
// Callers MUST have checked isSandboxDatabase() first (the script does, and the tests are skipped
// outside a sandbox): seeding does a clean re-seed of the fixture rows (found by their fixed ids).

import { prisma } from '../models/prisma-client';

const DAY = 86_400_000;
const HOUR = 3_600_000;

// Fixed, valid v4-shaped UUIDs: <prefix>-0000-4000-8000-<12 digit counter>.
const fid = (prefix: string, n: number) => `${prefix}-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const IDS = {
  tenantA: fid('a0000001', 1),
  tenantB: fid('a0000001', 2),
  tenantC: fid('a0000001', 3),
  founder: fid('d0000001', 1),
  ownerB: fid('d0000001', 2),
  ownerC: fid('d0000001', 3),
  chX: fid('c0000001', 1), // tenant A, override $2.00 (= the pool)
  chY: fid('c0000001', 2), // tenant A, default share (the F9 victim)
  chSample1: fid('c0000001', 3),
  chSample2: fid('c0000001', 4),
  chB: fid('c0000001', 5),
  chC: fid('c0000001', 6),
  runMulti: fid('e0000001', 1), // three attempts
  runOld: fid('e0000001', 2), // predates qualityMetrics / bundles / usage
  runNeedsAttention: fid('e0000001', 3),
  runGate2: fid('e0000001', 4),
  runPending: fid('e0000001', 5),
  runRunning: fid('e0000001', 6),
  runGate1: fid('e0000001', 7),
  runCompletedB: fid('e0000001', 8),
  runFailedC: fid('e0000001', 9),
};
const TENANT_IDS = [IDS.tenantA, IDS.tenantB, IDS.tenantC];

export async function wipeAdminFixture(): Promise<void> {
  const where = { tenantId: { in: TENANT_IDS } };
  await prisma.adminAuditLog.deleteMany({ where });
  await prisma.usageEvent.deleteMany({ where });
  await prisma.reviewLog.deleteMany({ where });
  await prisma.pipelineStage.deleteMany({ where: { pipelineRun: where } });
  await prisma.pipelineRun.deleteMany({ where });
  await prisma.agentCredential.deleteMany({ where: { channel: where } });
  await prisma.channel.deleteMany({ where });
  await prisma.agentQuota.deleteMany({ where });
  await prisma.user.deleteMany({ where });
  await prisma.tenant.deleteMany({ where: { id: { in: TENANT_IDS } } });
  await prisma.bugReport.deleteMany({ where: { id: { in: Array.from({ length: 8 }, (_, i) => fid('f0000001', i + 1)) } } });
}

async function seedRows(): Promise<void> {
  const now = Date.now();
  const ago = (ms: number) => new Date(now - ms);

  await prisma.tenant.createMany({
    data: [
      { id: IDS.tenantA, name: 'Fixture A (F9: override equals the pool)' },
      { id: IDS.tenantB, name: 'Fixture B (healthy)' },
      { id: IDS.tenantC, name: 'Fixture C (pool already spent)' },
    ],
  });
  await prisma.user.createMany({
    data: [
      { id: IDS.founder, tenantId: IDS.tenantA, email: 'founder@fixture.test', name: 'Fixture Founder', role: 'owner', isPlatformAdmin: true },
      { id: IDS.ownerB, tenantId: IDS.tenantB, email: 'owner-b@fixture.test', name: 'Fixture Owner B', role: 'owner' },
      { id: IDS.ownerC, tenantId: IDS.tenantC, email: 'owner-c@fixture.test', name: 'Fixture Owner C', role: 'owner' },
    ],
  });
  await prisma.agentQuota.createMany({
    data: [
      { tenantId: IDS.tenantA, platform: 'youtube', budgetCeilingUsd: 2 },
      { tenantId: IDS.tenantB, platform: 'youtube', budgetCeilingUsd: 20 },
      { tenantId: IDS.tenantC, platform: 'youtube', budgetCeilingUsd: 2 },
    ],
  });
  const niche = 'Fixture niche description';
  await prisma.channel.createMany({
    data: [
      { id: IDS.chX, tenantId: IDS.tenantA, name: 'Fixture Notebook', nicheDescription: niche, budgetOverrideUsd: 2, ownerUserId: IDS.founder },
      { id: IDS.chY, tenantId: IDS.tenantA, name: 'Fixture Underdogs', nicheDescription: niche, ownerUserId: IDS.founder },
      { id: IDS.chSample1, tenantId: IDS.tenantA, name: 'Fixture Sample 1', nicheDescription: niche, isActive: false },
      { id: IDS.chSample2, tenantId: IDS.tenantA, name: 'Fixture Sample 2', nicheDescription: niche, isActive: false },
      { id: IDS.chB, tenantId: IDS.tenantB, name: 'Fixture Healthy Channel', nicheDescription: niche, ownerUserId: IDS.ownerB },
      { id: IDS.chC, tenantId: IDS.tenantC, name: 'Fixture Spent Channel', nicheDescription: niche, ownerUserId: IDS.ownerC },
    ],
  });
  // An old credential (8 days: past the 6-day rule) on A's channel X, a fresh one on B.
  await prisma.agentCredential.createMany({
    data: [
      { channelId: IDS.chX, platform: 'youtube', refreshTokenEncrypted: 'fixture-not-a-token', createdAt: ago(20 * DAY), updatedAt: ago(8 * DAY) },
      { channelId: IDS.chB, platform: 'youtube', refreshTokenEncrypted: 'fixture-not-a-token', createdAt: ago(1 * DAY), updatedAt: ago(1 * DAY) },
    ],
  });

  const run = (
    id: string,
    tenantId: string,
    channelId: string,
    status: string,
    age: number,
    extra: Record<string, unknown> = {},
  ) => ({
    id,
    tenantId,
    channelId,
    status,
    briefText: `Fixture brief for ${id.slice(0, 8)}`,
    createdAt: ago(age),
    updatedAt: ago(age),
    ...extra,
  });
  await prisma.pipelineRun.createMany({
    data: [
      run(IDS.runMulti, IDS.tenantA, IDS.chX, 'paused_gate2', 3 * HOUR, {
        currentStage: 'gate2',
        creationOptions: { visualSource: 'stock', voice: 'fixture-voice' },
      }),
      run(IDS.runOld, IDS.tenantA, IDS.chX, 'completed', 40 * DAY, { completedAt: ago(40 * DAY) }),
      run(IDS.runNeedsAttention, IDS.tenantA, IDS.chY, 'needs_attention', 2 * DAY, {
        currentStage: 'script_generation',
        lastError: 'Account spend limit reached: $2.00 used of $2.00 this week.',
      }),
      run(IDS.runGate2, IDS.tenantA, IDS.chX, 'paused_gate2', 1 * DAY, { currentStage: 'gate2' }),
      run(IDS.runPending, IDS.tenantB, IDS.chB, 'pending', 5 * 60_000),
      run(IDS.runRunning, IDS.tenantB, IDS.chB, 'running', 10 * 60_000, { currentStage: 'video_generation' }),
      run(IDS.runGate1, IDS.tenantB, IDS.chB, 'paused_gate1', 30 * 60_000, { currentStage: 'gate1' }),
      run(IDS.runCompletedB, IDS.tenantB, IDS.chB, 'completed', 2 * HOUR, { completedAt: ago(1 * HOUR) }),
      run(IDS.runFailedC, IDS.tenantC, IDS.chC, 'failed', 4 * HOUR, { lastError: 'Fixture failure: provider timeout' }),
    ],
  });

  // The multi-attempt run: attempt 1 and 3 have debug bundles, attempt 2 was skipped for budget
  // (reason in the stage error column), video_review carries qualityMetrics.
  const stage = (stageName: string, attemptNumber: number, extra: Record<string, unknown> = {}) => ({
    pipelineRunId: IDS.runMulti,
    stageName,
    attemptNumber,
    status: 'completed',
    startedAt: ago(3 * HOUR),
    completedAt: ago(3 * HOUR - 60_000),
    ...extra,
  });
  await prisma.pipelineStage.createMany({
    data: [
      stage('intake', 1, { output: { topic: 'fixture topic' } }),
      stage('script_generation', 1, { output: { scriptText: 'Fixture script text' } }),
      stage('script_review', 1, { output: { score: 8 } }),
      stage('gate1', 1, { output: { outcome: 'approve' } }),
      stage('video_generation', 1, { output: { r2ManifestKey: 'fixture/run-multi/1/manifest.json', plan: 'fixture plan' } }),
      stage('video_generation', 2, {
        status: 'skipped',
        error: 'Account spend limit reached: $2.00 used of $2.00 this week. Resets Monday 00:00 UTC.',
      }),
      stage('video_generation', 3, { output: { r2ManifestKey: 'fixture/run-multi/3/manifest.json', plan: 'fixture plan' } }),
      stage('video_review', 3, {
        output: {
          verdict: 'pass',
          rationale: 'Fixture rationale',
          qualityMetrics: {
            integratedLufs: -14.1,
            truePeakDb: -1.6,
            width: 1080,
            height: 1920,
            fps: 30,
            videoCodec: 'h264',
            hasAudio: true,
            captionsExpected: true,
            captionsDetected: true,
            softWarnings: [],
          },
        },
      }),
      stage('gate2', 1, { status: 'running', completedAt: null }),
    ],
  });
  const gate1 = await prisma.pipelineStage.findFirstOrThrow({ where: { pipelineRunId: IDS.runMulti, stageName: 'gate1' } });
  await prisma.reviewLog.create({
    data: { tenantId: IDS.tenantA, channelId: IDS.chX, pipelineRunId: IDS.runMulti, stageId: gate1.id, agent: 'human', verdict: 'approve', rationale: 'Approved as-is' },
  });

  // Usage: this week's spend for each tenant, $0 rows that should not be $0, and last week's row.
  const u = (tenantId: string, channelId: string, agent: string, provider: string, model: string, costUsd: number, extra: Record<string, unknown> = {}) => ({
    tenantId,
    channelId,
    agent,
    provider,
    model,
    costUsd,
    createdAt: ago(1 * HOUR),
    ...extra,
  });
  await prisma.usageEvent.createMany({
    data: [
      u(IDS.tenantA, IDS.chX, 'script-generation', 'anthropic', 'claude-sonnet-5', 0.4, { pipelineRunId: IDS.runMulti }),
      u(IDS.tenantA, IDS.chX, 'video-generation', 'openai', 'tts-1', 0.8975, { pipelineRunId: IDS.runMulti }),
      // $0 rows (cost recorded wrong): image generation and an unknown provider
      u(IDS.tenantA, IDS.chX, 'video-generation', 'openai', 'gpt-image-1.5', 0, { pipelineRunId: IDS.runMulti, metadata: { stillCount: 6, promptCount: 6 } }),
      u(IDS.tenantA, IDS.chX, 'script-review', 'unknown', 'unknown', 0, { metadata: { note: 'fixture unknown row' } }),
      // a free provider legitimately at $0 (must not count as a gap in the overview)
      u(IDS.tenantA, IDS.chX, 'video-generation', 'pexels', 'stock-search', 0, { pipelineRunId: IDS.runMulti }),
      // last week: must not count toward this week's budget
      u(IDS.tenantA, IDS.chX, 'script-generation', 'anthropic', 'claude-sonnet-5', 5, { createdAt: ago(9 * DAY) }),
      u(IDS.tenantB, IDS.chB, 'script-generation', 'anthropic', 'claude-sonnet-5', 1.25, { pipelineRunId: IDS.runCompletedB }),
      u(IDS.tenantB, IDS.chB, 'video-generation', 'openai', 'tts-1', 0.5, { pipelineRunId: IDS.runCompletedB }),
      // C: spend above the pool
      u(IDS.tenantC, IDS.chC, 'video-generation', 'openai', 'tts-1', 2.5, { pipelineRunId: IDS.runFailedC }),
    ],
  });

  // Bug reports: 4 untriaged, the rest triaged; one awaiting verification with a note; one
  // naming the multi-attempt run.
  const bug = (n: number, extra: Record<string, unknown> = {}) => ({
    id: fid('f0000001', n),
    description: `Fixture bug report ${n}`,
    reportType: 'bug',
    priority: 'annoying',
    createdAt: ago((9 - n) * HOUR),
    ...extra,
  });
  await prisma.bugReport.createMany({
    data: [
      bug(1, { screenContext: '/channels' }),
      bug(2, { screenContext: `/run/${IDS.runMulti}`, runId: IDS.runMulti, priority: 'blocker' }),
      bug(3, { screenContext: '/dashboard' }),
      bug(4, { reportType: 'feedback', priority: null, screenContext: '/settings' }),
      bug(5, { area: 'BE', status: 'awaiting_verification', triageNote: 'Fixed in PR 99; verify on preview', priority: 'blocker' }),
      bug(6, { area: 'FE', status: 'fixed', priority: 'minor' }),
      bug(7, { area: 'BE', status: 'wontfix', priority: 'minor' }),
      bug(8, { area: 'APP', priority: 'annoying', screenContext: '/run/3f2b8c1e' }),
    ],
  });
}

// Clean re-seed: delete every fixture row, then recreate them.
export async function seedAdminFixture(): Promise<void> {
  await wipeAdminFixture();
  await seedRows();
}
