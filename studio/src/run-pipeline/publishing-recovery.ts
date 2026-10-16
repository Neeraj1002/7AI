import { createHash } from 'node:crypto';
import { z } from 'zod';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { PublishingMetadataSchema, type UploadParams } from '../agents/publishing/types';

export type FollowupState = 'pending' | 'started' | 'succeeded' | 'failed' | 'uncertain';
export type ReceiptPhase = 'prepared' | 'session_ready' | 'uploading' | 'uploaded' | 'followups' | 'complete' | 'ambiguous';
export type PublishingReceipt = {
  version: 1; revision: number; phase: ReceiptPhase;
  channelId: string; fileSha256: string; fileSize: number; gate2Id: string; metadataHash: string;
  metadata: UploadParams['metadata']; chapterListIncluded?: boolean;
  ownerEpoch: number; ownerToken: string | null; leaseUntil: string | null;
  sessionCiphertext?: string; sessionCreatedAt?: string; uploadStarted?: boolean; confirmedOffset?: number;
  youtubeVideoId?: string; uploadedAt?: string;
  followups: { finalArtifact: FollowupState; thumbnail: FollowupState; captions: FollowupState };
};
const FollowupSchema = z.enum(['pending', 'started', 'succeeded', 'failed', 'uncertain']);
export const PublishingReceiptSchema = z.object({
  version: z.literal(1), revision: z.number().int().nonnegative(),
  phase: z.enum(['prepared', 'session_ready', 'uploading', 'uploaded', 'followups', 'complete', 'ambiguous']),
  channelId: z.string().min(1), fileSha256: z.string().min(1), fileSize: z.number().int().nonnegative(),
  gate2Id: z.string().min(1), metadataHash: z.string().min(1), metadata: PublishingMetadataSchema,
  chapterListIncluded: z.boolean().optional(), ownerEpoch: z.number().int().nonnegative(),
  ownerToken: z.string().nullable(), leaseUntil: z.string().nullable(),
  sessionCiphertext: z.string().optional(), sessionCreatedAt: z.string().optional(),
  uploadStarted: z.boolean().optional(), confirmedOffset: z.number().int().nonnegative().optional(),
  youtubeVideoId: z.string().min(1).optional(), uploadedAt: z.string().optional(),
  followups: z.object({ finalArtifact: FollowupSchema, thumbnail: FollowupSchema, captions: FollowupSchema }),
}).superRefine((value, context) => {
  if (['uploaded', 'followups', 'complete'].includes(value.phase) && !value.youtubeVideoId)
    context.addIssue({ code: 'custom', message: 'known-ID phase has no ID' });
  if ((value.phase === 'session_ready' || value.phase === 'uploading' || value.uploadStarted) && !value.sessionCiphertext)
    context.addIssue({ code: 'custom', message: 'upload phase has no durable session' });
});

export type ReceiptIdentity = Pick<PublishingReceipt, 'channelId' | 'fileSha256' | 'fileSize' | 'gate2Id' | 'metadataHash' | 'metadata' | 'chapterListIncluded'>;

export function metadataFingerprint(params: UploadParams): string {
  const value = {
    metadata: { title: params.metadata.title, description: params.metadata.description,
      tags: params.metadata.tags, coverFrameTimestampRatio: params.metadata.coverFrameTimestampRatio },
    privacyStatus: params.privacyStatus,
    containsSyntheticMedia: params.containsSyntheticMedia,
    selfDeclaredMadeForKids: params.selfDeclaredMadeForKids,
    categoryId: params.categoryId ?? null, defaultLanguage: params.defaultLanguage ?? null };
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
export async function approvedFileIdentity(path: string): Promise<{ fileSha256: string; fileSize: number }> {
  const fileSize = (await stat(path)).size;
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return { fileSha256: hash.digest('hex'), fileSize };
}
export function identityMatches(receipt: PublishingReceipt, identity: ReceiptIdentity): boolean {
  return receipt.channelId === identity.channelId && receipt.fileSha256 === identity.fileSha256
    && receipt.fileSize === identity.fileSize && receipt.gate2Id === identity.gate2Id
    && receipt.metadataHash === identity.metadataHash;
}
export function recoverInterruptedFollowups(followups: PublishingReceipt['followups']): PublishingReceipt['followups'] {
  return {
    finalArtifact: followups.finalArtifact === 'started' ? 'pending' : followups.finalArtifact,
    thumbnail: followups.thumbnail === 'started' ? 'uncertain' : followups.thumbnail,
    captions: followups.captions === 'started' ? 'uncertain' : followups.captions,
  };
}

// Safe for Task 1/Admin: never include OAuth/session/owner identity.
export function summarizePublishingRecovery(receipt: PublishingReceipt | null, identity?: ReceiptIdentity, now = Date.now()) {
  if (!receipt) return { phase: null, knownIdPresent: false, ambiguous: false, fingerprintMatches: null,
    ownershipActive: false, followups: null };
  return { phase: receipt.phase, knownIdPresent: Boolean(receipt.youtubeVideoId),
    ambiguous: receipt.phase === 'ambiguous', fingerprintMatches: identity ? identityMatches(receipt, identity) : null,
    ownershipActive: Boolean(receipt.ownerToken && receipt.leaseUntil && Date.parse(receipt.leaseUntil) > now),
    followups: { ...receipt.followups } };
}
