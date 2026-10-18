import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../../models/prisma-client';
import { adminRunsRouter } from './runs';
import { SANDBOX } from '../../../test-support/sandbox';
import * as auditRepo from '../../../models/repositories/admin-audit.repository';

// Synthetic retained-work/usage fixtures; never represented as production reply evidence.
describe.skipIf(!SANDBOX)('planner diagnostics content against a named sandbox', () => {
  const tenantId = randomUUID(), channelId = randomUUID(), runId = randomUUID(), stageId = randomUUID(), otherStageId = randomUUID(), profileId = randomUUID(), otherRunId = randomUUID();
  const secret = 'PRIVATE_FIXTURE_REPLY_OR_SESSION'; const hash = 'a'.repeat(64);
  const ops = () => adminRunsRouter.createCaller({ tenantId, userId: null, role: 'owner', identityKind: 'ops-token' });
  beforeAll(async () => {
    await prisma.tenant.create({ data: { id: tenantId, name: 'Private fixture tenant' } });
    await prisma.channel.create({ data: { id: channelId, tenantId, name: 'Fixture channel', nicheDescription: 'fixture' } });
    await prisma.channelProfileVersion.create({ data: { id: profileId, channelId, version: 1, data: {} } });
    await prisma.pipelineRun.createMany({ data: [{ id: runId, tenantId, channelId, briefText: secret, profileVersionId: profileId, status: 'needs_attention', currentStage: 'video_generation', creationOptions: { videoKind: 'long', targetDurationSec: 480, maxCostUsd: 1.5, manualRetries: { video_generation: 3 }, plannerContractRecoveryUsed: true } }, { id: otherRunId, tenantId, channelId, briefText: secret }] });
    await prisma.pipelineStage.createMany({ data: [{ id: stageId, pipelineRunId: runId, stageName: 'video_generation', status: 'failed', attemptNumber: 5, output: { recovery: { kind: 'spend_limit', providerResponseBody: secret, sessionUri: secret }, rawReply: secret, longPlanningCheckpoint: { inputHash: hash, contractVersion: 3, scenes: { '0:0': { prompt: secret, words: secret } } }, recoveryPlan: { inputHash: hash, plan: { longScenes: [secret] } }, stillsProgress: { done: 21, total: 96 } } }, { id: otherStageId, pipelineRunId: runId, stageName: 'video_generation', status: 'completed', attemptNumber: 6, output: { plan: { longScenes: [secret] } } }] });
    await prisma.usageEvent.createMany({ data: [
      ...Array.from({ length: 101 }, () => ({ tenantId, channelId, pipelineRunId: runId, stageId, agent: 'video-production-planning', provider: 'anthropic', model: 'fixture-model', inputTokens: 100, outputTokens: 200, costUsd: 0.01, metadata: { contractVersion: 3, chapterIndex: 1, sceneOffset: 0, sceneCount: 12, requestKind: 'initial', requestHash: hash, maxTokens: 8192, reusedSceneCount: 27, finishReason: 'stop', validationOutcome: 'accepted', validationError: null, recoveryStrategy: 'accept', rawReply: secret, nested: { encryptedSession: secret } } })),
      { tenantId, channelId, pipelineRunId: runId, stageId: otherStageId, agent: 'video-production-planning', provider: 'excluded-stage', model: 'excluded', costUsd: 99 },
      { tenantId, channelId, pipelineRunId: otherRunId, stageId, agent: 'video-production-planning', provider: 'excluded-run', model: 'excluded', costUsd: 99 },
    ] });
  });
  afterAll(async () => {
    await prisma.adminAuditLog.deleteMany({ where: { tenantId } }); await prisma.usageEvent.deleteMany({ where: { tenantId } });
    await prisma.pipelineStage.deleteMany({ where: { pipelineRunId: { in: [runId, otherRunId] } } }); await prisma.pipelineRun.deleteMany({ where: { tenantId } });
    await prisma.channelProfileVersion.deleteMany({ where: { channelId } }); await prisma.channel.delete({ where: { id: channelId } }); await prisma.tenant.delete({ where: { id: tenantId } });
  });
  it('returns audited bounded persisted evidence without forbidden payloads or cross-attempt/run usage', async () => {
    const result = await ops().content({ runId, kind: 'planner_diagnostics', attemptNumber: 5 });
    expect(result).toMatchObject({ kind: 'planner_diagnostics', truncated: true, content: { run: { profileVersionId: profileId, manualVideoRetries: 3, maxCostUsd: 1.5 }, checkpoint: { acceptedSceneCount: 1, sceneIds: ['0:0'], completePlanPresent: true }, recovery: { legacyUsed: true, legacyEligible: false, recoverableFailure: true }, retained: { stillsDone: 21, stillsTotal: 96 } } });
    const text = JSON.stringify(result); for (const value of [secret, 'excluded-stage', 'excluded-run', 'providerResponseBody', 'encryptedSession', 'sessionUri', '"rawReply":', '"prompt":', '"words":']) expect(text).not.toContain(value);
    const content = (result as { content: { calls: unknown[] } }).content; expect(content.calls).toHaveLength(100); expect(content.calls[0]).toMatchObject({ inputTokens: 100, outputTokens: 200, costUsd: 0.01 });
    expect(await prisma.adminAuditLog.count({ where: { targetId: runId, action: 'run.content_view' } })).toBe(1);
  });
  it('selects latest attempt by number and keeps its absent metadata unknown', async () => {
    const result = await ops().content({ runId, kind: 'planner_diagnostics' }); expect(result).toMatchObject({ content: { attemptNumber: 6, calls: [{ stageId: otherStageId, inputTokens: null, outputTokens: null, metadata: { contractVersion: null } }], checkpoint: { availability: 'not_persisted', acceptedSceneCount: null }, recovery: { legacyUsed: true } } });
    expect((await ops().get({ runId })).run.profileVersionId).toBe(profileId);
  });
  it('returns no evidence if a real audit transaction fails', async () => {
    const before = await prisma.adminAuditLog.count({ where: { targetId: runId } });
    const spy = vi.spyOn(auditRepo, 'writeAdminAudit').mockRejectedValueOnce(new Error(secret));
    try { await expect(ops().content({ runId, kind: 'planner_diagnostics', attemptNumber: 5 })).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR', message: 'Could not record the audit entry; no content returned' }); } finally { spy.mockRestore(); }
    expect(await prisma.adminAuditLog.count({ where: { targetId: runId } })).toBe(before);
  });
});
