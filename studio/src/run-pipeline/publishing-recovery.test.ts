import { describe, expect, it } from 'vitest';
import { identityMatches, metadataFingerprint, recoverInterruptedFollowups, summarizePublishingRecovery, type PublishingReceipt } from './publishing-recovery';

const receipt: PublishingReceipt = {
  version: 1, revision: 7, phase: 'uploading', channelId: 'channel', fileSha256: 'hash',
  fileSize: 10, gate2Id: 'gate', metadataHash: 'metadata', metadata: { title: 'T', description: 'D', tags: ['x'], coverFrameTimestampRatio: 0.2 }, ownerEpoch: 3,
  ownerToken: 'private-token', leaseUntil: '2100-01-01T00:00:00.000Z',
  sessionCiphertext: 'private-session', uploadStarted: true,
  followups: { finalArtifact: 'pending', thumbnail: 'started', captions: 'uncertain' },
};
describe('safe publishing summary', () => {
  it('projects only safe state and compares the complete upload identity', () => {
    const identity = { channelId: 'channel', fileSha256: 'hash', fileSize: 10,
      gate2Id: 'gate', metadataHash: 'metadata', metadata: receipt.metadata };
    expect(identityMatches(receipt, identity)).toBe(true);
    expect(identityMatches(receipt, { ...identity, metadataHash: 'changed' })).toBe(false);
    const summary = summarizePublishingRecovery(receipt, identity, Date.parse('2026-10-15'));
    expect(summary).toEqual({ phase: 'uploading', knownIdPresent: false, ambiguous: false,
      fingerprintMatches: true, ownershipActive: true,
      followups: { finalArtifact: 'pending', thumbnail: 'started', captions: 'uncertain' } });
    expect(JSON.stringify(summary)).not.toContain('private');
  });
  it('retries a fixed-key copy and parks uncertain non-idempotent follow-ups', () => {
    expect(recoverInterruptedFollowups({ finalArtifact: 'started', thumbnail: 'started', captions: 'started' }))
      .toEqual({ finalArtifact: 'pending', thumbnail: 'uncertain', captions: 'uncertain' });
  });
  it('hashes metadata independently of JSONB object key order', () => {
    const base = { channelId: 'c', videoPath: 'unused', privacyStatus: 'private' as const,
      containsSyntheticMedia: false, selfDeclaredMadeForKids: false };
    const a = { title: 'T', description: 'D', tags: ['x'], coverFrameTimestampRatio: 0.2 };
    const b = { coverFrameTimestampRatio: 0.2, tags: ['x'], description: 'D', title: 'T' };
    expect(metadataFingerprint({ ...base, metadata: a })).toBe(metadataFingerprint({ ...base, metadata: b }));
  });
  it('reports ambiguity and expired ownership without leaking secrets', () => {
    const summary = summarizePublishingRecovery({ ...receipt, phase: 'ambiguous' },
      undefined, Date.parse('2200-01-01'));
    expect(summary.ambiguous).toBe(true);
    expect(summary.ownershipActive).toBe(false);
    expect(summary.fingerprintMatches).toBeNull();
  });
});
