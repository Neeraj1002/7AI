import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

vi.mock('../../../storage/r2-client', () => ({
  isR2Configured: () => true,
  getObjectText: async (key: string) =>
    JSON.stringify({
      files: [{ name: 'plan.json', key: `${key.replace('manifest.json', '')}plan.json`, contentType: 'application/json', bytes: 12 }],
      apiKey: 'planted-manifest-key',
    }),
  getPresignedDownloadUrl: async (p: { key: string; expiresInSeconds: number }) =>
    `https://signed.example.test/${p.key}?ttl=${p.expiresInSeconds}`,
}));

import { prisma } from '../../../models/prisma-client';
import { appRouter } from '../../router';
import { SANDBOX } from '../../../test-support/sandbox';
import { collectKeys, findForbiddenKeys, findForbiddenValues } from '../../../test-support/walk-keys';
import * as auditRepo from '../../../models/repositories/admin-audit.repository';

const FORBIDDEN_KEYS = ['briefText', 'intakeParsed', 'script', 'scriptText', 'transcript', 'plan', 'rationale', 'input', 'output', 'editedOutput'];
const SECRET_VALUES = ['SECRET BRIEF', 'SECRET SCRIPT', 'SECRET RATIONALE', 'SECRET PLAN', 'tok-planted'];

