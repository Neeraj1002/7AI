import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublishingReceiptSchema, summarizePublishingRecovery } from '../run-pipeline/publishing-recovery';
import { projectPublishingSummary, sanitizePublishingSummary } from './publishing-summary';

const privateValue = 'PRIVATE_SESSION_CREDENTIAL_OWNER';
const receipt = {
  version: 1, revision: 7, phase: 'uploading', channelId: 'private-channel',
  fileSha256: 'private-file-hash', fileSize: 12, gate2Id: 'private-gate', metadataHash: 'private-metadata-hash',
  metadata: { title: privateValue, description: privateValue, tags: [privateValue], coverFrameTimestampRatio: 0.2 },
  ownerEpoch: 3, ownerToken: privateValue, leaseUntil: '2100-01-01T00:00:00.000Z',
  sessionCiphertext: privateValue, sessionUri: `https://www.googleapis.com/upload?upload_id=${privateValue}`,
  encryptedCredentials: privateValue, youtubeVideoId: 'private-video-id',
  followups: { finalArtifact: 'succeeded', thumbnail: 'uncertain', captions: 'pending', ownerToken: privateValue },
};
const keys = ['ambiguous', 'fingerprintMatches', 'followups', 'knownIdPresent', 'ownershipActive', 'phase'];
afterEach(() => vi.useRealTimers());

describe('Task 1 adapter for the actual Task 2 safe publishing contract', () => {
  it('preserves Task 2 semantics with exactly six fields and three safe follow-up states', () => {
    const summary = projectPublishingSummary(receipt);
    expect(summary).toEqual(summarizePublishingRecovery(PublishingReceiptSchema.parse(receipt)));
    expect(summary).toEqual({ phase: 'uploading', knownIdPresent: true, ambiguous: false,
      fingerprintMatches: null, ownershipActive: true,
      followups: { finalArtifact: 'succeeded', thumbnail: 'uncertain', captions: 'pending' } });
    expect(Object.keys(summary!).sort()).toEqual(keys);
    expect(Object.keys(summary!.followups!).sort()).toEqual(['captions', 'finalArtifact', 'thumbnail']);
    const text = JSON.stringify(summary);
    for (const value of [privateValue, 'private-video-id', 'private-channel', 'private-file-hash', 'private-metadata-hash',
      'sessionUri', 'sessionCiphertext', 'encryptedCredentials', 'ownerToken', 'ownerEpoch', 'leaseUntil', 'metadata', 'upload_id', 'https://'])
      expect(text).not.toContain(value);
    expect(Buffer.byteLength(text)).toBeLessThan(400);
  });
  it.each([null, undefined])('uses Task 2 legacy/no-receipt semantics for %s without claiming a verified fingerprint', value => {
    expect(projectPublishingSummary(value)).toEqual(summarizePublishingRecovery(null));
    expect(projectPublishingSummary(value)?.fingerprintMatches).toBeNull();
  });
  it.each([
    { ...receipt, version: 2 }, { ...receipt, phase: privateValue },
    { ...receipt, followups: { ...receipt.followups, thumbnail: privateValue } },
    { ...receipt, sessionCiphertext: undefined }, { ...receipt, metadata: null },
    { ownerToken: privateValue }, [], privateValue,
  ])('returns unavailable for malformed/unsupported receipts, never raw validation errors', value => {
    expect(projectPublishingSummary(value)).toBeNull();
  });
  it('reuses live/expired ownership and ambiguous-outcome rules without changing persisted state', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-18T00:00:00Z'));
    const expired = { ...receipt, phase: 'ambiguous', leaseUntil: '2026-10-17T00:00:00Z' };
    const before = JSON.stringify(expired);
    expect(projectPublishingSummary(expired)).toMatchObject({ ambiguous: true, ownershipActive: false, knownIdPresent: true, fingerprintMatches: null });
    expect(JSON.stringify(expired)).toBe(before);
    expect(projectPublishingSummary({ ...receipt, ownerToken: null })).toMatchObject({ ownershipActive: false });
  });
  it('drops injected fields again at the client boundary, including nested follow-up fields', () => {
    const safe = projectPublishingSummary(receipt)!;
    expect(sanitizePublishingSummary({ ...safe, sessionUrl: privateValue, encryptedCredentials: privateValue,
      ownerToken: privateValue, followups: { ...safe.followups, sessionCiphertext: privateValue } })).toEqual(safe);
  });
  it.each([undefined, null, { ...projectPublishingSummary(receipt), ownershipActive: privateValue },
    { ...projectPublishingSummary(receipt), followups: { captions: privateValue } },
    { ...projectPublishingSummary(receipt), phase: null },
    { ...projectPublishingSummary(receipt), followups: null },
    { ...summarizePublishingRecovery(null), knownIdPresent: true }])('keeps old/unavailable/malformed wire summaries unavailable', value => {
    expect(sanitizePublishingSummary(value)).toBeNull();
  });
});
