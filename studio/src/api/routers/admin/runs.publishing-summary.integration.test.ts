import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../../models/prisma-client';
import { adminRunsRouter } from './runs';
import { SANDBOX } from '../../../test-support/sandbox';
import { sanitizeStructure } from '../../inspect-run-client';

describe.skipIf(!SANDBOX)('safe publishing-summary Admin adapter in a named sandbox', () => {
  const tenantId = randomUUID(), channelId = randomUUID(), ownerId = randomUUID(), adminId = randomUUID();
  const activeId = randomUUID(), legacyId = randomUUID(), invalidId = randomUUID();
  const secret = 'PRIVATE_PUBLISHING_RECEIPT';
  const ops = () => adminRunsRouter.createCaller({ tenantId, userId: null, role: 'owner', identityKind: 'ops-token' });
  const session = (userId: string) => adminRunsRouter.createCaller({ tenantId, userId, role: 'owner', identityKind: 'session' });
  const receipt = {
    version: 1, revision: 4, phase: 'uploading', channelId,
    fileSha256: secret, fileSize: 12, gate2Id: secret, metadataHash: secret,
    metadata: { title: secret, description: secret, tags: [secret], coverFrameTimestampRatio: 0.2 },
    ownerEpoch: 2, ownerToken: secret, leaseUntil: '2100-01-01T00:00:00.000Z',
    sessionCiphertext: secret, sessionUri: `https://www.googleapis.com/upload?upload_id=${secret}`,
    encryptedCredentials: secret, youtubeVideoId: 'PRIVATE_VIDEO_ID',
    followups: { finalArtifact: 'succeeded', thumbnail: 'uncertain', captions: 'pending', ownerToken: secret },
  };
  const expected = { phase: 'uploading', knownIdPresent: true, ambiguous: false, fingerprintMatches: null,
    ownershipActive: true, followups: { finalArtifact: 'succeeded', thumbnail: 'uncertain', captions: 'pending' } };
  beforeAll(async () => {
    await prisma.tenant.create({ data: { id: tenantId, name: 'Summary fixture tenant' } });
    await prisma.channel.create({ data: { id: channelId, tenantId, name: 'Summary fixture', nicheDescription: 'Synthetic only' } });
    await prisma.user.createMany({ data: [
      { id: ownerId, tenantId, email: `${ownerId}@fixture.test`, role: 'owner' },
      { id: adminId, tenantId, email: `${adminId}@fixture.test`, role: 'owner', isPlatformAdmin: true },
    ] });
    await prisma.pipelineRun.createMany({ data: [
      { id: activeId, tenantId, channelId, briefText: secret, status: 'needs_attention', currentStage: 'publishing', publishingRecovery: receipt,
        creationOptions: { maxCostUsd: 2.25, manualRetries: { video_generation: 3 } } },
      { id: legacyId, tenantId, channelId, briefText: secret },
      { id: invalidId, tenantId, channelId, briefText: secret, publishingRecovery: { ...receipt, version: 99 } },
    ] });
  });
  afterAll(async () => {
    await prisma.adminAuditLog.deleteMany({ where: { tenantId } });
    await prisma.pipelineRun.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.channel.delete({ where: { id: channelId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
  });
  it('returns only safe state through the existing Admin read and CLI, even without a video attempt', async () => {
    const result = await ops().get({ runId: activeId });
    expect(result.publishingSummary).toEqual(expected);
    expect(result.stages).toEqual([]);
    expect(sanitizeStructure(result, activeId).publishingSummary).toEqual(expected);
    const text = JSON.stringify(result);
    for (const value of [secret, 'PRIVATE_VIDEO_ID', 'publishingRecovery', 'sessionUri', 'sessionCiphertext',
      'encryptedCredentials', 'ownerToken', 'ownerEpoch', 'leaseUntil', 'upload_id', 'https://']) expect(text).not.toContain(value);
  });
  it('preserves old rows and scopes each summary to its requested run', async () => {
    const legacy = await ops().get({ runId: legacyId });
    expect(legacy.publishingSummary).toEqual({ phase: null, knownIdPresent: false, ambiguous: false,
      fingerprintMatches: null, ownershipActive: false, followups: null });
    expect(legacy.run.id).toBe(legacyId);
    expect((await ops().get({ runId: activeId })).publishingSummary).toEqual(expected);
    expect((await ops().get({ runId: invalidId })).publishingSummary).toBeNull();
  });
  it('keeps existing Admin authorization and unknown-run/UUID errors', async () => {
    await expect(session(ownerId).get({ runId: activeId })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await session(adminId).get({ runId: activeId })).publishingSummary).toEqual(expected);
    await expect(ops().get({ runId: randomUUID() })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(ops().get({ runId: '../another-run' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
  it('does not write receipts, claims, retry counters, budgets, run state or content audits', async () => {
    const before = await prisma.pipelineRun.findUniqueOrThrow({ where: { id: activeId } });
    const audits = await prisma.adminAuditLog.count({ where: { tenantId } });
    await ops().get({ runId: activeId }); await ops().get({ runId: legacyId }); await ops().get({ runId: invalidId });
    expect(await prisma.pipelineRun.findUniqueOrThrow({ where: { id: activeId } })).toEqual(before);
    expect(await prisma.adminAuditLog.count({ where: { tenantId } })).toBe(audits);
  });
});