describe.skipIf(!SANDBOX)('admin.runs.get / admin.runs.content (sandbox database)', () => {
  const tenantId = randomUUID();
  const channelId = randomUUID();
  const ownerId = randomUUID();
  const runId = randomUUID();
  const oldRunId = randomUUID();
  const ops = () => appRouter.createCaller({ tenantId, userId: null, role: 'owner', identityKind: 'ops-token' });
  const owner = () => appRouter.createCaller({ tenantId, userId: ownerId, role: 'owner', identityKind: 'session' });
  const auditCount = (id: string) => prisma.adminAuditLog.count({ where: { targetId: id, action: 'run.content_view' } });

  beforeAll(async () => {
    await prisma.tenant.create({ data: { id: tenantId, name: 'Runs test tenant' } });
    await prisma.user.create({ data: { id: ownerId, tenantId, email: `${ownerId}@fixture.test`, role: 'owner' } });
    await prisma.channel.create({ data: { id: channelId, tenantId, name: 'Runs channel', nicheDescription: 'x' } });
    await prisma.pipelineRun.createMany({
      data: [
        {
          id: runId,
          tenantId,
          channelId,
          briefText: 'SECRET BRIEF',
          intakeParsed: { topic: 'SECRET BRIEF' },
          creationOptions: { visualSource: 'stock', formatKey: 'x' },
          status: 'failed',
          lastError: 'x'.repeat(700),
        },
        { id: oldRunId, tenantId, channelId, briefText: 'old brief', status: 'completed' },
      ],
    });
    const mk = (stageName: string, attemptNumber: number, extra: Record<string, unknown> = {}) => ({
      pipelineRunId: runId,
      stageName,
      attemptNumber,
      ...extra,
    });
    await prisma.pipelineStage.createMany({
      data: [
        mk('script_generation', 1, { status: 'completed', input: { b: 'SECRET BRIEF' }, output: { scriptText: 'SECRET SCRIPT' } }),
        mk('gate1', 1, { status: 'completed', output: { outcome: 'approve' } }),
        mk('video_generation', 1, {
          status: 'completed',
          output: { r2ManifestKey: 'runs/a1/manifest.json', plan: 'SECRET PLAN', apiToken: 'tok-planted', transcript: 'SECRET PLAN' },
        }),
        mk('video_generation', 2, { status: 'skipped', error: 'Account spend limit reached: $2.00 used of $2.00 this week. Resets Monday 00:00 UTC.' }),
        mk('video_generation', 3, { status: 'completed', output: { r2ManifestKey: 'runs/a3/manifest.json', plan: 'SECRET PLAN' } }),
        mk('video_review', 3, {
          status: 'completed',
          output: {
            verdict: 'pass',
            rationale: 'SECRET RATIONALE',
            qualityMetrics: { integratedLufs: -14.2, hasAudio: true, videoCodec: 'h264', softWarnings: ['loud', 'long shot'], nested: { x: 1 }, longText: 'z'.repeat(500) },
          },
        }),
        mk('gate2', 1, { status: 'completed', output: { outcome: 'approve' } }),
      ],
    });
    const gate1 = await prisma.pipelineStage.findFirstOrThrow({ where: { pipelineRunId: runId, stageName: 'gate1' } });
    await prisma.reviewLog.create({
      data: { tenantId, channelId, pipelineRunId: runId, stageId: gate1.id, agent: 'human', verdict: 'approve', rationale: 'SECRET RATIONALE' },
    });
    await prisma.usageEvent.createMany({
      data: [
        { tenantId, channelId, pipelineRunId: runId, agent: 'script-generation', provider: 'anthropic', model: 'm', costUsd: 0.4 },
        { tenantId, channelId, pipelineRunId: runId, agent: 'video-generation', provider: 'openai', model: 'gpt-image-1.5', costUsd: 0, metadata: { stills: 3 } },
      ],
    });
  });

  afterAll(async () => {
    await prisma.adminAuditLog.deleteMany({ where: { tenantId } });
    await prisma.usageEvent.deleteMany({ where: { tenantId } });
    await prisma.reviewLog.deleteMany({ where: { tenantId } });
    await prisma.pipelineStage.deleteMany({ where: { pipelineRunId: { in: [runId, oldRunId] } } });
    await prisma.pipelineRun.deleteMany({ where: { tenantId } });
    await prisma.channel.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
  });

  it('get returns structure only: no content keys or values, no stage bodies', async () => {
    const r = await ops().admin.runs.get({ runId });
    expect(findForbiddenKeys(r, FORBIDDEN_KEYS)).toEqual([]);
    expect(findForbiddenValues(r, SECRET_VALUES)).toEqual([]);
    expect(r.run).toMatchObject({ id: runId, tenantName: 'Runs test tenant', channelName: 'Runs channel', status: 'failed', profileVersionId: null });
    expect(r.run.lastError!.length).toBeLessThanOrEqual(503);
    expect(r.run.creationOptionKeys).toEqual(['formatKey', 'visualSource']);
  });

  it('shows the budget-skipped reason, quality metrics (scalars only), $0 usage rows, gates and bundle attempts', async () => {
    const r = await ops().admin.runs.get({ runId });
    const skipped = r.stages.find((s) => s.stageName === 'video_generation' && s.attemptNumber === 2)!;
    expect(skipped.status).toBe('skipped');
    expect(skipped.reason).toContain('Account spend limit reached');
    const review = r.stages.find((s) => s.stageName === 'video_review')!;
    expect(review.qualityMetrics).toMatchObject({ integratedLufs: -14.2, hasAudio: true, videoCodec: 'h264', softWarnings: 'loud; long shot' });
    for (const v of Object.values(review.qualityMetrics!)) {
      expect(['number', 'boolean', 'string']).toContain(typeof v);
      if (typeof v === 'string') expect(v.length).toBeLessThanOrEqual(123);
    }
    expect(review.qualityMetrics).not.toHaveProperty('nested');
    expect(review.outputKeys).toEqual(['qualityMetrics', 'rationale', 'verdict']);
    expect(r.usage.map((u) => u.zeroCost)).toEqual([false, true]);
    expect(r.usage[1].metadataKeys).toEqual(['stills']);
    expect(r.totals).toEqual({ costUsd: 0.4, events: 2, zeroCostEvents: 1 });
    expect(r.gates).toEqual([{ gate: 1, decision: 'approve', at: expect.any(String) }]);
    expect(r.bundle.attempts).toEqual([1, 3]);
    expect(collectKeys(r).some((k) => k.key === 'decidedByUserId')).toBe(false);
  });

  it('an old run without the newer fields returns nulls and empty arrays, not an error', async () => {
    const r = await ops().admin.runs.get({ runId: oldRunId });
    expect(r.stages).toEqual([]);
    expect(r.usage).toEqual([]);
    expect(r.gates).toEqual([]);
    expect(r.bundle.attempts).toEqual([]);
    expect(r.run.lastError).toBeNull();
    expect(r.run.creationOptionKeys).toEqual([]);
    expect(r.totals).toEqual({ costUsd: 0, events: 0, zeroCostEvents: 0 });
  });

  it('an owner session is FORBIDDEN on both procedures; an unknown run is NOT_FOUND (no audit row)', async () => {
    await expect(owner().admin.runs.get({ runId })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(owner().admin.runs.content({ runId, kind: 'brief' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const unknown = randomUUID();
    await expect(ops().admin.runs.get({ runId: unknown })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(ops().admin.runs.content({ runId: unknown, kind: 'brief' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await auditCount(unknown)).toBe(0);
    expect(await auditCount(runId)).toBe(0);
  });

  it('content writes exactly one audit row per call and returns the brief', async () => {
    const res = await ops().admin.runs.content({ runId, kind: 'brief' });
    expect(res.kind).toBe('brief');
    expect(JSON.stringify(res)).toContain('SECRET BRIEF');
    expect(await auditCount(runId)).toBe(1);
    const row = await prisma.adminAuditLog.findFirstOrThrow({ where: { targetId: runId, action: 'run.content_view' } });
    expect(row).toMatchObject({ actorKind: 'ops-token', targetType: 'run', tenantId, after: { kind: 'brief' } });
    await ops().admin.runs.content({ runId, kind: 'brief' });
    expect(await auditCount(runId)).toBe(2);
  });

  it('content redacts token-like keys from a stage output', async () => {
    const res = await ops().admin.runs.content({ runId, kind: 'stage_output', stageName: 'video_generation', attemptNumber: 1 });
    expect(JSON.stringify(res)).toContain('SECRET PLAN');
    expect(JSON.stringify(res)).not.toContain('tok-planted');
    expect(findForbiddenKeys(res, ['apiToken'])).toEqual([]);
  });

  it('bundle_manifest redacts keys and bundle_file returns a short-lived presigned URL; both audited', async () => {
    const before = await auditCount(runId);
    const manifest = await ops().admin.runs.content({ runId, kind: 'bundle_manifest' });
    expect(manifest).toMatchObject({ available: true, attemptNumber: 3 });
    expect(JSON.stringify(manifest)).not.toContain('planted-manifest-key');
    const file = await ops().admin.runs.content({ runId, kind: 'bundle_file', file: 'plan.json', attemptNumber: 1 });
    expect(file).toMatchObject({ available: true, file: 'plan.json', attemptNumber: 1 });
    expect((file as { url: string }).url).toContain('ttl=600');
    await expect(ops().admin.runs.content({ runId, kind: 'bundle_file', file: 'nope.mp4' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await auditCount(runId)).toBe(before + 3);
  });

  it('missing parameters are BAD_REQUEST before anything is audited', async () => {
    const before = await auditCount(runId);
    await expect(ops().admin.runs.content({ runId, kind: 'stage_output' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(ops().admin.runs.content({ runId, kind: 'bundle_file' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(await auditCount(runId)).toBe(before);
  });

  it('returns NO content when the audit insert fails', async () => {
    const before = await auditCount(runId);
    const spy = vi.spyOn(auditRepo, 'writeAdminAudit').mockRejectedValueOnce(new Error('audit down'));
    try {
      await expect(ops().admin.runs.content({ runId, kind: 'brief' })).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    } finally {
      spy.mockRestore();
    }
    expect(await auditCount(runId)).toBe(before);
  });
});
