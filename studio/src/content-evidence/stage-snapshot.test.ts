import { expect, it } from 'vitest';
import { buildEvidencePacket, evidenceRef } from './packet';
import { generationEvidenceSnapshot, reviewEvidenceSnapshot } from './stage-snapshot';

const source = { briefText: 'A carefully hedged fact.', factPolicy: 'brief-plus-common' as const,
  sources: ['https://example.test/one'] };

it('pins the first generation packet across retry and restart despite changed defaults', () => {
  const first = generationEvidenceSnapshot({ ...source, videoKind: 'short' });
  const retried = generationEvidenceSnapshot({ ...source, briefText: 'new profile brief', factPolicy: 'brief-only',
    sources: ['https://example.test/new'], previousInput: { evidence: first.evidence },
    previousOutput: { evidenceRef: evidenceRef(first.evidence!) }, videoKind: 'short' });
  expect(retried.evidence).toEqual(first.evidence);
  expect(retried.briefText).toBe(source.briefText);
  expect(reviewEvidenceSnapshot({ evidence: first.evidence }, { evidenceRef: evidenceRef(first.evidence!) }).evidence).toEqual(first.evidence);
});

it('pins long-form facts-only policy and citation-only sources', () => {
  const selected = generationEvidenceSnapshot({ ...source, videoKind: 'long' });
  expect(selected.evidence?.factPolicy).toBe('brief-only');
  expect(selected.evidence?.sources[0]).toMatchObject({ status: 'citation-only' });
});

it('fails a tampered stored packet or a mismatched generation output reference', () => {
  const packet = buildEvidencePacket(source);
  expect(() => generationEvidenceSnapshot({ ...source, previousInput: { evidence: { ...packet, briefText: 'tampered' } } })).toThrow(/hash/);
  expect(() => reviewEvidenceSnapshot({ evidence: packet }, { evidenceRef: { version: 1, hash: '0'.repeat(64) } })).toThrow(/reference/);
  expect(() => reviewEvidenceSnapshot({ evidence: packet, briefText: 'conflicting old brief' }, {})).toThrow(/brief conflicts/);
  expect(() => reviewEvidenceSnapshot({ briefText: source.briefText }, { evidenceRef: evidenceRef(packet) })).toThrow(/no stored packet/);
});

it('keeps old stored inputs without inventing a packet or newer policy', () => {
  const old = { briefText: 'old run brief', factPolicy: 'brief-only', videoKind: 'long', sources: ['old citation'] };
  const selected = generationEvidenceSnapshot({ ...source, previousInput: old, videoKind: 'long' });
  expect(selected).toMatchObject({ briefText: 'old run brief', factPolicy: 'brief-only', sources: ['old citation'], provenance: 'legacy-generation-input' });
  expect(selected.evidence).toBeUndefined();
  expect(reviewEvidenceSnapshot(old, {})).toMatchObject({ provenance: 'legacy-generation-input', briefText: 'old run brief' });
  expect(reviewEvidenceSnapshot({ briefText: 'old run brief', videoKind: 'long' }, {})).toMatchObject({ provenance: 'legacy-input-incomplete' });
});
