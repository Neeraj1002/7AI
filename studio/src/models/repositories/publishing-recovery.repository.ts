import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma-client';
import { encryptRefreshToken } from '../credential-crypto';
import { identityMatches, PublishingReceiptSchema, recoverInterruptedFollowups, type PublishingReceipt, type ReceiptIdentity, type FollowupState } from '../../run-pipeline/publishing-recovery';

type RunRow = { id: string; channelId: string; status: string; publishingRecovery: unknown };
export type PublishingClaim = { kind: 'acquired'; receipt: PublishingReceipt; token: string }
  | { kind: 'busy' | 'ambiguous' | 'mismatch'; receipt: PublishingReceipt };
const LEASE_MS = 15 * 60_000;
async function lockedRun(tx: Prisma.TransactionClient, runId: string): Promise<RunRow> {
  const rows = await tx.$queryRawUnsafe<RunRow[]>(
    'SELECT id, "channelId", status, "publishingRecovery" FROM "pipeline_runs" WHERE id = $1::uuid FOR UPDATE', runId);
  if (!rows[0]) throw new Error('Publishing run was not found');
  return rows[0];
}
function asReceipt(raw: unknown): PublishingReceipt | null {
  if (raw == null) return null;
  const parsed = PublishingReceiptSchema.safeParse(raw);
  if (!parsed.success) throw new Error('Invalid or unsupported publishing receipt; upload blocked');
  return parsed.data;
}
async function save(tx: Prisma.TransactionClient, runId: string, receipt: PublishingReceipt): Promise<void> {
  await tx.pipelineRun.update({ where: { id: runId }, data: { publishingRecovery: receipt as unknown as Prisma.InputJsonValue } });
}
function bump(receipt: PublishingReceipt, patch: Partial<PublishingReceipt>): PublishingReceipt {
  return { ...receipt, ...patch, revision: receipt.revision + 1 };
}
export async function readPublishingReceipt(runId: string): Promise<PublishingReceipt | null> {
  const row = await prisma.pipelineRun.findUnique({ where: { id: runId }, select: { publishingRecovery: true } });
  return asReceipt(row?.publishingRecovery);
}
export async function claimPublishing(runId: string, identity: ReceiptIdentity, currentStageId?: string): Promise<PublishingClaim> {
  return prisma.$transaction(async tx => {
    const row = await lockedRun(tx, runId);
    if (row.channelId !== identity.channelId) throw new Error('Publishing channel mismatch');
    if (row.status !== 'running') throw new Error('Publishing run is no longer running');
    let receipt = asReceipt(row.publishingRecovery);
    if (!receipt) {
      const stages = await tx.pipelineStage.findMany({ where: { pipelineRunId: runId, stageName: 'publishing' },
        select: { id: true, status: true, output: true } });
      const ids = [...new Set(stages.map(s => (s.output as { youtubeVideoId?: unknown } | null)?.youtubeVideoId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0))];
      const unresolved = stages.some(s => s.id !== currentStageId && s.status !== 'pending'
        && !(s.output as { youtubeVideoId?: string } | null)?.youtubeVideoId
        && (s.output as { uploadNotStarted?: boolean } | null)?.uploadNotStarted !== true);
      const ambiguous = ids.length > 1 || unresolved;
      receipt = { version: 1, revision: 0, phase: ambiguous ? 'ambiguous' : ids.length ? 'uploaded' : 'prepared',
        ...identity, ownerEpoch: 0, ownerToken: null, leaseUntil: null,
        ...(ids.length === 1 && { youtubeVideoId: ids[0], uploadedAt: new Date().toISOString() }),
        followups: { finalArtifact: 'pending', thumbnail: 'pending', captions: 'pending' } };
      await save(tx, runId, receipt);
    }
    if (!identityMatches(receipt, identity)) return { kind: 'mismatch', receipt };
    if (receipt.phase === 'ambiguous') return { kind: 'ambiguous', receipt };
    if (receipt.ownerToken && receipt.leaseUntil && Date.parse(receipt.leaseUntil) > Date.now())
      return { kind: 'busy', receipt };
    // An expired owner can only recover the same durable session. No new insertion is allowed.
    if (receipt.uploadStarted && !receipt.youtubeVideoId && !receipt.sessionCiphertext) {
      receipt = bump(receipt, { phase: 'ambiguous', ownerToken: null, leaseUntil: null });
      await save(tx, runId, receipt);
      return { kind: 'ambiguous', receipt };
    }
    const token = randomUUID();
    receipt = bump(receipt, { ownerToken: token, ownerEpoch: receipt.ownerEpoch + 1,
      leaseUntil: new Date(Date.now() + LEASE_MS).toISOString(),
      followups: recoverInterruptedFollowups(receipt.followups) });
    await save(tx, runId, receipt);
    return { kind: 'acquired', receipt, token };
  });
}
export async function mutatePublishingReceipt(
  runId: string, token: string, change: (receipt: PublishingReceipt) => Partial<PublishingReceipt>,
): Promise<PublishingReceipt> {
  return prisma.$transaction(async tx => {
    const receipt = asReceipt((await lockedRun(tx, runId)).publishingRecovery);
    if (!receipt || receipt.ownerToken !== token || !receipt.leaseUntil || Date.parse(receipt.leaseUntil) <= Date.now())
      throw new Error('Publishing ownership changed; refusing stale side effect');
    const next = bump(receipt, change(receipt));
    await save(tx, runId, next);
    return next;
  });
}
export async function renewPublishing(runId: string, token: string): Promise<void> {
  await mutatePublishingReceipt(runId, token, () => ({
    leaseUntil: new Date(Date.now() + LEASE_MS).toISOString(),
  }));
}
export async function savePublishingSession(runId: string, token: string, uri: string): Promise<void> {
  await mutatePublishingReceipt(runId, token, receipt => {
    if (receipt.sessionCiphertext) throw new Error('Publishing session already exists');
    return { phase: 'session_ready', sessionCiphertext: encryptRefreshToken(uri), sessionCreatedAt: new Date().toISOString() };
  });
}
export async function observePublishingSuccess(runId: string, identity: ReceiptIdentity, youtubeVideoId: string): Promise<void> {
  const conflict = await prisma.$transaction(async tx => {
    const receipt = asReceipt((await lockedRun(tx, runId)).publishingRecovery);
    if (!receipt || !identityMatches(receipt, identity)) throw new Error('Publishing success identity mismatch');
    if (receipt.youtubeVideoId && receipt.youtubeVideoId !== youtubeVideoId) {
      await save(tx, runId, bump(receipt, { phase: 'ambiguous' }));
      return true;
    }
    await save(tx, runId, bump(receipt, { youtubeVideoId, uploadedAt: receipt.uploadedAt ?? new Date().toISOString(),
      phase: 'uploaded' }));
    return false;
  });
  if (conflict) throw new Error('Conflicting YouTube video IDs for one publishing run');
}
export async function parkPublishingAmbiguous(runId: string, token: string): Promise<void> {
  await prisma.$transaction(async tx => {
    const receipt = asReceipt((await lockedRun(tx, runId)).publishingRecovery);
    if (!receipt || receipt.youtubeVideoId || receipt.ownerToken !== token) return;
    await save(tx, runId, bump(receipt, { phase: 'ambiguous', ownerToken: null, leaseUntil: null }));
  });
}
export async function markFollowup(runId: string, token: string,
  name: keyof PublishingReceipt['followups'], state: FollowupState): Promise<void> {
  await mutatePublishingReceipt(runId, token, receipt => ({ phase: 'followups',
    followups: { ...receipt.followups, [name]: state } }));
}
export async function completePublishingReceipt(
  runId: string, token: string, tx: Prisma.TransactionClient,
): Promise<void> {
  const receipt = asReceipt((await lockedRun(tx, runId)).publishingRecovery);
  if (!receipt || receipt.ownerToken !== token || !receipt.youtubeVideoId)
    throw new Error('Publishing receipt owner or video ID changed before completion');
  await save(tx, runId, bump(receipt, { phase: 'complete', ownerToken: null, leaseUntil: null }));
}
export async function releasePublishing(runId: string, token: string, completed: boolean): Promise<void> {
  await mutatePublishingReceipt(runId, token, () => ({ ownerToken: null, leaseUntil: null,
    ...(completed && { phase: 'complete' as const }) }));
}
